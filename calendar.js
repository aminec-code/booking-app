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
 * Devuelve los próximos 4 días hábiles disponibles para un tier dado.
 * - Ventana rolling desde hoy (o desde la fecha mínima del tier)
 * - Excluye sábados (6) y domingos (0)
 * - Respeta fechas absolutas de inicio y fin por tier
 * @param {string} tier — 'vip' | 'basico'
 * @returns {Date[]}
 */
function getAvailableDates(tier) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let absoluteStart, absoluteEnd;

  if (tier === 'vip') {
    absoluteStart = parseLocalDate('2026-03-24');
    absoluteEnd   = parseLocalDate('2026-04-06');
  } else {
    absoluteStart = parseLocalDate('2026-04-02');
    absoluteEnd   = parseLocalDate('2026-04-13');
  }

  // La ventana empieza desde hoy o desde el inicio absoluto del tier
  const windowStart = today > absoluteStart ? today : absoluteStart;

  const available = [];
  const cur = new Date(windowStart);

  while (cur <= absoluteEnd && available.length < 4) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) { // excluir sábado y domingo
      available.push(new Date(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }

  return available;
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
  try {
    freeSlots = await ghlGetFreeSlots(fechaKey);
  } catch (err) {
    console.warn('[Calendar] GHL free-slots falló, usando fallback:', err.message);
    freeSlots = null;
  }

  // Si GHL falló o no devolvió nada → todos los slots libres (fallback graceful)
  if (freeSlots === null || freeSlots.length === 0) {
    return allSlots.map(time => ({ time, available: true }));
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
  availableDates: [],     // Date[] — fechas disponibles para el tier activo
  selectedDate:   null,   // Date | null
  tier:           null,   // 'vip' | 'basico'
};

/**
 * Inicializa el calendario para un tier dado
 * @param {string} tier
 * @param {Function} onDateSelect — callback(fechaKey: string)
 */
function initCalendar(tier, onDateSelect) {
  calendarState.tier           = tier;
  calendarState.availableDates = getAvailableDates(tier);
  calendarState.selectedDate   = null;
  calendarState.onDateSelect   = onDateSelect;

  // Mes inicial: el mes de la primera fecha disponible
  if (calendarState.availableDates.length > 0) {
    const first = calendarState.availableDates[0];
    calendarState.currentMonth = new Date(first.getFullYear(), first.getMonth(), 1);
  } else {
    const now = new Date();
    calendarState.currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  renderCalendar();
  setupCalendarNavigation();
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

/**
 * Renderiza los slots para la fecha seleccionada
 * @param {string} fechaKey
 * @param {Function} onSlotSelect — callback(slotTime: string)
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

  // Título de la fecha
  const dateObj = parseLocalDate(fechaKey);
  const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
  const dateStr = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

  let html = `<p class="slots-title">${dayName} ${dateStr}</p>`;
  html += `<div class="slots-grid">`;

  slots.forEach(({ time, available }) => {
    if (!available) return;  // slots ocupados no se muestran
    html += `<div class="slot" data-time="${time}">${time}</div>`;
  });

  html += `</div>`;
  container.innerHTML = html;

  // Event listeners en slots disponibles
  container.querySelectorAll('.slot[data-time]').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.slot-selected').forEach(s => s.classList.remove('slot-selected'));
      el.classList.add('slot-selected');
      if (onSlotSelect) onSlotSelect(el.dataset.time);
    });
  });
}

/**
 * Genera la URL de Google Calendar para añadir la cita
 * @param {{ nombre, apellidos, fechaKey, hora }} datos
 * @returns {string} URL de Google Calendar
 */
function buildGoogleCalendarUrl({ nombre, apellidos, fechaKey, hora }) {
  const [hh, mm]    = hora.split(':').map(Number);
  const startDate   = parseLocalDate(fechaKey);
  const endDate     = new Date(startDate.getTime());

  startDate.setHours(hh, mm, 0, 0);
  endDate.setHours(hh, mm + CONFIG.SLOT_DURATION_MIN, 0, 0);

  const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const title   = encodeURIComponent(`Cita · ${CONFIG.LAUNCH_NAME} — ${nombre} ${apellidos}`);
  const details = encodeURIComponent(`Cita reservada a través del sistema de agendamiento.`);
  const start   = fmt(startDate);
  const end     = fmt(endDate);

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}`;
}
