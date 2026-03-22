// ─────────────────────────────────────────────
//  ADMIN.JS  —  Lógica del dashboard de métricas
// ─────────────────────────────────────────────

// ── ESTADO ───────────────────────────────────
const adminState = {
  authenticated: false,
  appointments:  [],
  activeSection: 'resumen',
  users:         [],   // closers disponibles
  filtered:      [],   // appointments tras aplicar filtros
};

// ── INIT ─────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});

function checkAuth() {
  const authed = sessionStorage.getItem('admin_authed') === '1';
  if (authed) {
    showDashboard();
  } else {
    showLogin();
  }
}

// ── LOGIN ─────────────────────────────────────

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('dashboard-screen').classList.add('hidden');

  const form  = document.getElementById('login-form');
  const input = document.getElementById('login-password');
  const error = document.getElementById('login-error');

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const pass    = input?.value || '';
    const btn     = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    const ok = await ghlAdminLogin(pass);

    if (ok) {
      sessionStorage.setItem('admin_authed', '1');
      adminState.authenticated = true;
      showDashboard();
    } else {
      if (error) error.textContent = 'Contraseña incorrecta. Inténtalo de nuevo.';
      input?.focus();
      if (btn) btn.disabled = false;
    }
  });
}

function logout() {
  sessionStorage.removeItem('admin_authed');
  clearAdminToken();
  adminState.authenticated = false;
  location.reload();
}

// ── DASHBOARD ────────────────────────────────

async function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.remove('hidden');

  // Mostrar nombre del lanzamiento
  const launchName = document.getElementById('launch-name');
  if (launchName) launchName.textContent = CONFIG.LAUNCH_NAME;

  setupNavigation();
  await loadData();
}

function setupNavigation() {
  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      navigateTo(section);
    });
  });
}

function navigateTo(section) {
  adminState.activeSection = section;

  // Actualizar nav items
  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });

  // Mostrar sección correspondiente
  document.querySelectorAll('.admin-section').forEach(s => {
    s.classList.toggle('hidden', s.dataset.section !== section);
  });
}

// ── CARGA DE DATOS ────────────────────────────

