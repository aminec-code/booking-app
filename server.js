'use strict';
require('dotenv').config();

const express   = require('express');
const rateLimit = require('express-rate-limit');
const crypto    = require('crypto');
const path      = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname))); // sirve index.html, admin.html, etc.

const GHL     = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

function ghlHeaders() {
  return {
    'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
    'Content-Type':  'application/json',
    'Version':       VERSION,
  };
}

// Token de admin = HMAC-SHA256 de la contraseña (determinista, sin estado)
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

// Rate limit: 60 peticiones cada 15 min por IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Demasiadas peticiones. Espera un momento.' },
});
app.use('/api/', limiter);

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
    const r    = await fetch(`${GHL}/calendars/${process.env.GHL_CALENDAR_ID}/free-slots?${params}`, { headers: ghlHeaders() });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/contacts/upsert ─────────────────────────────
app.post('/api/contacts/upsert', async (req, res) => {
  try {
    const r = await fetch(`${GHL}/contacts/upsert`, {
      method:  'POST',
      headers: ghlHeaders(),
      body:    JSON.stringify({ locationId: process.env.GHL_LOCATION_ID, ...req.body }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/opportunities ───────────────────────────────
app.post('/api/opportunities', async (req, res) => {
  try {
    const r = await fetch(`${GHL}/opportunities/`, {
      method:  'POST',
      headers: ghlHeaders(),
      body:    JSON.stringify({
        locationId:      process.env.GHL_LOCATION_ID,
        pipelineId:      process.env.GHL_PIPELINE_ID,
        pipelineStageId: process.env.GHL_STAGE_ID,
        ...req.body,
      }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/appointments ────────────────────────────────
app.post('/api/appointments', async (req, res) => {
  try {
    const r = await fetch(`${GHL}/calendars/events/appointments`, {
      method:  'POST',
      headers: ghlHeaders(),
      body:    JSON.stringify({
        calendarId: process.env.GHL_CALENDAR_ID,
        locationId: process.env.GHL_LOCATION_ID,
        ...req.body,
      }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    const r    = await fetch(`${GHL}/calendars/events?${params}`, { headers: ghlHeaders() });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor en http://localhost:${PORT}`));
