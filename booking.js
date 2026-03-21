// ─────────────────────────────────────────────
//  BOOKING.JS  —  Flujo de reserva (4 pasos)
//  Bloque 1 → Bloque 2 → Calendario → Confirmado
// ─────────────────────────────────────────────

// ── ESTADO GLOBAL ────────────────────────────
const bookingState = {
  // Pasos internos: 'b1' | 'b2' | 'cal' | 'done'
  step: 'b1',

  // Bloque 1
  nombre:      '',
  apellidos:   '',
  telefono:    '',
  email:       '',
  negocio:     '',
  ticketMedio: '',
  margen:      '',
  facturacion: '',
  inversion:   '',
  tier:        null,   // calculado silenciosamente, nunca mostrado

  // Bloque 2
  clientesLlegan: [],   // array (checkboxes)
  frena:          '',
  instagram:      '',
  publicaRedes:   '',
  cierraVentas:   '',
  sistemaClientes:'',
  tiempoEmpezar:  '',
  decisor:        '',

  // Calendario
  fechaSeleccionada: null,
  slotSeleccionado:  null,

  // IDs de GHL
  contactId:      null,
  opportunityId:  null,
  appointmentId:  null,
};

// ── INIT ─────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initBlock1();
  initBlock2();
  initCalendarStep();
  showStep('b1');
  updateDots('b1');
});

// ── STEP DOTS ─────────────────────────────────

function updateDots(step) {
  // dot4-1 = Bloque 1, dot4-2 = Bloque 2, dot4-3 = Calendario, dot4-4 = Confirmado
  const order = ['b1', 'b2', 'cal', 'done'];
  const idx   = order.indexOf(step); // 0..3

  [1, 2, 3, 4].forEach(n => {
    const dot  = document.getElementById(`dot4-${n}`);
    const line = document.getElementById(`line4-${n}`);
    const pos  = n - 1; // 0..3
    if (dot) {
      dot.classList.remove('active', 'done');
      if (pos < idx)  dot.classList.add('done');
      if (pos === idx) dot.classList.add('active');
    }
    if (line) {
      line.classList.toggle('done', pos < idx);
    }
  });
}

// ── MOSTRAR SECCIÓN ───────────────────────────

function showStep(step) {
  const map = {
    b1:   'step-1',
    b2:   'step-block2',
    cal:  'step-2',
    done: 'step-3',
  };

  Object.values(map).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  const target = document.getElementById(map[step]);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('block-enter');
    setTimeout(() => target.classList.remove('block-enter'), 300);
    // Scroll suave al top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  bookingState.step = step;
  updateDots(step);
}

// ═══════════════════════════════════════════
//  BLOQUE 1
// ═══════════════════════════════════════════

function initBlock1() {
  // Inputs de texto
  const textFields = ['nombre', 'apellidos', 'email', 'negocio', 'ticket-medio', 'margen', 'facturacion'];
  textFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { validateBlock1(); updateB1Progress(); });
  });

  // Teléfono
  const tel = document.getElementById('telefono');
  if (tel) tel.addEventListener('input', () => { validateBlock1(); updateB1Progress(); });

  // Radio inversión
  document.querySelectorAll('input[name="inversion"]').forEach(radio => {
    radio.addEventListener('change', () => {
      bookingState.inversion = radio.value;
      highlightSelectedRadio('inversion-group');
      validateBlock1();
      updateB1Progress();
    });
  });

  // Estilos hover para radio options
  stylizeRadioGroup('inversion-group');

  // Botón siguiente bloque 1
  const btn = document.getElementById('btn-block1');
  if (btn) btn.addEventListener('click', goToBlock2);
}

function validateBlock1() {
  const nombre      = document.getElementById('nombre')?.value.trim();
  const apellidos   = document.getElementById('apellidos')?.value.trim();
  const email       = document.getElementById('email')?.value.trim();
  const tel         = document.getElementById('telefono')?.value.trim();
  const negocio     = document.getElementById('negocio')?.value.trim();
  const ticket      = document.getElementById('ticket-medio')?.value.trim();
  const margen      = document.getElementById('margen')?.value.trim();
  const facturacion = document.getElementById('facturacion')?.value.trim();
  const inversion   = bookingState.inversion;

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
  const telOk   = (tel || '').length >= 6;

  const valid = nombre && apellidos && emailOk && telOk &&
                negocio && ticket && margen && facturacion && inversion;

  const btn = document.getElementById('btn-block1');
  if (btn) btn.disabled = !valid;

  showFieldError('email-error',    email && !emailOk ? 'Introduce un email válido' : '');
  showFieldError('telefono-error', tel   && !telOk   ? 'Introduce un teléfono válido' : '');

  return !!valid;
}

