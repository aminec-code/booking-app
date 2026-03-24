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
    ? `${leadMeta.email} | ${leadMeta.prioridad || leadMeta.tier || '?'} | ${leadMeta.fecha || '?'} | ${leadMeta.hora || '?'}`
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
    prioridad:      data.prioridad       || null,
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

// config.js generado dinámicamente — antes de express.static para evitar que sirva el del disco
app.get('/config.js', (req, res) => {
  const CONFIG = {
    GHL_CUSTOM_FIELD_INVERSION: '9CVYG4HZq0U94kCtvzMh',
    GHL_CUSTOM_FIELD_NEGOCIO:   'h1zj59J1oZOOZNyXYp1v',
    GHL_CUSTOM_FIELD_TICKET:    'IUsjyqxqr9hkaohb9q3e',
    LAUNCH_NAME:        'Lanzamiento Marzo 2026',
    APPOINTMENT_TITLE:  'Auditoría FOCUS Consulting',
    TIMEZONE:          'Europe/Madrid',
    SLOT_DURATION_MIN:  45,
    SLOT_INTERVAL_MIN:  60,
    BUFFER_BEFORE_MIN:  25,
    BUFFER_AFTER_MIN:   25,
    SCORING: {
      umbrales: { maxima: 75, media: 50 },
      etiquetas: { maxima: 'Máxima Prioridad', media: 'Prioridad Media', baja: 'Baja Prioridad' },
      tags_ghl:  { maxima: 'Maxima-Prioridad', media: 'Media-Prioridad', baja: 'Baja-Prioridad' },
    },
    VENTANA_FECHAS: {
      maxima: { ventanaInicial: 4, expansion: 2, maxDias: 14, fechaInicio: '2026-03-24', fechaMax: '2026-04-06' },
      media:  { ventanaInicial: 7, expansion: 3, maxDias: 21, fechaInicio: '2026-03-24', fechaMax: '2026-04-13' },
      baja:   { ventanaInicial: 14, expansion: 5, maxDias: 30, fechaInicio: '2026-04-02', fechaMax: '2026-04-20' },
    },
    HORARIO: { start: 10, end: 22 },
    HORARIO_EXCEPCIONES: { '2026-03-24': { start: 22, end: 24 } },
    QUIZ: [
      { id: 'q1_negocio',    pregunta: '¿A qué te dedicas exactamente?',                          tipo: 'radio', opciones: [{ label: 'E-commerce / tienda online', value: 'ecommerce', score: 25 }, { label: 'Servicios / consultoría', value: 'servicios', score: 20 }, { label: 'Producto digital / SaaS', value: 'saas', score: 30 }, { label: 'Otra', value: 'otra', score: 10 }] },
      { id: 'q2_ticket',     pregunta: '¿Cuál es tu ticket medio por cliente?',                   tipo: 'radio', opciones: [{ label: 'Más de 500€', value: '+500', score: 20 }, { label: '200€ – 500€', value: '200-500', score: 15 }, { label: '100€ – 200€', value: '100-200', score: 10 }, { label: 'Menos de 100€', value: '-100', score: 5 }] },
      { id: 'q3_margen',     pregunta: '¿Cuál es tu margen aproximado por venta?',                tipo: 'radio', opciones: [{ label: 'Alto (más del 40%)', value: 'alto', score: 15 }, { label: 'Medio (20% – 40%)', value: 'medio', score: 10 }, { label: 'Bajo (menos del 20%)', value: 'bajo', score: 5 }] },
      { id: 'q4_facturacion',pregunta: '¿Cuál es tu facturación anual aproximada?',               tipo: 'radio', opciones: [{ label: 'Más de 500.000€', value: '+500k', score: 25 }, { label: '200.000€ – 500.000€', value: '200-500k', score: 20 }, { label: '50.000€ – 200.000€', value: '50-200k', score: 15 }, { label: 'Menos de 50.000€', value: '-50k', score: 10 }] },
      { id: 'q5_inversion',  pregunta: '¿Cuánto podrías invertir al mes si fuera rentable?',     tipo: 'radio', opciones: [{ label: 'Más de 3.000€', value: '+3000', score: 30 }, { label: '1.000€ – 3.000€', value: '1000-3000', score: 25 }, { label: '300€ – 1.000€', value: '300-1000', score: 15 }, { label: '0€ – 300€', value: '0-300', score: 0 }] },
      { id: 'q6_frena',      pregunta: '¿Qué te frena más a la hora de escalar?',                 tipo: 'radio', opciones: [{ label: 'Falta de sistema / procesos', value: 'sistema', score: 25 }, { label: 'Falta de inversión en marketing', value: 'marketing', score: 25 }, { label: 'No sé por dónde empezar', value: 'inicio', score: 20 }, { label: 'Tiempo o recursos limitados', value: 'tiempo', score: 15 }] },
      { id: 'q7_sistema',    pregunta: '¿Tienes un sistema para gestionar tus clientes?',         tipo: 'radio', opciones: [{ label: 'Sí, uso un CRM profesional', value: 'crm', score: 20 }, { label: 'Sí, pero algo básico', value: 'basico', score: 15 }, { label: 'No tengo ninguno', value: 'no', score: 0 }] },
      { id: 'q8_tiempo',     pregunta: '¿En cuánto tiempo quieres empezar?',                      tipo: 'radio', opciones: [{ label: 'Ahora mismo', value: 'ahora', score: 30 }, { label: 'En el próximo mes', value: '1mes', score: 20 }, { label: 'En 3 meses', value: '3meses', score: 10 }, { label: 'Solo estoy explorando', value: 'explorando', score: 5 }] },
      { id: 'q9_decisor',    pregunta: '¿Eres tú quien toma la decisión de inversión?',           tipo: 'radio', opciones: [{ label: 'Sí, la decisión es mía', value: 'si', score: 20 }, { label: 'La comparto con otra persona', value: 'compartida', score: 10 }, { label: 'No, decide otra persona', value: 'no', score: 0 }] },
    ],
    SCORE_MAXIMO_POSIBLE: 215,
    TIERS: {
      vip: {
        label: 'Prioritario',
        inversiones: ['+3000', '1000-3000'],
        semanas: [
          { start: '2026-03-24', end: '2026-03-30' },
          { start: '2026-03-31', end: '2026-04-06' },
        ],
      },
      basico: {
        label: 'Estándar',
        inversiones: ['300-1000', '0-300'],
        semanas: [
          { start: '2026-04-02', end: '2026-04-13' },
          { start: '2026-04-14', end: '2026-04-20' },
        ],
      },
    },
    CONTACT_FALLBACK: {
      telefono:    '+34 600 000 000',
      email:       'hola@tudominio.com',
      calendarUrl: '',   // ← URL del calendario nativo GHL
    },
  };
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(`const CONFIG = ${JSON.stringify(CONFIG)};`);
});

