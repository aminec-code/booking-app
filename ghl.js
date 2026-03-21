// ─────────────────────────────────────────────
//  GHL.JS  —  Cliente del backend proxy
//  La API Key NUNCA llega al navegador
// ─────────────────────────────────────────────

const GHL_DEBUG = true;
function ghlLog(...args)  { if (GHL_DEBUG) console.log('[GHL]', ...args); }
function ghlWarn(...args) { if (GHL_DEBUG) console.warn('[GHL]', ...args); }

// ── ADMIN TOKEN ───────────────────────────────
// Se guarda tras el login y se envía en peticiones de admin

let _adminToken = sessionStorage.getItem('adminToken') || '';

function setAdminToken(token) {
  _adminToken = token;
  sessionStorage.setItem('adminToken', token);
}

function clearAdminToken() {
  _adminToken = '';
  sessionStorage.removeItem('adminToken');
}

// ── UTILIDADES INTERNAS ───────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch con reintentos automáticos x3 (1s, 2s, 4s)
 * Reintenta en 429 y 5xx. En 4xx falla inmediatamente.
 */
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  const delays = [1000, 2000, 4000];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    ghlLog(`→ ${options.method || 'GET'} ${url} (intento ${attempt + 1})`);

    let response;
    try {
      response = await fetch(url, options);
    } catch (networkErr) {
      ghlWarn('Error de red:', networkErr.message);
      if (attempt < maxRetries) { await sleep(delays[attempt]); continue; }
      throw new Error('Error de red: no se pudo conectar con el servidor.');
    }

    ghlLog(`← ${response.status} ${response.statusText}`);
    if (response.ok) return response;

    let errorBody = '';
    try { errorBody = await response.text(); } catch (_) {}
    ghlWarn(`Error ${response.status}:`, errorBody);

    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      await sleep(delays[attempt]);
      continue;
    }

    let msg = '';
    try { msg = JSON.parse(errorBody)?.message || ''; } catch (_) { msg = errorBody.slice(0, 200); }

    throw new Error(`Error ${response.status}${msg ? `: ${msg}` : ''}`);
  }
}

// ── FUNCIONES PÚBLICAS ────────────────────────

/**
 * Obtiene slots libres para una fecha concreta
 * @param {string} fecha — 'YYYY-MM-DD'
 * @returns {string[]} — horas libres 'HH:MM'
 */
async function ghlGetFreeSlots(fecha) {
  const response = await fetchWithRetry(`/api/slots?fecha=${fecha}`);
  const data     = await response.json();
  ghlLog('free-slots response:', data);

  let rawSlots = [];
  if (Array.isArray(data?.slots)) {
    rawSlots = data.slots;
  } else if (data?.[fecha]?.slots) {
    rawSlots = data[fecha].slots;
  } else if (data?._dates_?.[fecha]?.slots) {
    rawSlots = data._dates_[fecha].slots;
  } else if (Array.isArray(data)) {
    rawSlots = data;
  }

  if (rawSlots.length === 0) return [];

  return rawSlots.map(slot => {
    const raw = typeof slot === 'object' ? (slot.startTime ?? slot.start) : slot;
    const ts  = typeof raw === 'number' ? raw : Date.parse(raw);
    if (isNaN(ts)) return null;
    return new Date(ts).toLocaleTimeString('es-ES', {
      hour:     '2-digit',
      minute:   '2-digit',
      hour12:   false,
      timeZone: CONFIG.TIMEZONE,
    });
  }).filter(Boolean);
}

/**
 * Crea o actualiza un contacto (upsert por email)
 * @param {{ nombre, apellidos, email, telefono, tier, negocio, ticketMedio, inversion }} datos
 * @returns {string} contactId
 */