function updateB1Progress() {
  const fields = [
    document.getElementById('nombre')?.value.trim(),
    document.getElementById('apellidos')?.value.trim(),
    document.getElementById('email')?.value.trim(),
    document.getElementById('telefono')?.value.trim(),
    document.getElementById('negocio')?.value.trim(),
    document.getElementById('ticket-medio')?.value.trim(),
    document.getElementById('margen')?.value.trim(),
    document.getElementById('facturacion')?.value.trim(),
    bookingState.inversion,
  ];
  const filled = fields.filter(Boolean).length;
  const total  = fields.length;
  const pct    = Math.round((filled / total) * 100);

  const bar   = document.getElementById('b1-progress');
  const label = document.getElementById('b1-progress-label');
  if (bar)   bar.style.width  = `${pct}%`;
  if (label) label.textContent = `${filled} / ${total}`;
}

function goToBlock2() {
  if (!validateBlock1()) return;

  // Sincronizar estado
  const prefix = document.getElementById('telefono-prefix')?.value || '+34';
  bookingState.nombre      = document.getElementById('nombre')?.value.trim()        || '';
  bookingState.apellidos   = document.getElementById('apellidos')?.value.trim()     || '';
  bookingState.email       = document.getElementById('email')?.value.trim()         || '';
  bookingState.telefono    = prefix + document.getElementById('telefono')?.value.trim();
  bookingState.negocio     = document.getElementById('negocio')?.value.trim()       || '';
  bookingState.ticketMedio = document.getElementById('ticket-medio')?.value.trim()  || '';
  bookingState.margen      = document.getElementById('margen')?.value.trim()        || '';
  bookingState.facturacion = document.getElementById('facturacion')?.value.trim()   || '';

  // Tier: calculado silenciosamente
  bookingState.tier = calcTier(bookingState.inversion);

  showStep('b2');
}

// ═══════════════════════════════════════════
//  BLOQUE 2
// ═══════════════════════════════════════════

function initBlock2() {
  // Checkboxes clientes llegan
  document.querySelectorAll('input[name="clientes"]').forEach(cb => {
    cb.addEventListener('change', () => {
      syncCheckboxes('clientes');
      validateBlock2();
      updateB2Progress();
    });
  });
  stylizeCheckGroup('clientes-llegan-group');

  // Radios restantes
  ['frena', 'publica', 'cierra', 'sistema', 'tiempo', 'decisor'].forEach(name => {
    document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
      radio.addEventListener('change', () => {
        highlightSelectedRadio(`${name}-group`);
        validateBlock2();
        updateB2Progress();

        // Campo extra para "Otro" en frena
        if (name === 'frena') {
          const otroInput = document.getElementById('frena-otro-input');
          if (otroInput) {
            const isOtro = radio.value === '__otro__';
            otroInput.classList.toggle('hidden', !isOtro);
            if (isOtro) otroInput.focus();
          }
        }
      });
    });
    stylizeRadioGroup(`${name}-group`);
  });

  // Input frena-otro
  document.getElementById('frena-otro-input')?.addEventListener('input', () => {
    validateBlock2();
    updateB2Progress();
  });

  // Instagram
  document.getElementById('instagram')?.addEventListener('input', () => {
    validateBlock2();
    updateB2Progress();
  });

  // Botón siguiente bloque 2
  document.getElementById('btn-block2')?.addEventListener('click', goToCalendar);

  // Botón volver
  document.getElementById('btn-back-b2')?.addEventListener('click', () => showStep('b1'));
}

function validateBlock2() {
  const clientesLlegan = getChecked('clientes');
  const frena          = getRadioValue('frena');
  const frenaOtroInput = document.getElementById('frena-otro-input');
  const frenaOk        = frena && (frena !== '__otro__' || (frenaOtroInput?.value.trim()));
  const instagram      = document.getElementById('instagram')?.value.trim();
  const publica        = getRadioValue('publica');
  const cierra         = getRadioValue('cierra');
  const sistema        = getRadioValue('sistema');
  const tiempo         = getRadioValue('tiempo');
  const decisor        = getRadioValue('decisor');

  const valid = clientesLlegan.length > 0 && frenaOk && instagram &&
                publica && cierra && sistema && tiempo && decisor;

  const btn = document.getElementById('btn-block2');
  if (btn) btn.disabled = !valid;
  return !!valid;
}