async function loadData() {
  showLoadingIndicator(true);

  let appointments = [];
  let fromGHL = false;

  // Intentar cargar desde GHL
  try {
    appointments = await ghlGetAppointments();
    fromGHL = true;
  } catch (err) {
    console.warn('[Admin] GHL no respondió, usando localStorage:', err.message);
  }

  // Fallback: localStorage
  if (!fromGHL || appointments.length === 0) {
    const stored = getBookingsFromStorage();
    if (stored.length > 0) {
      appointments = stored.map(normalizeStoredBooking);
    }
  }

  adminState.appointments = appointments;

  // Cargar lista de closers
  try {
    const r = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('adminToken')}` },
    });
    if (r.ok) adminState.users = await r.json();
  } catch (_) {}

  showLoadingIndicator(false);

  renderMetrics();
  renderCharts();
  applyFilters();    // inicializa filtered y llama a renderTable()
  renderConfigSection();
}

function showLoadingIndicator(loading) {
  const indicator = document.getElementById('loading-indicator');
  if (indicator) indicator.classList.toggle('hidden', !loading);
}

function getBookingsFromStorage() {
  try {
    return JSON.parse(localStorage.getItem('booking_app_reservas') || '[]');
  } catch (_) { return []; }
}

/**
 * Normaliza un registro de localStorage al formato de GHL appointment
 */
function normalizeStoredBooking(record) {
  return {
    id:             record.id,
    title:          `${record.nombre} ${record.apellidos}`,
    firstName:      record.nombre,
    lastName:       record.apellidos,
    email:          record.email,
    phone:          record.telefono,
    inversion:      record.inversion,
    tier:           record.tier,
    facturacion:    record.facturacion,
    sistemaClientes:record.sistemaClientes,
    tiempoEmpezar:  record.tiempoEmpezar,
    decisor:        record.decisor,
    startTime:      `${record.fechaSeleccionada}T${record.slotSeleccionado}:00`,
    status:         record.estado || 'confirmado',
    appointmentId:  record.appointmentId,
    contactId:      record.contactId,
    assignedUserId: record.assignedUserId || null,
    bookedAt:       record.bookedAt || record.timestamp,
  };
}

// Normaliza el campo assignedUserId de respuestas GHL (varios nombres posibles)
function getAssignedUserId(apt) {
  return apt.assignedUserId || apt.userId || apt.assignedTo || null;
}

// ── ANÁLISIS DE DATOS ─────────────────────────

function analyzeAppointments(appointments) {
  const totalAgendados = appointments.length;

  // Contar por tier (intentamos detectar tier de varias fuentes)
  let vipCount   = 0;
  let basicCount = 0;

  appointments.forEach(apt => {
    const tier = detectTier(apt);
    if (tier === 'vip') vipCount++;
    else               basicCount++;
  });

  // Agrupar por semana
  const byWeek = { S1: 0, S2: 0, S3: 0 };
  const weekRanges = getWeekRanges();

  appointments.forEach(apt => {
    const dateKey = getAppointmentDate(apt);
    weekRanges.forEach(({ label, start, end }) => {
      if (dateKey >= start && dateKey <= end) byWeek[label]++;
    });
  });

  // Agrupar por día (últimos 14 días con datos)
  const byDay = {};
  appointments.forEach(apt => {
    const dateKey = getAppointmentDate(apt);
    if (dateKey) byDay[dateKey] = (byDay[dateKey] || 0) + 1;
  });

  // Tasa de completado (form starts vs confirmados)
  const formStarts = parseInt(localStorage.getItem('booking_form_starts') || '0', 10);
  const completedRate = formStarts > 0
    ? Math.round((totalAgendados / formStarts) * 100)
    : null;

  return { totalAgendados, vipCount, basicCount, byWeek, byDay, completedRate, formStarts };
}

function detectTier(apt) {
  // Primero miramos el campo tier directo (localStorage)
  if (apt.tier) return apt.tier;

  // Luego intentamos detectar por tags o campos
  if (apt.tags) {
    const tags = Array.isArray(apt.tags) ? apt.tags : [apt.tags];
    if (tags.some(t => t.includes('vip')))   return 'vip';
    if (tags.some(t => t.includes('basico'))) return 'basico';
  }

  // Por inversión declarada
  if (apt.inversion) {
    for (const [key, cfg] of Object.entries(CONFIG.TIERS)) {
      if (cfg.inversiones.includes(apt.inversion)) return key;
    }
  }

  return 'basico';
}

function getAppointmentDate(apt) {
  const raw = apt.startTime || apt.start || apt.date || '';
  if (!raw) return '';
  return String(raw).substring(0, 10);
}

function getWeekRanges() {
  const ranges = [];
  let sIdx = 1;
  Object.values(CONFIG.TIERS).forEach(tier => {
    tier.semanas.forEach(s => {
      ranges.push({ label: `S${sIdx}`, start: s.start, end: s.end });
      sIdx++;
    });
  });
  return ranges;
}

// ── MÉTRICAS ─────────────────────────────────

function renderMetrics() {
  const { totalAgendados, vipCount, basicCount, completedRate, formStarts } =
    analyzeAppointments(adminState.appointments);

  const vipPct   = totalAgendados > 0 ? Math.round((vipCount / totalAgendados) * 100) : 0;
  const basicPct = totalAgendados > 0 ? Math.round((basicCount / totalAgendados) * 100) : 0;

  setMetric('metric-total', totalAgendados, '');
  setMetric('metric-vip',   vipCount, `${vipPct}% del total`);
  setMetric('metric-basic', basicCount, `${basicPct}% del total`);

  if (completedRate !== null) {
    setMetric('metric-rate', `${completedRate}%`, `${formStarts} iniciaron el formulario`);
  } else {
    setMetric('metric-rate', '—', 'Sin datos de visitas');
  }

  // Badges de color
  setBadge('metric-vip-badge',   'Prioritario', 'badge-blue');
  setBadge('metric-basic-badge', 'Estándar',    'badge-gray');
}

function setMetric(id, value, sub) {
  const el = document.getElementById(id);
  if (!el) return;
  const valEl = el.querySelector('.metric-value');
  const subEl = el.querySelector('.metric-sub');
  if (valEl) valEl.textContent = value;
  if (subEl) subEl.textContent = sub;
}

function setBadge(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className   = `badge ${cls}`;
}

// ── GRÁFICOS ──────────────────────────────────

function renderCharts() {
  const { vipCount, basicCount, byWeek, byDay } =
    analyzeAppointments(adminState.appointments);

  renderDonut(vipCount, basicCount);
  renderBars(byWeek);
  renderLineChart(byDay);
}

/* -- Donut -- */
function renderDonut(vipCount, basicCount) {
  const svg = document.getElementById('donut-svg');
  if (!svg) return;

  const total = vipCount + basicCount;
  const radius = 48;
  const cx = 65, cy = 65;
  const circumference = 2 * Math.PI * radius;

  let vipDash   = total > 0 ? (vipCount / total) * circumference : 0;
  let basicDash = total > 0 ? (basicCount / total) * circumference : 0;

  if (total === 0) {
    // Círculo vacío
    svg.innerHTML = `
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="var(--border)" stroke-width="14"/>
    `;
  } else {
    const offset1 = 0;
    const offset2 = circumference - vipDash;

    svg.innerHTML = `
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="var(--border)" stroke-width="14"/>
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none"
        stroke="var(--blue)" stroke-width="14"
        stroke-dasharray="${vipDash} ${circumference - vipDash}"
        stroke-dashoffset="${circumference * 0.25}"
        stroke-linecap="round"
        transform="rotate(-90 ${cx} ${cy})"/>
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none"
        stroke="var(--amber)" stroke-width="14"
        stroke-dasharray="${basicDash} ${circumference - basicDash}"
        stroke-dashoffset="${circumference * 0.25 - vipDash}"
        stroke-linecap="round"
        transform="rotate(-90 ${cx} ${cy})"/>
    `;
  }

  // Centro
  const center = document.getElementById('donut-center');
  if (center) {
    center.querySelector('.donut-total').textContent = total;
    center.querySelector('.donut-total-label').textContent = 'total';
  }

  // Leyenda
  setLegendItem('legend-vip',   vipCount,   total);
  setLegendItem('legend-basic', basicCount, total);
}

function setLegendItem(id, count, total) {
  const el = document.getElementById(id);
  if (!el) return;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const valEl = el.querySelector('.legend-val');
  if (valEl) valEl.textContent = `${count} (${pct}%)`;
}

/* -- Barras horizontales -- */
function renderBars(byWeek) {
  const maxVal = Math.max(...Object.values(byWeek), 1);

  Object.entries(byWeek).forEach(([label, count]) => {
    const fillEl  = document.getElementById(`bar-fill-${label.toLowerCase()}`);
    const countEl = document.getElementById(`bar-count-${label.toLowerCase()}`);
    if (fillEl)  fillEl.style.width  = `${(count / maxVal) * 100}%`;
    if (countEl) countEl.textContent = count;
  });
}

/* -- Línea temporal -- */
function renderLineChart(byDay) {
  const canvas = document.getElementById('line-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const W   = canvas.offsetWidth  || 600;
  const H   = canvas.offsetHeight || 160;

  canvas.width  = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const entries = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    ctx.fillStyle = '#9CA3AF';
    ctx.font      = '13px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos para mostrar', W / 2, H / 2);
    return;
  }

  const values = entries.map(([, v]) => v);
  const maxVal = Math.max(...values, 1);
  const pad    = { top: 16, right: 16, bottom: 32, left: 32 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top  - pad.bottom;

  const xStep = entries.length > 1 ? chartW / (entries.length - 1) : chartW;

  // Línea de cuadrícula
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth   = 1;
  [0, 0.5, 1].forEach(t => {
    const y = pad.top + chartH * (1 - t);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();
  });

  // Área rellena
  ctx.beginPath();
  entries.forEach(([, v], i) => {
    const x = pad.left + i * xStep;
    const y = pad.top  + chartH * (1 - v / maxVal);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + (entries.length - 1) * xStep, pad.top + chartH);
  ctx.lineTo(pad.left, pad.top + chartH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
  grad.addColorStop(0,   'rgba(59,123,248,.25)');
  grad.addColorStop(1,   'rgba(59,123,248,.02)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Línea principal
  ctx.beginPath();
  ctx.strokeStyle = '#3B7BF8';
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  entries.forEach(([, v], i) => {
    const x = pad.left + i * xStep;
    const y = pad.top  + chartH * (1 - v / maxVal);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Puntos
  entries.forEach(([, v], i) => {
    const x = pad.left + i * xStep;
    const y = pad.top  + chartH * (1 - v / maxVal);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle   = '#3B7BF8';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2;
    ctx.stroke();
  });

  // Etiquetas del eje X (cada N días si hay muchos)
  ctx.fillStyle = '#9CA3AF';
  ctx.font      = '11px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  const step = Math.ceil(entries.length / 7);
  entries.forEach(([date], i) => {
    if (i % step !== 0 && i !== entries.length - 1) return;
    const x = pad.left + i * xStep;
    const d = new Date(date + 'T12:00:00');
    const label = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    ctx.fillText(label, x, H - 6);
  });
}

// ── SCORING ───────────────────────────────────

function calcularScore(lead) {
  let score = 0;

  // Inversión declarada (0-40 pts)
  if (lead.inversion === '+3000')      score += 40;
  else if (lead.inversion === '1000-3000') score += 30;
  else if (lead.inversion === '300-1000')  score += 15;

  // Es el decisor (0-20 pts)
  if (lead.decisor === 'si')           score += 20;
  else if (lead.decisor === 'compartido') score += 10;

  // Tiempo para empezar (0-15 pts)
  if (lead.tiempoEmpezar === 'ahora')      score += 15;
  else if (lead.tiempoEmpezar === '1mes')  score += 10;
  else if (lead.tiempoEmpezar === '3meses') score += 5;

  // Facturación (0-15 pts)
  if (lead.facturacion === '+100k')        score += 15;
  else if (lead.facturacion === '50-100k') score += 10;
  else if (lead.facturacion === '20-50k')  score += 5;

  // Sistema de clientes (0-10 pts)
  if (lead.sistemaClientes === 'si')       score += 10;

  return score;
}

function scoreBadge(score) {
  if (score >= 80) return `<span class="badge badge-green">🔥 Caliente</span>`;
  if (score >= 55) return `<span class="badge badge-blue">Interesante</span>`;
  if (score >= 30) return `<span class="badge badge-amber">Tibio</span>`;
  return `<span class="badge badge-gray">Frío</span>`;
}

function formatBookedAt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── FILTROS Y ORDEN ───────────────────────────

function applyFilters() {
  const from   = document.getElementById('filter-from')?.value;
  const to     = document.getElementById('filter-to')?.value;
  const sortBy = document.getElementById('sort-by')?.value || 'agendo-desc';

  let list = [...adminState.appointments];

  if (from) list = list.filter(apt => getAppointmentDate(apt) >= from);
  if (to)   list = list.filter(apt => getAppointmentDate(apt) <= to);

  list.sort((a, b) => {
    if (sortBy === 'fecha-cita-asc')  return getAppointmentDate(a).localeCompare(getAppointmentDate(b));
    if (sortBy === 'fecha-cita-desc') return getAppointmentDate(b).localeCompare(getAppointmentDate(a));
    if (sortBy === 'score-desc')      return calcularScore(b) - calcularScore(a);
    // agendo-desc (default)
    const ba = a.bookedAt || a.timestamp || '';
    const bb = b.bookedAt || b.timestamp || '';
    return bb.localeCompare(ba);
  });

  adminState.filtered = list;

  const countEl = document.getElementById('filter-count');
  if (countEl) countEl.textContent = `${list.length} resultado${list.length !== 1 ? 's' : ''}`;

  renderTable();
}

function clearFilters() {
  const from = document.getElementById('filter-from');
  const to   = document.getElementById('filter-to');
  if (from) from.value = '';
  if (to)   to.value   = '';
  applyFilters();
}

// ── TABLA ─────────────────────────────────────

function renderTable() {
  const tbody = document.getElementById('appointments-tbody');
  if (!tbody) return;

  // Usar lista filtrada/ordenada si existe, si no todos
  const appointments = (adminState.filtered.length > 0 || adminState.appointments.length === 0
    ? adminState.filtered
    : adminState.appointments
  ).slice(0, 100);

  if (appointments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center;padding:2rem;color:var(--text3)">
          No hay agendamientos registrados todavía.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = appointments.map(apt => {
    const tier       = detectTier(apt);
    const tierConfig = CONFIG.TIERS[tier];
    const tierLabel  = tierConfig?.label || tier;
    const tierBadge  = tier === 'vip' ? 'badge-blue' : 'badge-gray';

    const dateKey  = getAppointmentDate(apt);
    const dateStr  = dateKey
      ? new Date(dateKey + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })
      : '—';

    const rawTime  = apt.startTime || apt.start || '';
    const timeStr  = rawTime
      ? new Date(rawTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: CONFIG.TIMEZONE })
      : '—';

    const name  = apt.title || `${apt.firstName || ''} ${apt.lastName || ''}`.trim() || '—';
    const email = apt.email || '—';
    const inv   = apt.inversion || apt.customFields?.find(f => f.id === CONFIG.GHL_CUSTOM_FIELD_INVERSION)?.value || '—';

    const statusBadge = apt.status === 'confirmado' || apt.status === 'booked'
      ? 'badge-green'
      : 'badge-amber';

    const statusLabel = apt.status === 'confirmado' || apt.status === 'booked'
      ? 'Confirmado'
      : (apt.status || '—');

    const score    = calcularScore(apt);
    const bookedAt = formatBookedAt(apt.bookedAt || apt.timestamp);
    const rowId        = apt.id || apt.appointmentId || Math.random().toString(36).slice(2);
    const assignedId   = getAssignedUserId(apt);

    const userOptions = adminState.users.map(u =>
      `<option value="${escapeHtml(u.id)}" ${u.id === assignedId ? 'selected' : ''}>${escapeHtml(u.name)}</option>`
    ).join('');

    const closerCell = adminState.users.length > 0
      ? `<td>
           <div style="display:flex;align-items:center;gap:.375rem">
             <select id="closer-sel-${rowId}" style="font-size:.8rem;padding:.2rem .4rem;border:1px solid var(--border);border-radius:6px;max-width:130px">
               <option value="">— Sin asignar —</option>
               ${userOptions}
             </select>
             <button onclick="handleReassign('${escapeHtml(apt.contactId||'')}','${escapeHtml(apt.appointmentId||apt.id||'')}','${rowId}')"
               style="font-size:.75rem;padding:.2rem .5rem;background:var(--blue);color:#fff;border:none;border-radius:6px;cursor:pointer">
               OK
             </button>
             <span id="closer-fb-${rowId}" style="font-size:.8rem"></span>
           </div>
         </td>`
      : `<td>—</td>`;

    return `
      <tr>
        <td class="td-name">${escapeHtml(name)}</td>
        <td class="td-email">${escapeHtml(email)}</td>
        <td>${escapeHtml(inv)}</td>
        <td><span class="badge ${tierBadge}">${tierLabel}</span></td>
        <td>${scoreBadge(score)}</td>
        <td>${bookedAt}</td>
        <td>${dateStr}</td>
        <td>${timeStr}</td>
        ${closerCell}
        <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
      </tr>
    `;
  }).join('');
}

// ── REASIGNAR CLOSER ──────────────────────────

function handleReassign(contactId, appointmentId, rowId) {
  const sel        = document.getElementById(`closer-sel-${rowId}`);
  const feedbackEl = document.getElementById(`closer-fb-${rowId}`);
  const newOwnerId = sel?.value;
  if (!newOwnerId || !contactId || !appointmentId) return;
  reassignCloser(contactId, appointmentId, newOwnerId, feedbackEl);
}

async function reassignCloser(contactId, appointmentId, newOwnerId, feedbackEl) {
  feedbackEl.textContent = '⏳';
  feedbackEl.style.color = 'inherit';
  feedbackEl.title       = '';
  try {
    const r    = await fetch('/api/admin/reassign', {
      method:  'PUT',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('adminToken')}`,
      },
      body: JSON.stringify({ contactId, appointmentId, newOwnerId }),
    });
    const data = await r.json();
    if (r.ok) {
      if (data.warning) {
        feedbackEl.style.color = 'var(--amber, #f59e0b)';
        feedbackEl.textContent = '⚠ Parcial';
        showToast(data.warning, 'warning', 8000);
      } else {
        feedbackEl.style.color = 'var(--green)';
        feedbackEl.textContent = '✓ Reasignado';
        showToast('Reasignación completada correctamente.', 'success', 3000);
      }
    } else {
      feedbackEl.style.color = 'var(--red, #ef4444)';
      feedbackEl.textContent = 'Error';
      showToast(data.error || 'No se pudo reasignar.', 'error', 8000);
    }
  } catch (_) {
    feedbackEl.style.color = 'var(--red, #ef4444)';
    feedbackEl.textContent = 'Error';
  }
}

