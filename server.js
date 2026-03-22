'use strict';
require('dotenv').config();

const express   = require('express');
const rateLimit = require('express-rate-limit');
const crypto    = require('crypto');
const path      = require('path');
const fs        = require('fs');

// ── ARCHIVOS DE DATOS ─────────────────────────
const LOGS_DIR             = path.join(__dirname, 'logs');
const ERRORS_LOG           = path.join(LOGS_DIR, 'errors.log');
const FAILED_BOOKINGS_FILE = path.join(__dirname, 'failed_bookings.json');
const BACKUP_DB_FILE       = path.join(__dirname, 'bookings_backup.json');

if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// ── LOGGING ───────────────────────────────────

function tsNow() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).replace('T', ' ');
}

function writeLog(step, status, ghlBody, leadMeta) {
  const meta = leadMeta
    ? `${leadMeta.email} | ${leadMeta.tier} | ${leadMeta.fecha || '?'} | ${leadMeta.hora || '?'}`
    : '—';
  const line = [
    `[${tsNow()}] ERROR en ${step}`,
    `GHL status: ${status}`,
    `GHL response: ${typeof ghlBody === 'string' ? ghlBody.slice(0, 500) : JSON.stringify(ghlBody)}`,
    `Lead: ${meta}`,
    '---',
  ].join('\n') + '\n\n';

  console.error(line);
  try { fs.appendFileSync(ERRORS_LOG, line); } catch (_) {}
}

function parseGHLError(bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    return parsed?.message || parsed?.msg || parsed?.error || bodyText.slice(0, 200);
  } catch (_) {
    return String(bodyText || '').slice(0, 200);
  }
}

// ── FAILED BOOKINGS ───────────────────────────
// Todas las operaciones de disco son async para no bloquear el event loop

async function readFailedBookings() {
  try {
    const content = await fs.promises.readFile(FAILED_BOOKINGS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (_) { return []; }
}

async function appendFailedBookingFull(data) {
  const existing = await readFailedBookings();
  const record = {
    id:             crypto.randomUUID(),
    timestamp:      new Date().toISOString(),
    email:          data.email          || null,
    telefono:       data.telefono       || null,
    nombre:         data.nombre         || null,
    apellidos:      data.apellidos      || null,
    tier:           data.tier           || null,
    fechaIntentada: data.fechaIntentada || null,
    horaIntentada:  data.horaIntentada  || null,
    errorStep:      data.errorStep      || null,
    errorCode:      data.errorCode      || 0,
    errorMessage:   data.errorMessage   || null,
    resuelto:       false,
  };
  existing.push(record);
  try { await fs.promises.writeFile(FAILED_BOOKINGS_FILE, JSON.stringify(existing, null, 2)); } catch (_) {}
  return record;
}

async function resolveFailedBookings(email, appointmentId, fecha, hora) {
  if (!email) return;
  const existing = await readFailedBookings();
  let changed = false;
  const updated = existing.map(r => {
    if (r.email === email && !r.resuelto) {
      changed = true;
      return { ...r, resuelto: true, resueltoCon: { appointmentId, fecha, hora, timestamp: new Date().toISOString() } };
    }
    return r;
  });
  if (changed) {
    try { await fs.promises.writeFile(FAILED_BOOKINGS_FILE, JSON.stringify(updated, null, 2)); } catch (_) {}
  }
}

// ── BACKUP DB ─────────────────────────────────

async function readBackupDB() {
  try {
    const content = await fs.promises.readFile(BACKUP_DB_FILE, 'utf8');
    return JSON.parse(content);
  } catch (_) { return []; }
}

async function upsertBackupDB(record) {
  const existing = await readBackupDB();
  const idx = record.appointmentId
    ? existing.findIndex(r => r.appointmentId === record.appointmentId)
    : -1;
  if (idx >= 0) existing[idx] = { ...existing[idx], ...record };
  else existing.push(record);
  try { await fs.promises.writeFile(BACKUP_DB_FILE, JSON.stringify(existing, null, 2)); } catch (_) {}
}

// ── EXPRESS ───────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const GHL     = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

function ghlHeaders() {
  return {
    'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
    'Content-Type':  'application/json',
    'Version':       VERSION,
  };
}

function ghlFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 10_000);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

function adminToken() {
  return crypto
    .createHmac('sha256', process.env.ADMIN_PASSWORD)
    .update('booking-app-admin')
    .digest('hex');
}

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token === adminToken()) return next();
  res.status(401).json({ error: 'No autorizado' });
}