function updateB2Progress() {
  const frena         = getRadioValue('frena');
  const frenaOtroVal  = document.getElementById('frena-otro-input')?.value.trim();
  const frenaFilled   = frena && (frena !== '__otro__' || frenaOtroVal);

  const fields = [
    getChecked('clientes').length > 0 ? '✓' : '',
    frenaFilled                        ? '✓' : '',
    document.getElementById('instagram')?.value.trim(),
    getRadioValue('publica'),
    getRadioValue('cierra'),
    getRadioValue('sistema'),
    getRadioValue('tiempo'),
    getRadioValue('decisor'),
  ];
  const filled = fields.filter(Boolean).length;
  const total  = fields.length;
  const pct    = Math.round((filled / total) * 100);

  const bar   = document.getElementById('b2-progress');
  const label = document.getElementById('b2-progress-label');
  if (bar)   bar.style.width   = `${pct}%`;
  if (label) label.textContent = `${filled} / ${total}`;
}

function goToCalendar() {
  if (!validateBlock2()) return;

  // Sincronizar bloque 2
  const frenaVal = getRadioValue('frena');
  bookingState.frena = frenaVal === '__otro__'
    ? (document.getElementById('frena-otro-input')?.value.trim() || 'Otro')
    : frenaVal;

  bookingState.clientesLlegan  = getChecked('clientes');
  bookingState.instagram       = document.getElementById('instagram')?.value.trim() || '';
  bookingState.publicaRedes    = getRadioValue('publica');
  bookingState.cierraVentas    = getRadioValue('cierra');
  bookingState.sistemaClientes = getRadioValue('sistema');
  bookingState.tiempoEmpezar   = getRadioValue('tiempo');
  bookingState.decisor         = getRadioValue('decisor');

  // Limpiar selección previa del calendario
  bookingState.fechaSeleccionada = null;
  bookingState.slotSeleccionado  = null;
  const slotsContainer = document.getElementById('slots-container');
  if (slotsContainer) slotsContainer.classList.add('hidden');
  const btnConfirm = document.getElementById('btn-confirm');
  if (btnConfirm) btnConfirm.disabled = true;

  showStep('cal');
  initCalendar(bookingState.tier, onDateSelected);
}

// ═══════════════════════════════════════════
//  PASO CALENDARIO
// ═══════════════════════════════════════════

function initCalendarStep() {
  document.getElementById('btn-back')?.addEventListener('click', () => showStep('b2'));
  document.getElementById('btn-confirm')?.addEventListener('click', confirmBooking);
}

async function onDateSelected(fechaKey) {
  bookingState.fechaSeleccionada = fechaKey;
  bookingState.slotSeleccionado  = null;
  const btnConfirm = document.getElementById('btn-confirm');
  if (btnConfirm) btnConfirm.disabled = true;
  await renderSlots(fechaKey, onSlotSelected);
}

function onSlotSelected(slotTime) {
  bookingState.slotSeleccionado = slotTime;
  const btnConfirm = document.getElementById('btn-confirm');
  if (btnConfirm) btnConfirm.disabled = false;
}

// ═══════════════════════════════════════════
//  CONFIRMAR RESERVA
// ═══════════════════════════════════════════

async function confirmBooking() {
  if (!bookingState.fechaSeleccionada || !bookingState.slotSeleccionado) return;

  showLoadingState();

  try {
    setLoadingStatus('Registrando tus datos…');
    const contactId = await ghlUpsertContact({
      nombre:      bookingState.nombre,
      apellidos:   bookingState.apellidos,
      email:       bookingState.email,
      telefono:    bookingState.telefono,
      inversion:   bookingState.inversion,
      tier:        bookingState.tier,
      negocio:     bookingState.negocio,
      ticketMedio: bookingState.ticketMedio,
    });
    bookingState.contactId = contactId;

    setLoadingStatus('Creando tu registro…');
    const nombreCompleto = `${bookingState.nombre} ${bookingState.apellidos}`;
    const opportunityId  = await ghlCreateOpportunity(contactId, bookingState.tier, nombreCompleto);
    bookingState.opportunityId = opportunityId;

    setLoadingStatus('Confirmando tu cita en el calendario…');
    const appointmentId = await ghlCreateAppointment(
      contactId,
      bookingState.fechaSeleccionada,
      bookingState.slotSeleccionado,
    );
    bookingState.appointmentId = appointmentId;

    saveBookingToStorage();
    renderConfirmation();

  } catch (err) {
    showErrorState(err.message);
  }
}