// Archivos estáticos — después de /config.js para que no lo intercepte
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
  const timeout    = setTimeout(() => controller.abort(), 20_000);
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
      prioridad: leadMeta?.prioridad,
      quizScore: leadMeta?.quizScore,
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

    // ── Nota con todos los datos del lead (best-effort, no bloquea el flujo) ──
    if (leadMeta?.notaLead) {
      ghlFetch(`${GHL}/contacts/${contactId}/notes`, {
        method:  'POST',
        headers: ghlHeaders(),
        body:    JSON.stringify({ body: leadMeta.notaLead }),
      }).then(r => {
        if (r.ok) console.log(`${tag} Nota creada OK`);
        else r.text().then(t => console.warn(`${tag} Nota fallida (${r.status}):`, t.slice(0, 200)));
      }).catch(err => console.warn(`${tag} Nota error:`, err.message));
    }
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

      // ── ROLLBACK: Eliminar la oportunidad huérfana si la cita falló ──
      if (opportunityId) {
        console.log(`${tag} ROLLBACK — Eliminando oportunidad huérfana ${opportunityId}`);
        ghlFetch(`${GHL}/opportunities/${opportunityId}`, {
          method:  'DELETE',
          headers: ghlHeaders(),
        }).then(dr => {
          if (dr.ok) console.log(`${tag} ROLLBACK OK — Oportunidad ${opportunityId} eliminada`);
          else dr.text().then(t => console.warn(`${tag} ROLLBACK fallido (${dr.status}):`, t.slice(0, 200)));
        }).catch(err => console.warn(`${tag} ROLLBACK error:`, err.message));
      }

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

    // ── ROLLBACK: Eliminar la oportunidad huérfana si la cita falló ──
    if (opportunityId) {
      console.log(`${tag} ROLLBACK — Eliminando oportunidad huérfana ${opportunityId}`);
      ghlFetch(`${GHL}/opportunities/${opportunityId}`, {
        method:  'DELETE',
        headers: ghlHeaders(),
      }).then(dr => {
        if (dr.ok) console.log(`${tag} ROLLBACK OK — Oportunidad ${opportunityId} eliminada`);
        else dr.text().then(t => console.warn(`${tag} ROLLBACK fallido (${dr.status}):`, t.slice(0, 200)));
      }).catch(e => console.warn(`${tag} ROLLBACK error:`, e.message));
    }

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

  // ── Calcular offset de Madrid para la fecha pedida ──
  // Esto maneja correctamente el cambio DST (CET → CEST)
  const tz = process.env.TIMEZONE || 'Europe/Madrid';
  const refDate = new Date(`${fecha}T12:00:00Z`); // mediodía UTC como referencia
  const madridStr = refDate.toLocaleString('en-US', { timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  // Parsear para obtener el offset
  const [datePart, timePart] = madridStr.split(', ');
  const [mm, dd, yy] = datePart.split('/');
  const [hh, mi] = timePart.split(':');
  const madridRef = new Date(Date.UTC(+yy, +mm - 1, +dd, +hh % 24, +mi));
  const offsetMs = madridRef.getTime() - refDate.getTime();

  // Rango del día completo en hora Madrid, convertido a UTC epoch ms
  const dayStartMadrid = new Date(`${fecha}T00:00:00Z`).getTime() - offsetMs;
  const dayEndMadrid   = new Date(`${fecha}T23:59:59Z`).getTime() - offsetMs;

  const params = new URLSearchParams({
    startDate: String(dayStartMadrid),
    endDate:   String(dayEndMadrid),
    timezone:  tz,
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

// ── GET /api/admin/backup ─────────────────────────────
app.get('/api/admin/backup', requireAdmin, async (req, res) => {
  res.json(await readBackupDB());
});

// ── GET /api/admin/failed-bookings ────────────────────
app.get('/api/admin/failed-bookings', requireAdmin, async (req, res) => {
  const all = await readFailedBookings();
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