// Rate limit por IP: 200 req / 15 min
// En STRESS_TEST_MODE se sube el límite porque todos los requests vienen de la misma IP (localhost)
const isStressMode = process.env.STRESS_TEST_MODE === 'true';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      isStressMode ? 10_000 : 200,
  message:  { error: 'Demasiadas peticiones. Espera un momento.' },
});

// Rate limit global: 2000 req / 15 min (5000 en stress test)
const globalLimiter = rateLimit({
  windowMs:     15 * 60 * 1000,
  max:          isStressMode ? 10_000 : 2000,
  keyGenerator: () => 'global',
  message:      { error: 'Servidor ocupado. Inténtalo en unos segundos.' },
});

app.use('/api/', globalLimiter);
app.use('/api/', limiter);

// ── STRESS TEST — array en memoria ────────────
const stressLog = [];
let stressLogTimer = null;

if (process.env.STRESS_TEST_MODE === 'true') {
  console.log('⚡ STRESS_TEST_MODE activo — las llamadas a GHL están simuladas');
  stressLogTimer = setInterval(() => {
    console.log(`[STRESS] Procesados hasta ahora: ${stressLog.length}`);
  }, 10_000);
}

// ══════════════════════════════════════════════
//  POST /api/booking — FLUJO COMPLETO (3 pasos)
// ══════════════════════════════════════════════
app.post('/api/booking', async (req, res) => {
  const { contact, opportunity, appointment, leadMeta } = req.body || {};
  const tag = `[${leadMeta?.email || '?'}]`;

  // ── STRESS TEST MODE — simula GHL sin llamadas reales ──
  if (process.env.STRESS_TEST_MODE === 'true') {
    if (!contact?.email || !appointment?.startTime) {
      return res.json({ success: false, errorStep: 'contact', errorCode: 400, errorMessage: 'Body inválido en stress test' });
    }
    const delay = 200 + Math.floor(Math.random() * 600);
    await new Promise(r => setTimeout(r, delay));
    const fakeId = () => Math.random().toString(36).slice(2, 10);
    const record = {
      email:     contact.email,
      tier:      leadMeta?.tier,
      fecha:     leadMeta?.fecha,
      hora:      leadMeta?.hora,
      ts:        Date.now(),
      delay,
    };
    stressLog.push(record);
    return res.json({
      success:        true,
      contactId:      `stress_c_${fakeId()}`,
      opportunityId:  `stress_o_${fakeId()}`,
      appointmentId:  `stress_a_${fakeId()}`,
      assignedUserId: `stress_u_${fakeId()}`,
    });
  }

  // ── PASO 1: Contacto ────────────────────────
  let contactId;
  try {
    console.log(`${tag} PASO 1 — Upsert contacto`);
    const r    = await ghlFetch(`${GHL}/contacts/upsert`, {
      method:  'POST',
      headers: ghlHeaders(),
      body:    JSON.stringify({ locationId: process.env.GHL_LOCATION_ID, ...contact }),
    });
    const bodyText = await r.text();
    if (!r.ok) {
      const msg = parseGHLError(bodyText);
      writeLog('CONTACTO', r.status, bodyText, leadMeta);
      appendFailedBookingFull({ ...leadMeta, fechaIntentada: leadMeta?.fecha, horaIntentada: leadMeta?.hora, errorStep: 'contact', errorCode: r.status, errorMessage: msg });
      return res.json({ success: false, errorStep: 'contact', errorCode: r.status, errorMessage: msg });
    }
    const data = JSON.parse(bodyText);
    contactId  = data?.contact?.id || data?.id;
    if (!contactId) throw new Error('GHL no devolvió contactId');
    console.log(`${tag} Contacto OK: ${contactId}`);
  } catch (err) {
    writeLog('CONTACTO', 0, err.message, leadMeta);
    appendFailedBookingFull({ ...leadMeta, fechaIntentada: leadMeta?.fecha, horaIntentada: leadMeta?.hora, errorStep: 'contact', errorCode: 0, errorMessage: err.message });
    return res.json({ success: false, errorStep: 'contact', errorCode: 0, errorMessage: err.message });
  }

  // ── PASO 2: Oportunidad (sin duplicados) ────
  let opportunityId;
  try {
    console.log(`${tag} PASO 2 — Buscar oportunidad existente`);
    const searchParams = new URLSearchParams({
      location_id: process.env.GHL_LOCATION_ID,
      contact_id:  contactId,
    });
    const searchR = await ghlFetch(`${GHL}/opportunities/search?${searchParams}`, { headers: ghlHeaders() });
    if (searchR.ok) {
      const searchData = await searchR.json();
      const existing   = (searchData.opportunities || []).find(o => o.pipelineId === process.env.GHL_PIPELINE_ID);
      if (existing) {
        console.log(`${tag} Oportunidad existente encontrada: ${existing.id} — actualizando`);
        await ghlFetch(`${GHL}/opportunities/${existing.id}`, {
          method:  'PUT',
          headers: ghlHeaders(),
          body:    JSON.stringify({ name: opportunity?.name, pipelineStageId: process.env.GHL_STAGE_ID }),
        });
        opportunityId = existing.id;
      }
    }

    if (!opportunityId) {
      console.log(`${tag} Creando nueva oportunidad`);
      const r        = await ghlFetch(`${GHL}/opportunities/`, {
        method:  'POST',
        headers: ghlHeaders(),
        body:    JSON.stringify({
          locationId:      process.env.GHL_LOCATION_ID,
          pipelineId:      process.env.GHL_PIPELINE_ID,
          pipelineStageId: process.env.GHL_STAGE_ID,
          contactId,
          status:          'open',
          monetaryValue:   0,
          ...opportunity,
        }),
      });
      const bodyText = await r.text();
      if (!r.ok) {
        const msg = parseGHLError(bodyText);
        writeLog('OPORTUNIDAD', r.status, bodyText, leadMeta);
        appendFailedBookingFull({ ...leadMeta, fechaIntentada: leadMeta?.fecha, horaIntentada: leadMeta?.hora, errorStep: 'opportunity', errorCode: r.status, errorMessage: msg });
        return res.json({ success: false, errorStep: 'opportunity', errorCode: r.status, errorMessage: msg });
      }
      const data    = JSON.parse(bodyText);
      opportunityId = data?.opportunity?.id || data?.id;
      console.log(`${tag} Oportunidad creada: ${opportunityId}`);
    }
  } catch (err) {
    writeLog('OPORTUNIDAD', 0, err.message, leadMeta);
    appendFailedBookingFull({ ...leadMeta, fechaIntentada: leadMeta?.fecha, horaIntentada: leadMeta?.hora, errorStep: 'opportunity', errorCode: 0, errorMessage: err.message });
    return res.json({ success: false, errorStep: 'opportunity', errorCode: 0, errorMessage: err.message });
  }

  // ── PASO 3: Cita ────────────────────────────
  let appointmentId, assignedUserId;
  try {
    console.log(`${tag} PASO 3 — Crear cita`);
    const r        = await ghlFetch(`${GHL}/calendars/events/appointments`, {
      method:  'POST',
      headers: ghlHeaders(),
      body:    JSON.stringify({
        calendarId: process.env.GHL_CALENDAR_ID,
        locationId: process.env.GHL_LOCATION_ID,
        contactId,
        ...appointment,
      }),
    });
    const bodyText = await r.text();
    if (!r.ok) {
      const msg = parseGHLError(bodyText);
      writeLog('CITA', r.status, bodyText, leadMeta);
      appendFailedBookingFull({ ...leadMeta, fechaIntentada: leadMeta?.fecha, horaIntentada: leadMeta?.hora, errorStep: 'appointment', errorCode: r.status, errorMessage: msg });
      return res.json({ success: false, errorStep: 'appointment', errorCode: r.status, errorMessage: msg });
    }
    const data     = JSON.parse(bodyText);
    appointmentId  = data?.id || data?.event?.id || data?.appointment?.id;
    assignedUserId = data?.assignedUserId || data?.event?.assignedUserId || null;
    if (!appointmentId) throw new Error('GHL no devolvió appointmentId');
    console.log(`${tag} Cita OK: ${appointmentId} | closer: ${assignedUserId}`);
  } catch (err) {
    writeLog('CITA', 0, err.message, leadMeta);
    appendFailedBookingFull({ ...leadMeta, fechaIntentada: leadMeta?.fecha, horaIntentada: leadMeta?.hora, errorStep: 'appointment', errorCode: 0, errorMessage: err.message });
    return res.json({ success: false, errorStep: 'appointment', errorCode: 0, errorMessage: err.message });
  }

  // ── ÉXITO ────────────────────────────────────
  resolveFailedBookings(leadMeta?.email, appointmentId, leadMeta?.fecha, leadMeta?.hora);
  console.log(`${tag} ✅ Booking completo`);

  return res.json({ success: true, contactId, opportunityId, appointmentId, assignedUserId });
});