// ── SECCIÓN CONFIG ────────────────────────────

function renderConfigSection() {
  const el = document.getElementById('config-info');
  if (!el) return;

  el.innerHTML = `
    <div class="card p-6" style="margin-bottom:1rem">
      <h3 style="font-family:'Syne',sans-serif;font-weight:700;margin-bottom:1rem">Estado de la configuración</h3>
      <div style="display:flex;flex-direction:column;gap:.625rem">
        ${configRow('Backend proxy',   true, 'Activo — credenciales protegidas en servidor')}
        ${configRow('Lanzamiento',     true, CONFIG.LAUNCH_NAME)}
        ${configRow('Timezone',        true, CONFIG.TIMEZONE)}
      </div>
    </div>
    <div class="card p-6">
      <h3 style="font-family:'Syne',sans-serif;font-weight:700;margin-bottom:1rem">Semanas del lanzamiento</h3>
      ${Object.entries(CONFIG.TIERS).map(([key, t]) => `
        <div style="margin-bottom:1rem">
          <p style="font-weight:700;margin-bottom:.375rem">${t.label} (${key})</p>
          ${t.semanas.map(s => `
            <div style="font-size:.875rem;color:var(--text2);margin-bottom:.25rem">
              📅 ${s.start} → ${s.end}
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

function configRow(label, ok, note = '') {
  const icon = ok ? '✅' : '❌';
  const noteHtml = note ? ` <span style="color:var(--text3);font-size:.8125rem">(${escapeHtml(note)})</span>` : '';
  return `
    <div style="display:flex;align-items:center;gap:.625rem;font-size:.9rem">
      <span>${icon}</span>
      <span style="font-weight:600">${escapeHtml(label)}</span>${noteHtml}
    </div>
  `;
}

// ── REFRESH ───────────────────────────────────

async function refreshData() {
  const btn = document.getElementById('btn-refresh');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-top-color:var(--blue);border-color:rgba(59,123,248,.2)"></div> Actualizando…`;
  }

  await loadData();

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '🔄 Actualizar';
  }
}