async function ghlUpsertContact(datos) {
  const tierConfig = CONFIG.TIERS[datos.tier];
  const tag        = tierConfig?.tag || datos.tier;

  const body = {
    email:        datos.email,
    firstName:    datos.nombre,
    lastName:     datos.apellidos,
    phone:        datos.telefono,
    tags:         [tag],
    customFields: buildCustomFields(datos),
  };

  ghlLog('upsertContact body:', body);

  const response = await fetchWithRetry('/api/contacts/upsert', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const data = await response.json();
  ghlLog('upsertContact response:', data);

  const contactId = data?.contact?.id || data?.id;
  if (!contactId) throw new Error('No se recibió un contactId válido.');
  return contactId;
}

/**
 * Crea una oportunidad en el pipeline
 * @param {string} contactId
 * @param {string} tier
 * @param {string} nombre — nombre completo
 * @returns {string} opportunityId
 */
async function ghlCreateOpportunity(contactId, tier, nombre) {
  const tierLabel = CONFIG.TIERS[tier]?.label || tier;

  const body = {
    name:          `${nombre} — ${tierLabel} · ${CONFIG.LAUNCH_NAME}`,
    contactId,
    status:        'open',
    monetaryValue: 0,
  };

  ghlLog('createOpportunity body:', body);

  const response = await fetchWithRetry('/api/opportunities', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const data = await response.json();
  ghlLog('createOpportunity response:', data);

  const opportunityId = data?.opportunity?.id || data?.id;
  if (!opportunityId) throw new Error('No se recibió un opportunityId válido.');
  return opportunityId;
}

/**
 * Crea una cita en el calendario
 * @param {string} contactId
 * @param {string} fecha — 'YYYY-MM-DD'
 * @param {string} hora  — 'HH:MM'
 * @returns {string} appointmentId
 */
async function ghlCreateAppointment(contactId, fecha, hora) {
  const [hh, mm] = hora.split(':').map(Number);
  const startISO = buildISOWithTimezone(fecha, hh, mm, CONFIG.TIMEZONE);
  const endISO   = buildISOWithTimezone(fecha, hh, mm + CONFIG.SLOT_DURATION_MIN, CONFIG.TIMEZONE);

  const body = {
    contactId,
    startTime:        startISO,
    endTime:          endISO,
    selectedTimezone: CONFIG.TIMEZONE,
    title:            `Auditoría · ${CONFIG.LAUNCH_NAME}`,
  };

  ghlLog('createAppointment body:', body);

  const response = await fetchWithRetry('/api/appointments', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const data = await response.json();
  ghlLog('createAppointment response:', data);

  const appointmentId = data?.id || data?.event?.id || data?.appointment?.id;
  if (!appointmentId) throw new Error('No se recibió un appointmentId válido.');
  return appointmentId;
}

/**
 * Obtiene los appointments del calendario para el dashboard admin
 */
async function ghlGetAppointments() {
  let minDate = null;
  let maxDate = null;
  Object.values(CONFIG.TIERS).forEach(tier => {
    tier.semanas.forEach(s => {
      if (!minDate || s.start < minDate) minDate = s.start;
      if (!maxDate || s.end   > maxDate) maxDate = s.end;
    });
  });

  if (!minDate) return [];

  const params = new URLSearchParams({
    startTime: `${minDate}T00:00:00.000Z`,
    endTime:   `${maxDate}T23:59:59.000Z`,
  });

  try {
    const response = await fetchWithRetry(`/api/admin/appointments?${params}`, {
      headers: { 'Authorization': `Bearer ${_adminToken}` },
    });
    const data = await response.json();
    return data?.events || data?.appointments || [];
  } catch (err) {
    ghlWarn('No se pudieron cargar los appointments:', err.message);
    return [];
  }
}

/**
 * Login del admin — devuelve true si la contraseña es correcta
 * @param {string} password
 * @returns {boolean}
 */
async function ghlAdminLogin(password) {
  try {
    const response = await fetch('/api/admin/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password }),
    });
    const data = await response.json();
    if (response.ok && data.token) {
      setAdminToken(data.token);
      return true;
    }
    return false;
  } catch (err) {
    ghlWarn('Error en login:', err.message);
    return false;
  }
}

// ── HELPERS ───────────────────────────────────

function buildCustomFields(datos) {
  return [
    { id: CONFIG.GHL_CUSTOM_FIELD_INVERSION, value: datos.inversion   },
    { id: CONFIG.GHL_CUSTOM_FIELD_NEGOCIO,   value: datos.negocio     },
    { id: CONFIG.GHL_CUSTOM_FIELD_TICKET,    value: datos.ticketMedio },
  ].filter(f => f.id && f.id !== '' && f.value && f.value !== '');
}

function buildISOWithTimezone(fecha, hour, minute, timezone) {
  hour   = hour + Math.floor(minute / 60);
  minute = minute % 60;

  const isoStr  = `${fecha}T${pad(hour)}:${pad(minute)}:00`;
  const utcDate = new Date(isoStr + 'Z');

  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const parts = Object.fromEntries(
    tzFormatter.formatToParts(utcDate).map(({ type, value }) => [type, value])
  );

  const tzHour   = parseInt(parts.hour,   10) % 24;
  const tzMinute = parseInt(parts.minute, 10);

  let diffMin = (hour - tzHour) * 60 + (minute - tzMinute);
  if (diffMin >  720) diffMin -= 1440;
  if (diffMin < -720) diffMin += 1440;

  const sign   = diffMin >= 0 ? '+' : '-';
  const absMin = Math.abs(diffMin);
  const offH   = pad(Math.floor(absMin / 60));
  const offM   = pad(absMin % 60);

  return `${fecha}T${pad(hour)}:${pad(minute)}:00${sign}${offH}:${offM}`;
}

function pad(n) { return String(n).padStart(2, '0'); }
