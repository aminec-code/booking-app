// ─────────────────────────────────────────────
//  CALENDAR.JS  —  Lógica de fechas y slots
// ─────────────────────────────────────────────

/**
 * Parsea 'YYYY-MM-DD' como fecha local (sin desfase UTC)
 */
function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Formatea un objeto Date como 'YYYY-MM-DD' (fecha local)
 */
function formatDateKey(date) {
  const y  = date.getFullYear();
  const m  = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Nombre del mes en español
 */
function monthName(date) {
  return date.toLocaleString('es-ES', { month: 'long' });
}

/**
 * Devuelve los próximos N días (incluyendo fines de semana) desde una fecha,
 * sin superar fechaMax. La disponibilidad real la gestiona GHL.
 * @param {Date} desde
 * @param {number} cantidad
 * @param {string} fechaMax — 'YYYY-MM-DD'
 * @returns {Date[]}
 */
function getNextDays(desde, cantidad, fechaMax) {
  const dias   = [];
  const limite = new Date(fechaMax + 'T23:59:59');
  const cursor = new Date(desde);
  cursor.setHours(0, 0, 0, 0);

  while (dias.length < cantidad && cursor <= limite) {
    dias.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

/**
 * Calcula la ventana de fechas disponibles para una prioridad,
 * expandiendo si no hay slots libres en la ventana inicial.
 * @param {string} prioridad — 'maxima' | 'media' | 'baja'
 * @returns {Promise<{ fechas: Date[], expandido: boolean, sinDisponibilidad?: boolean }>}
 */
async function getAvailableDatesConExpansion(prioridad) {
  const cfg = CONFIG.VENTANA_FECHAS[prioridad];

  const hoy   = new Date();
  hoy.setHours(0, 0, 0, 0);
  const inicio = new Date(cfg.fechaInicio + 'T00:00:00');
  const desde  = hoy > inicio ? hoy : inicio;

  let ventanaActual  = cfg.ventanaInicial;
  const maxExpansiones = 5;

  for (let intento = 0; intento <= maxExpansiones; intento++) {
    const fechas = getNextDays(desde, ventanaActual, cfg.fechaMax);

    if (fechas.length === 0) break;

    // Comprueba si al menos 1 fecha tiene slots libres
    for (const fecha of fechas) {
      const slots = await getAvailableSlotsForDate(formatDateKey(fecha));
      if (slots.some(s => s.available)) {
        return { fechas, expandido: intento > 0 };
      }
    }

    // Sin disponibilidad — expande (si expansion > 0)
    if (cfg.expansion === 0) break;   // ← no hay expansión, salir ya
    ventanaActual += cfg.expansion;
    if (ventanaActual > cfg.maxDias) break;
  }

  return { fechas: [], expandido: true, sinDisponibilidad: true };
}

/**
 * Genera todos los slots horarios para una fecha concreta (sin filtrar ocupados)
 * - Usa CONFIG.HORARIO salvo si hay excepción en CONFIG.HORARIO_EXCEPCIONES
 * @param {string} fechaKey — 'YYYY-MM-DD'
 * @returns {string[]}  — ['10:00', '10:30', ...]
 */
function getSlotsForDate(fechaKey) {
  const excepcion = CONFIG.HORARIO_EXCEPCIONES[fechaKey];
  const horario   = excepcion || CONFIG.HORARIO;

  const slots = [];
  const { start, end } = horario;
  const step     = CONFIG.SLOT_INTERVAL_MIN  || 60;  // intervalo entre slots
  const duration = CONFIG.SLOT_DURATION_MIN  || 45;  // duración de la cita

  for (let totalMin = start * 60; totalMin + duration <= end * 60; totalMin += step) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }

  return slots;
}

/**
 * Obtiene slots disponibles para una fecha (filtrando los ocupados vía GHL)
 * Si GHL falla → devuelve todos los slots del día (fallback graceful)
 * @param {string} fechaKey — 'YYYY-MM-DD'
 * @returns {Promise<{ time: string, available: boolean }[]>}
 */
async function getAvailableSlotsForDate(fechaKey) {
  const allSlots = getSlotsForDate(fechaKey);
  if (allSlots.length === 0) return [];

  let freeSlots = null;
  let ghlFailed = false;
  try {
    freeSlots = await ghlGetFreeSlots(fechaKey);
  } catch (err) {
    console.warn('[Calendar] GHL free-slots falló:', err.message);
    ghlFailed = true;
    freeSlots = null;
  }

  // Si GHL falló por error de red → marcar todos como NO disponibles (seguro)
  // y señalar que hubo un error para que el UI pueda mostrar un mensaje
  if (ghlFailed) {
    return allSlots.map(time => ({ time, available: false, ghlError: true }));
  }

  // Si GHL respondió pero no devolvió slots → el día no tiene disponibilidad
  if (freeSlots === null || freeSlots.length === 0) {
    return allSlots.map(time => ({ time, available: false }));
  }

  // GHL devolvió slots → filtramos contra la lista de libres
  const freeSet = new Set(freeSlots);

  return allSlots.map(time => ({
    time,
    available: freeSet.has(time),
  }));
}

// ── RENDERIZADO DEL CALENDARIO ───────────────

/**
 * Estado del calendario
 */
const calendarState = {
  currentMonth:   null,   // Date (primer día del mes visible)
  availableDates: [],     // Date[] — fechas disponibles
  selectedDate:   null,   // Date | null
  prioridad:      null,   // 'maxima' | 'media' | 'baja'
  onDateSelect:   null,
};

/**
 * Inicializa el calendario para una prioridad dada.
 * Muestra un spinner mientras calcula la ventana de fechas.
 * @param {string} prioridad — 'maxima' | 'media' | 'baja'
 * @param {Function} onDateSelect — callback(fechaKey: string)
 */
async function initCalendar(prioridad, onDateSelect) {
  calendarState.prioridad    = prioridad;
  calendarState.selectedDate = null;
  calendarState.onDateSelect = onDateSelect;

  // Spinner mientras calcula fechas
  const grid = document.getElementById('cal-grid');
  if (grid) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;display:flex;justify-content:center;padding:2rem 0">
        <div class="spinner spinner-blue"></div>
      </div>
    `;
  }

  const { fechas, sinDisponibilidad } = await getAvailableDatesConExpansion(prioridad);

  if (sinDisponibilidad) {
    renderSinDisponibilidad();
    return;
  }

  calendarState.availableDates = fechas;

  // Mes inicial: el mes de la primera fecha disponible
  if (fechas.length > 0) {
    const first = fechas[0];
    calendarState.currentMonth = new Date(first.getFullYear(), first.getMonth(), 1);
  } else {
    const now = new Date();
    calendarState.currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  renderCalendar();
  setupCalendarNavigation();
}

/**
 * Muestra el bloque de sin disponibilidad con botón de aviso
 */
function renderSinDisponibilidad() {
  const container = document.getElementById('slots-container');
  const grid      = document.getElementById('cal-grid');

  if (grid) grid.innerHTML = '';

  const target = container || grid;
  if (!target) return;

  target.classList.remove('hidden');
  target.innerHTML = `
    <div class="sin-disponibilidad">
      <p style="font-weight:600;margin-bottom:.5rem">
        Todos los horarios disponibles están completos.
      </p>
      <p style="color:var(--text2);font-size:.9rem;margin-bottom:1rem">
        Te contactaremos en las próximas horas para asignarte
        una fecha personalizada.
      </p>
      <button class="btn btn-primary" onclick="guardarSinDisponibilidad(this)">
        Avisarme cuando haya hueco
      </button>
    </div>
  `;
}

/**
 * Guarda el lead sin disponibilidad (sin fecha/hora, con tag especial)
 */
async function guardarSinDisponibilidad(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    await fetch('/api/booking', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact: {
          email:        bookingState.email,
          firstName:    bookingState.nombre,
          lastName:     bookingState.apellidos,
          phone:        bookingState.telefono,
          tags:         ['sin-disponibilidad'],
        },
        leadMeta: {
          quizScore:     bookingState.quizScore,
          prioridad:     bookingState.prioridad,
          quizResponses: bookingState.quizResponses,
          sinDisponibilidad: true,
        },
      }),
    });
    if (btn) btn.textContent = '✓ Te avisaremos pronto';
  } catch (_) {
    if (btn) { btn.disabled = false; btn.textContent = 'Reintentar'; }
  }
}

/**
 * Renderiza la cuadrícula del mes actual
 */
function renderCalendar() {
  const container = document.getElementById('cal-grid');
  if (!container) return;

  const { currentMonth, availableDates } = calendarState;
  const year  = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // Set de fechas disponibles como keys para búsqueda rápida
  const availableSet = new Set(availableDates.map(d => formatDateKey(d)));

  // Actualizar label del mes
  const label = document.getElementById('cal-month-label');
  if (label) {
    label.textContent = `${monthName(currentMonth)} ${year}`;
  }

  // Primer día de la semana (ajustado: lunes=0 ... domingo=6)
  const firstDay = new Date(year, month, 1);
  let startDow = firstDay.getDay(); // 0=dom, 1=lun, ...
  startDow = (startDow + 6) % 7;   // convertir a lunes=0

  // Total de días en el mes
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Días de hoy para comparar
  const todayKey = formatDateKey(new Date());

  // Construir celdas
  let html = '';

  // Cabeceras
  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  dayNames.forEach(name => {
    html += `<div class="cal-header-cell">${name}</div>`;
  });

  // Celdas vacías al principio
  for (let i = 0; i < startDow; i++) {
    html += `<div class="cal-day empty"></div>`;
  }

  // Días del mes
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isAvailable = availableSet.has(dateKey);
    const isToday     = dateKey === todayKey;
    const isSelected  = calendarState.selectedDate
      ? formatDateKey(calendarState.selectedDate) === dateKey
      : false;

    let cls = 'cal-day';
    if (!isAvailable)  cls += ' disabled';
    else if (isSelected) cls += ' available selected';
    else                 cls += ' available';
    if (isToday)       cls += ' today';

    const attr = isAvailable ? `data-date="${dateKey}"` : '';
    html += `<div class="${cls}" ${attr}>${day}</div>`;
  }

  container.innerHTML = html;

  // Event listeners en días disponibles
  container.querySelectorAll('.cal-day.available').forEach(cell => {
    cell.addEventListener('click', () => {
      const dateKey = cell.dataset.date;
      if (!dateKey) return;

      // Actualizar selección visual
      container.querySelectorAll('.cal-day.selected').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');

      calendarState.selectedDate = parseLocalDate(dateKey);
      if (calendarState.onDateSelect) calendarState.onDateSelect(dateKey);
    });
  });

  // Botones de navegación
  updateNavButtons();
}

/**
 * Configura los botones < > del calendario
 */
function setupCalendarNavigation() {
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');

  if (prevBtn) {
    prevBtn.onclick = () => {
      calendarState.currentMonth.setMonth(calendarState.currentMonth.getMonth() - 1);
      renderCalendar();
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      calendarState.currentMonth.setMonth(calendarState.currentMonth.getMonth() + 1);
      renderCalendar();
    };
  }
}

/**
 * Activa/desactiva los botones según si hay meses navegables
 */
function updateNavButtons() {
  const { currentMonth, availableDates } = calendarState;
  if (!availableDates.length) return;

  const minDate = availableDates[0];
  const maxDate = availableDates[availableDates.length - 1];

  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');

  if (prevBtn) {
    const prevMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    const minMonth  = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    prevBtn.disabled = prevMonth < minMonth;
  }

  if (nextBtn) {
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    const maxMonth  = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    nextBtn.disabled = nextMonth > maxMonth;
  }
}

// ── ZONAS HORARIAS ───────────────────────────

const TIMEZONES = [
  { value: 'Europe/Madrid',                  label: '🇪🇸 España — Madrid' },
  { value: 'Atlantic/Canary',                label: '🇮🇨 España — Canarias' },
  { value: 'Europe/London',                  label: '🇬🇧 Reino Unido' },
  { value: 'Europe/Paris',                   label: '🇫🇷 Francia / Alemania' },
  { value: 'America/Mexico_City',            label: '🇲🇽 México (Centro)' },
  { value: 'America/Cancun',                 label: '🇲🇽 México (Cancún / Este)' },
  { value: 'America/Bogota',                 label: '🇨🇴 Colombia' },
  { value: 'America/Lima',                   label: '🇵🇪 Perú / Ecuador' },
  { value: 'America/Santiago',               label: '🇨🇱 Chile' },
  { value: 'America/Argentina/Buenos_Aires', label: '🇦🇷 Argentina / Uruguay' },
  { value: 'America/Caracas',                label: '🇻🇪 Venezuela' },
  { value: 'America/La_Paz',                 label: '🇧🇴 Bolivia / Paraguay' },
  { value: 'America/Havana',                 label: '🇨🇺 Cuba' },
  { value: 'America/Santo_Domingo',          label: '🇩🇴 Rep. Dominicana' },
  { value: 'America/Panama',                 label: '🇵🇦 Panamá / Costa Rica / Guatemala' },
  { value: 'America/Tegucigalpa',            label: '🇭🇳 Honduras / El Salvador / Nicaragua' },
  { value: 'America/New_York',               label: '🇺🇸 USA — Este' },
  { value: 'America/Chicago',                label: '🇺🇸 USA — Centro' },
  { value: 'America/Denver',                 label: '🇺🇸 USA — Montaña' },
  { value: 'America/Los_Angeles',            label: '🇺🇸 USA — Pacífico' },
];

/**
 * Convierte un slot en hora Madrid a la zona horaria del usuario.
 * @param {string} fechaKey — 'YYYY-MM-DD'
 * @param {string} slotMadrid — 'HH:MM' en hora de Madrid
 * @param {string} targetTz — zona horaria destino
 * @returns {string} — 'HH:MM' en hora local del usuario
 */
function convertMadridSlotToTz(fechaKey, slotMadrid, targetTz) {
  if (!targetTz || targetTz === 'Europe/Madrid') return slotMadrid;
  try {
    const [hh, mm] = slotMadrid.split(':').map(Number);
    const isoMadrid = buildISOWithTimezone(fechaKey, hh, mm, 'Europe/Madrid');
    const date = new Date(isoMadrid);
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: targetTz,
    });
  } catch (_) {
    return slotMadrid;
  }
}

/**
 * Renderiza los slots para la fecha seleccionada
 * @param {string} fechaKey
 * @param {Function} onSlotSelect — callback(slotTime: string) — siempre hora Madrid
 */
async function renderSlots(fechaKey, onSlotSelect) {
  const container = document.getElementById('slots-container');
  if (!container) return;

  // Estado de carga
  container.innerHTML = `
    <div class="slots-loading">
      <div class="spinner spinner-blue"></div>
      <span>Cargando horarios disponibles…</span>
    </div>
  `;
  container.classList.remove('hidden');

  let slots;
  try {
    slots = await getAvailableSlotsForDate(fechaKey);
  } catch (err) {
    container.innerHTML = `
      <div class="banner banner-amber" style="margin-top:.5rem">
        <span class="banner-icon">⚠️</span>
        <span>No se pudieron cargar los horarios. Inténtalo de nuevo.</span>
      </div>
    `;
    return;
  }

  if (slots.length === 0) {
    container.innerHTML = `
      <div class="banner banner-neutral" style="margin-top:.5rem">
        <span class="banner-icon">📅</span>
        <span>No hay horarios configurados para este día.</span>
      </div>
    `;
    return;
  }

  // Si GHL falló, mostrar mensaje de error con botón de reintento
  const hasGhlError = slots.some(s => s.ghlError);
  if (hasGhlError) {
    container.innerHTML = `
      <div class="banner banner-amber" style="margin-top:.5rem">
        <span class="banner-icon">⚠️</span>
        <div>
          <span>No se pudo verificar la disponibilidad. </span>
          <button class="btn btn-ghost" style="margin-top:8px;font-size:.85rem"
                  onclick="renderSlots('${fechaKey}', onSlotSelected)">
            Reintentar
          </button>
        </div>
      </div>
    `;
    return;
  }

  // Si ningún slot está disponible
  const anyAvailable = slots.some(s => s.available);
  if (!anyAvailable) {
    container.innerHTML = `
      <div class="banner banner-neutral" style="margin-top:.5rem">
        <span class="banner-icon">📅</span>
        <span>No quedan horarios disponibles para este día. Prueba con otra fecha.</span>
      </div>
    `;
    return;
  }

  // Zona horaria activa
  const userTz     = (typeof bookingState !== 'undefined' && bookingState.zonaHoraria)
                     || Intl.DateTimeFormat().resolvedOptions().timeZone
                     || 'Europe/Madrid';
  const isMadrid   = userTz === 'Europe/Madrid';

  // Selector de zona horaria
  const tzOptions = TIMEZONES.map(tz =>
    `<option value="${tz.value}" ${tz.value === userTz ? 'selected' : ''}>${tz.label}</option>`
  ).join('');

  // Si la zona no está en la lista, añadirla
  const inList = TIMEZONES.some(t => t.value === userTz);
  const extraOption = !inList
    ? `<option value="${userTz}" selected>${userTz}</option>`
    : '';

  // Título de la fecha
  const dateObj = parseLocalDate(fechaKey);
  const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
  const dateStr = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

  let html = `
    <div class="tz-selector-wrap">
      <label class="tz-label">🌍 Tu zona horaria</label>
      <div class="form-select-wrapper">
        <select class="form-select" id="tz-select" onchange="onTimezoneChange(this.value)">
          ${extraOption}${tzOptions}
        </select>
      </div>
      ${!isMadrid ? `<p class="tz-note">Los horarios se muestran en tu hora local. La cita se guarda en hora de Madrid.</p>` : ''}
    </div>
    <p class="slots-title">${dayName} ${dateStr}</p>
    <div class="slots-grid">
  `;

  slots.forEach(({ time, available }) => {
    if (!available) return;
    const localTime  = convertMadridSlotToTz(fechaKey, time, userTz);
    const showMadrid = !isMadrid && localTime !== time;
    html += `
      <div class="slot" data-time="${time}">
        <span class="slot-local">${localTime}</span>
        ${showMadrid ? `<span class="slot-madrid">Madrid: ${time}</span>` : ''}
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;

  // Restaurar slot seleccionado si existe
  if (typeof bookingState !== 'undefined' && bookingState.slotSeleccionado) {
    const prev = container.querySelector(`.slot[data-time="${bookingState.slotSeleccionado}"]`);
    if (prev) prev.classList.add('slot-selected');
  }

  // Event listeners
  container.querySelectorAll('.slot[data-time]').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.slot-selected').forEach(s => s.classList.remove('slot-selected'));
      el.classList.add('slot-selected');
      if (onSlotSelect) onSlotSelect(el.dataset.time); // siempre hora Madrid
    });
  });
}

/**
 * Genera la URL de Google Calendar para añadir la cita
 * @param {{ nombre, apellidos, fechaKey, hora }} datos
 * @returns {string} URL de Google Calendar
 */
function buildGoogleCalendarUrl({ nombre, apellidos, fechaKey, hora }) {
  const [hh, mm] = hora.split(':').map(Number);

  // Usar buildISOWithTimezone para obtener la hora correcta en Madrid
  const startISO = buildISOWithTimezone(fechaKey, hh, mm, 'Europe/Madrid');
  const endISO   = buildISOWithTimezone(fechaKey, hh, mm + CONFIG.SLOT_DURATION_MIN, 'Europe/Madrid');

  // Convertir a UTC para Google Calendar
  const startUTC = new Date(startISO);
  const endUTC   = new Date(endISO);

  const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const title   = encodeURIComponent(`${CONFIG.APPOINTMENT_TITLE || CONFIG.LAUNCH_NAME} — ${nombre} ${apellidos}`);
  const details = encodeURIComponent(`Cita reservada a través del sistema de agendamiento.`);
  const start   = fmt(startUTC);
  const end     = fmt(endUTC);

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&ctz=Europe/Madrid`;
}