// ── TOAST ─────────────────────────────────────

function showToast(message, type = 'warning', duration = 6000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const colors = {
    warning: { bg: '#fffbeb', border: '#f59e0b', icon: '⚠️', text: '#92400e' },
    error:   { bg: '#fef2f2', border: '#ef4444', icon: '❌', text: '#991b1b' },
    success: { bg: '#f0fdf4', border: '#22c55e', icon: '✅', text: '#166534' },
  };
  const c = colors[type] || colors.warning;

  const toast = document.createElement('div');
  toast.style.cssText = `
    background:${c.bg};border:1px solid ${c.border};border-radius:10px;
    padding:.875rem 1rem;display:flex;gap:.625rem;align-items:flex-start;
    box-shadow:0 4px 12px rgba(0,0,0,.1);animation:slideIn .2s ease;
  `;
  toast.innerHTML = `
    <span style="font-size:1.1rem;flex-shrink:0">${c.icon}</span>
    <div style="flex:1">
      <p style="font-size:.8rem;color:${c.text};margin:0;line-height:1.4">${escapeHtml(message)}</p>
    </div>
    <button onclick="this.parentElement.remove()" style="
      background:none;border:none;cursor:pointer;color:${c.text};
      font-size:1rem;padding:0;line-height:1;flex-shrink:0
    ">×</button>
  `;

  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ── HELPERS ───────────────────────────────────

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}