// ── ESTADOS DE CARGA / ERROR ─────────────────

function showLoadingState() {
  const step2 = document.getElementById('step-2');
  if (!step2) return;
  step2._originalContent = step2.innerHTML;
  step2.innerHTML = `
    <div class="loading-overlay">
      <div class="spinner spinner-blue spinner-lg"></div>
      <div>
        <p id="loading-status" style="font-weight:600;color:var(--text)">Iniciando…</p>
        <p style="font-size:.875rem;color:var(--text2)">Por favor no cierres esta ventana.</p>
      </div>
    </div>
  `;
}

function setLoadingStatus(msg) {
  const el = document.getElementById('loading-status');
  if (el) el.textContent = msg;
}

function showErrorState(errorMsg) {
  const step2 = document.getElementById('step-2');
  if (!step2) return;
  step2.innerHTML = `
    <div style="padding:2rem 0;text-align:center">
      <div style="font-size:2.5rem;margin-bottom:1rem">⚠️</div>
      <h2 style="font-family:'Syne',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:.75rem;color:var(--text)">
        No se pudo confirmar la reserva
      </h2>
      <p style="color:var(--text2);font-size:.9rem;margin-bottom:1.5rem;max-width:380px;margin-left:auto;margin-right:auto">
        ${escapeHtml(errorMsg)}
      </p>
      <div style="display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="btn-retry">Reintentar</button>
        <button class="btn btn-ghost" id="btn-back-error">Volver al calendario</button>
      </div>
    </div>
  `;

  document.getElementById('btn-retry')?.addEventListener('click', () => {
    if (step2._originalContent) step2.innerHTML = step2._originalContent;
    initCalendar(bookingState.tier, onDateSelected);
    document.getElementById('btn-back')?.addEventListener('click', () => showStep('b2'));
    document.getElementById('btn-confirm')?.addEventListener('click', confirmBooking);
    if (bookingState.fechaSeleccionada) {
      renderSlots(bookingState.fechaSeleccionada, onSlotSelected).then(() => {
        if (bookingState.slotSeleccionado) {
          const slotEl = document.querySelector(`.slot[data-time="${bookingState.slotSeleccionado}"]`);
          slotEl?.classList.add('slot-selected');
          const btnConfirm = document.getElementById('btn-confirm');
          if (btnConfirm) btnConfirm.disabled = false;
        }
      });
    }
  });

  document.getElementById('btn-back-error')?.addEventListener('click', () => {
    if (step2._originalContent) step2.innerHTML = step2._originalContent;
    initCalendar(bookingState.tier, onDateSelected);
    document.getElementById('btn-back')?.addEventListener('click', () => showStep('b2'));
    document.getElementById('btn-confirm')?.addEventListener('click', confirmBooking);
  });
}

// ── CONFIRMACIÓN ──────────────────────────────

function renderConfirmation() {
  const { nombre, apellidos, email, fechaSeleccionada, slotSeleccionado } = bookingState;

  const dateObj = parseLocalDate(fechaSeleccionada);
  const dateStr = dateObj.toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const gcalUrl = buildGoogleCalendarUrl({
    nombre, apellidos,
    fechaKey: fechaSeleccionada,
    hora: slotSeleccionado,
  });

  const step3 = document.getElementById('step-3');
  if (step3) {
    step3.innerHTML = `
      <div class="confirm-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>

      <h2 style="font-family:'Syne',sans-serif;font-weight:700;font-size:1.375rem;text-align:center;margin-bottom:.5rem">
        ¡Auditoría confirmada!
      </h2>
      <p style="text-align:center;color:var(--text2);font-size:.9rem;margin-bottom:1.5rem">
        Tu cita ha sido agendada correctamente.
      </p>

      <div style="background:var(--bg);border-radius:var(--radius);padding:1rem;margin-bottom:1.5rem">
        <div class="confirm-detail-row">
          <span class="confirm-detail-icon">👤</span>
          <div>
            <div class="confirm-detail-label">Nombre</div>
            <div class="confirm-detail-value">${escapeHtml(nombre)} ${escapeHtml(apellidos)}</div>
          </div>
        </div>
        <div class="confirm-detail-row">
          <span class="confirm-detail-icon">✉️</span>
          <div>
            <div class="confirm-detail-label">Email</div>
            <div class="confirm-detail-value">${escapeHtml(email)}</div>
          </div>
        </div>
        <div class="confirm-detail-row">
          <span class="confirm-detail-icon">📅</span>
          <div>
            <div class="confirm-detail-label">Fecha</div>
            <div class="confirm-detail-value" style="text-transform:capitalize">${dateStr}</div>
          </div>
        </div>
        <div class="confirm-detail-row">
          <span class="confirm-detail-icon">🕐</span>
          <div>
            <div class="confirm-detail-label">Hora</div>
            <div class="confirm-detail-value">${slotSeleccionado} h</div>
          </div>
        </div>
      </div>

      <a href="${gcalUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-full" style="margin-bottom:.75rem">
        📆 Añadir a Google Calendar
      </a>

      <div class="banner banner-green" style="margin-top:1rem">
        <span class="banner-icon">🔔</span>
        <span>Recibirás un recordatorio <strong>24 horas antes</strong> de tu auditoría.</span>
      </div>
    `;
  }

  showStep('done');
}