// ── GET /api/slots?fecha=YYYY-MM-DD ──────────────────────
app.get('/api/slots', async (req, res) => {
  const { fecha } = req.query;
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'Parámetro fecha inválido' });
  }
  const dayStart = new Date(`${fecha}T00:00:00Z`).getTime();
  const dayEnd   = new Date(`${fecha}T23:59:59Z`).getTime();
  const params   = new URLSearchParams({
    startDate: String(dayStart),
    endDate:   String(dayEnd),
    timezone:  process.env.TIMEZONE || 'Europe/Madrid',
  });
  try {
    const r    = await ghlFetch(`${GHL}/calendars/${process.env.GHL_CALENDAR_ID}/free-slots?${params}`, { headers: ghlHeaders() });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/user/:userId ─────────────────────────────────
app.get('/api/user/:userId', async (req, res) => {
  try {
    const r    = await ghlFetch(`${GHL}/users/${req.params.userId}`, { headers: ghlHeaders() });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/save-booking ────────────────────────────────
app.post('/api/save-booking', (req, res) => {
  try {
    upsertBackupDB({ ...req.body, savedAt: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/health ───────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    uptime:    process.uptime(),
    version:   '1.2',
  });
});

// ── POST /api/admin/login ─────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password && password === process.env.ADMIN_PASSWORD) {
    res.json({ token: adminToken() });
  } else {
    res.status(401).json({ error: 'Contraseña incorrecta' });
  }
});

// ── GET /api/admin/appointments ───────────────────────────
app.get('/api/admin/appointments', requireAdmin, async (req, res) => {
  const params = new URLSearchParams({
    calendarId: process.env.GHL_CALENDAR_ID,
    locationId: process.env.GHL_LOCATION_ID,
    startTime:  req.query.startTime || '',
    endTime:    req.query.endTime   || '',
  });
  try {
    const r    = await ghlFetch(`${GHL}/calendars/events?${params}`, { headers: ghlHeaders() });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/backup ─────────────────────────────────
app.get('/api/admin/backup', requireAdmin, (req, res) => {
  res.json(readBackupDB());
});

// ── GET /api/admin/failed-bookings ────────────────────────
app.get('/api/admin/failed-bookings', requireAdmin, (req, res) => {
  const all = readFailedBookings();
  res.json({
    pendientes: all.filter(r => !r.resuelto),
    resueltos:  all.filter(r =>  r.resuelto),
  });
});

// ── GET /api/admin/users ──────────────────────────────────
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const params = new URLSearchParams({ locationId: process.env.GHL_LOCATION_ID });
  try {
    const r     = await ghlFetch(`${GHL}/users/?${params}`, { headers: ghlHeaders() });
    const data  = await r.json();
    const users = (data?.users || []).map(u => ({
      id:    u.id,
      name:  u.name || [u.firstName, u.lastName].filter(Boolean).join(' '),
      email: u.email,
    }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/admin/reassign ───────────────────────────────
app.put('/api/admin/reassign', requireAdmin, async (req, res) => {
  const { contactId, appointmentId, newOwnerId } = req.body || {};
  if (!contactId || !appointmentId || !newOwnerId) {
    return res.status(400).json({ error: 'contactId, appointmentId y newOwnerId son obligatorios' });
  }

  console.log(`Reasignando contacto ${contactId}, appointment ${appointmentId} → ${newOwnerId}`);

  const warnings = [];
  let contactOk = false;

  // (a) Cambiar owner del contacto
  try {
    const r = await ghlFetch(`${GHL}/contacts/${contactId}`, {
      method:  'PUT',
      headers: ghlHeaders(),
      body:    JSON.stringify({ assignedTo: newOwnerId }),
    });
    contactOk = r.ok;
    if (!r.ok) {
      const body = await r.text();
      writeLog('REASIGNAR_CONTACTO', r.status, body, { email: contactId });
    }
  } catch (err) {
    writeLog('REASIGNAR_CONTACTO', 0, err.message, { email: contactId });
  }

  if (!contactOk) {
    return res.status(400).json({ error: 'No se pudo actualizar el propietario del contacto en GHL.' });
  }

  // (b) Buscar oportunidades del contacto en el pipeline y reasignarlas
  try {
    const searchParams = new URLSearchParams({
      location_id: process.env.GHL_LOCATION_ID,
      contact_id:  contactId,
    });
    const searchR = await ghlFetch(`${GHL}/opportunities/search?${searchParams}`, { headers: ghlHeaders() });
    if (searchR.ok) {
      const searchData  = await searchR.json();
      const opps        = (searchData.opportunities || []).filter(o => o.pipelineId === process.env.GHL_PIPELINE_ID);
      for (const opp of opps) {
        await ghlFetch(`${GHL}/opportunities/${opp.id}`, {
          method:  'PUT',
          headers: ghlHeaders(),
          body:    JSON.stringify({ assignedTo: newOwnerId }),
        });
      }
      console.log(`Oportunidades reasignadas: ${opps.length}`);
    }
  } catch (err) {
    warnings.push(`Oportunidad no actualizada: ${err.message}`);
    writeLog('REASIGNAR_OPORTUNIDAD', 0, err.message, { email: contactId });
  }

  // (c) Cambiar assignee de la cita en el calendario
  try {
    const r = await ghlFetch(`${GHL}/calendars/events/appointments/${appointmentId}`, {
      method:  'PUT',
      headers: ghlHeaders(),
      body:    JSON.stringify({ assignedUserId: newOwnerId }),
    });
    if (!r.ok) {
      const body    = await r.text();
      const errMsg  = parseGHLError(body);
      warnings.push(`Cita no reasignada en calendario: ${errMsg}`);
      writeLog('REASIGNAR_CITA', r.status, body, { email: appointmentId });
    } else {
      console.log(`Cita ${appointmentId} reasignada OK`);
    }
  } catch (err) {
    warnings.push(`Error al reasignar cita: ${err.message}`);
    writeLog('REASIGNAR_CITA', 0, err.message, { email: appointmentId });
  }

  if (warnings.length > 0) {
    return res.json({ ok: true, warning: warnings.join(' | ') });
  }

  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor en http://localhost:${PORT}`));
