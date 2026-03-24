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

  // ── Recoger slots de TODAS las fechas en la respuesta ──
  // GHL puede devolver slots agrupados bajo múltiples claves de fecha
  // (ej: slots del día pedido + medianoche del siguiente)
  let rawSlots = [];
  if (Array.isArray(data?.slots)) {
    rawSlots = data.slots;
  } else if (Array.isArray(data)) {
    rawSlots = data;
  } else if (typeof data === 'object' && data !== null) {
    // Iterar todas las claves que parezcan fechas (YYYY-MM-DD)
    for (const key of Object.keys(data)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && Array.isArray(data[key]?.slots)) {
        rawSlots = rawSlots.concat(data[key].slots);
      }
    }
    // Fallback: _dates_ wrapper
    if (rawSlots.length === 0 && data?._dates_) {
      for (const key of Object.keys(data._dates_)) {
        if (Array.isArray(data._dates_[key]?.slots)) {
          rawSlots = rawSlots.concat(data._dates_[key].slots);
        }
      }
    }
  }

  if (rawSlots.length === 0) return [];

  // Parsear a HH:MM en hora Madrid y filtrar solo los que caen en el día pedido
  return rawSlots.map(slot => {
    const raw = typeof slot === 'object' ? (slot.startTime ?? slot.start) : slot;
    const ts  = typeof raw === 'number' ? raw : Date.parse(raw);
    if (isNaN(ts)) return null;
    const d = new Date(ts);
    // Verificar que la fecha en Madrid corresponde al día pedido
    const madridDate = d.toLocaleDateString('en-CA', { timeZone: CONFIG.TIMEZONE }); // YYYY-MM-DD
    if (madridDate !== fecha) return null; // Slot de otro día, ignorar
    return d.toLocaleTimeString('es-ES', {
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
async function ghlCreateOpportunity(contactId, _tier, nombre) {
  const body = {
    name:          nombre,
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

  const appointmentId   = data?.id || data?.event?.id || data?.appointment?.id;
  const assignedUserId  = data?.assignedUserId || data?.event?.assignedUserId || null;
  if (!appointmentId) throw new Error('No se recibió un appointmentId válido.');
  return { appointmentId, assignedUserId };
}

/**
 * Obtiene el nombre de un user/closer por su ID
 * @param {string|null} userId
 * @returns {Promise<string|null>}
 */
async function ghlGetUserName(userId) {
  if (!userId) return null;
  try {
    const response = await fetch(`/api/user/${userId}`);
    if (!response.ok) return null;
    const data = await response.json();
    const name = data?.name || [data?.firstName, data?.lastName].filter(Boolean).join(' ');
    return name || null;
  } catch (_) {
    return null;
  }
}

/**
 * Obtiene los appointments del calendario para el dashboard admin
 */
async function ghlGetAppointments() {
  // Rango: desde la fecha más temprana hasta la más tardía de VENTANA_FECHAS
  let minDate = null;
  let maxDate = null;
  Object.values(CONFIG.VENTANA_FECHAS || {}).forEach(cfg => {
    if (!minDate || cfg.fechaInicio < minDate) minDate = cfg.fechaInicio;
    if (!maxDate || cfg.fechaMax    > maxDate) maxDate = cfg.fechaMax;
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

/**
 * Flujo completo de reserva en un único endpoint
 * Llama a POST /api/booking → contact upsert + opportunity + appointment
 * @param {object} datos — bookingState completo
 * @returns {{ contactId, opportunityId, appointmentId, assignedUserId }}
 */
async function ghlSubmitBooking(datos) {
  const tag = CONFIG.SCORING?.tags_ghl?.[datos.prioridad] || 'Estandar';

  // ── Calcular ISO de inicio y fin de la cita ──
  const [hh, mm] = datos.slotSeleccionado.split(':').map(Number);
  const startISO = buildISOWithTimezone(datos.fechaSeleccionada, hh, mm,                         CONFIG.TIMEZONE);
  const endISO   = buildISOWithTimezone(datos.fechaSeleccionada, hh, mm + CONFIG.SLOT_DURATION_MIN, CONFIG.TIMEZONE);

  // ── Estructura que espera server.js POST /api/booking ──
  const body = {
    contact: {
      email:        datos.email,
      firstName:    datos.nombre,
      lastName:     datos.apellidos,
      phone:        datos.telefono,
      tags:         [tag],
      customFields: buildCustomFields(datos),
    },
    opportunity: {
      name: `${datos.nombre} ${datos.apellidos}`,
    },
    appointment: {
      startTime:        startISO,
      endTime:          endISO,
      selectedTimezone: datos.zonaHoraria || CONFIG.TIMEZONE,
      title:            CONFIG.APPOINTMENT_TITLE || `Auditoría · ${CONFIG.LAUNCH_NAME}`,
    },
    leadMeta: {
      email:         datos.email,
      prioridad:     datos.prioridad,
      quizScore:     datos.quizScore,
      quizResponses: datos.quizResponses,
      zonaHoraria:   datos.zonaHoraria || CONFIG.TIMEZONE,
      fecha:         datos.fechaSeleccionada,
      hora:          datos.slotSeleccionado,
      notaLead:      buildNotaLead(datos),
    },
  };

  ghlLog('submitBooking body:', body);

  const response = await fetchWithRetry('/api/booking', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const data = await response.json();
  ghlLog('submitBooking response:', data);

  if (!data?.success) {
    const code = data?.errorStep
      ? `${data.errorStep.toUpperCase()}_${data.errorCode || 'ERROR'}`
      : String(response.status);
    const msg  = data?.errorMessage || data?.error || 'Error desconocido al procesar la reserva.';
    const err  = new Error(msg);
    err.errorCode = code;
    throw err;
  }

  return {
    contactId:      data.contactId,
    opportunityId:  data.opportunityId,
    appointmentId:  data.appointmentId,
    assignedUserId: data.assignedUserId,
  };
}

// ── HELPERS ───────────────────────────────────

/**
 * Genera el texto completo de la nota que se guardará en el contacto de GHL
 */
function buildNotaLead(datos) {
  const prioridadLabel = CONFIG.SCORING?.etiquetas?.[datos.prioridad] || datos.prioridad || '—';
  const scoreNorm      = datos.quizScore != null ? `${datos.quizScore}/100` : '—';
  const instagram      = datos.instagram ? `@${datos.instagram}` : '—';
  const tz             = datos.zonaHoraria || CONFIG.TIMEZONE;

  // Respuestas del quiz mapeadas a labels legibles
  const quizLines = (CONFIG.QUIZ || []).map((q, i) => {
    const respValue = datos.quizResponses?.[q.id];
    const opcion    = q.opciones?.find(o => o.value === respValue);
    const label     = opcion ? opcion.label : (respValue || '—');
    return `  Q${i + 1} - ${q.pregunta}\n        → ${label}`;
  }).join('\n');

  return [
    `📋 LEAD QUALIFICADO — ${CONFIG.APPOINTMENT_TITLE || 'Auditoría FOCUS Consulting'}`,
    '',
    `👤 Nombre:    ${datos.nombre} ${datos.apellidos}`,
    `📧 Email:     ${datos.email}`,
    `📱 Teléfono:  ${datos.telefono}`,
    `📸 Instagram: ${instagram}`,
    '',
    `🎯 Prioridad: ${prioridadLabel}`,
    `📊 Score:     ${scoreNorm}`,
    '',
    `📅 Cita agendada:`,
    `     Fecha:            ${datos.fechaSeleccionada}`,
    `     Hora (Madrid):    ${datos.slotSeleccionado}`,
    `     Zona del cliente: ${tz}`,
    '',
    `❓ Respuestas del quiz:`,
    quizLines,
    '',
    `⏱ Registrado: ${new Date().toLocaleString('es-ES', { timeZone: CONFIG.TIMEZONE })} (Madrid)`,
  ].join('\n');
}

function buildCustomFields(datos) {
  // En v2 los valores vienen de quizResponses en lugar de campos libres
  const inversion = datos.quizResponses?.q5_inversion || datos.inversion || '';
  const negocio   = datos.quizResponses?.q1_negocio   || datos.negocio   || '';
  const ticket    = datos.quizResponses?.q2_ticket     || datos.ticketMedio || '';

  return [
    { id: CONFIG.GHL_CUSTOM_FIELD_INVERSION, value: inversion },
    { id: CONFIG.GHL_CUSTOM_FIELD_NEGOCIO,   value: negocio   },
    { id: CONFIG.GHL_CUSTOM_FIELD_TICKET,    value: ticket    },
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

  let diffMin = (tzHour - hour) * 60 + (tzMinute - minute);
  if (diffMin >  720) diffMin -= 1440;
  if (diffMin < -720) diffMin += 1440;

  const sign   = diffMin >= 0 ? '+' : '-';
  const absMin = Math.abs(diffMin);
  const offH   = pad(Math.floor(absMin / 60));
  const offM   = pad(absMin % 60);

  return `${fecha}T${pad(hour)}:${pad(minute)}:00${sign}${offH}:${offM}`;
}

function pad(n) { return String(n).padStart(2, '0'); }