// ── LOCALSTORATE ─────────────────────────────

const STORAGE_KEY = 'booking_app_reservas';

function saveBookingToStorage() {
  const existing = getBookingsFromStorage();
  const record = {
    id:                Date.now(),
    nombre:            bookingState.nombre,
    apellidos:         bookingState.apellidos,
    email:             bookingState.email,
    telefono:          bookingState.telefono,
    inversion:         bookingState.inversion,
    tier:              bookingState.tier,
    negocio:           bookingState.negocio,
    ticketMedio:       bookingState.ticketMedio,
    margen:            bookingState.margen,
    facturacion:       bookingState.facturacion,
    clientesLlegan:    bookingState.clientesLlegan,
    frena:             bookingState.frena,
    instagram:         bookingState.instagram,
    publicaRedes:      bookingState.publicaRedes,
    cierraVentas:      bookingState.cierraVentas,
    sistemaClientes:   bookingState.sistemaClientes,
    tiempoEmpezar:     bookingState.tiempoEmpezar,
    decisor:           bookingState.decisor,
    fechaSeleccionada: bookingState.fechaSeleccionada,
    slotSeleccionado:  bookingState.slotSeleccionado,
    contactId:         bookingState.contactId,
    opportunityId:     bookingState.opportunityId,
    appointmentId:     bookingState.appointmentId,
    timestamp:         new Date().toISOString(),
    estado:            'confirmado',
  };
  existing.push(record);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(existing)); } catch (_) {}
}

function getBookingsFromStorage() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch (_) { return []; }
}

function trackFormStart() {
  try {
    const starts = parseInt(localStorage.getItem('booking_form_starts') || '0', 10);
    localStorage.setItem('booking_form_starts', String(starts + 1));
  } catch (_) {}
}

// ── TIER (silencioso) ─────────────────────────

function calcTier(inversion) {
  for (const [key, cfg] of Object.entries(CONFIG.TIERS)) {
    if (cfg.inversiones.includes(inversion)) return key;
  }
  return 'basico';
}

// ── HELPERS DE FORMULARIO ────────────────────

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function getRadioValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || '';
}

function getChecked(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
}

function syncCheckboxes(name) {
  bookingState[name === 'clientes' ? 'clientesLlegan' : name] = getChecked(name);
}

/**
 * Resalta visualmente el radio seleccionado dentro de un grupo
 */
function highlightSelectedRadio(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.radio-option').forEach(opt => {
    const radio = opt.querySelector('input[type="radio"]');
    opt.classList.toggle('selected', radio?.checked || false);
  });
}

/**
 * Resalta visualmente los checkboxes seleccionados
 */
function stylizeCheckGroup(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.check-option').forEach(opt => {
    const cb = opt.querySelector('input[type="checkbox"]');
    if (cb) {
      cb.addEventListener('change', () => {
        opt.classList.toggle('selected', cb.checked);
      });
    }
  });
}

/**
 * Añade listeners de highlight a un radio group
 */
function stylizeRadioGroup(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.radio-option').forEach(opt => {
    const radio = opt.querySelector('input[type="radio"]');
    if (radio) {
      radio.addEventListener('change', () => {
        group.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
    }
  });
}

// ── ESCAPE ────────────────────────────────────

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}
