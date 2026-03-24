// ─────────────────────────────────────────────
//  BOOKING.JS  —  Flujo de reserva v2
//  Contacto → Quiz (9 preguntas) → Calendario → Confirmación
// ─────────────────────────────────────────────

// ── ESTADO GLOBAL ────────────────────────────

const bookingState = {
  // Paso actual: 'contacto' | 'quiz' | 'calendario' | 'confirmacion'
  paso: 'contacto',

  // Contacto
  nombre:    '',
  apellidos: '',
  email:     '',
  telefono:  '',
  instagram: '',

  // Quiz
  quizIndex:     0,          // pregunta actual (0-8)
  quizResponses: {},         // { q1_negocio: 'saas', q2_ticket: '+500', ... }
  quizScore:     0,          // puntuación normalizada (0-100)
  prioridad:     null,       // 'maxima' | 'media' | 'baja'

  // Calendario
  fechaSeleccionada: null,
  slotSeleccionado:  null,
  zonaHoraria:       Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid',

  // GHL
  contactId:      null,
  opportunityId:  null,
  appointmentId:  null,
  assignedUserId: null,
  closerNombre:   null,

  // Meta
  bookedAt: null,
};

const TOTAL_PASOS = 11; // 1 contacto + 9 quiz + 1 calendario

// ── INIT ─────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initContacto();
  initCalendarStep();
  showScreen('contacto');
});

// ── BARRA DE PROGRESO ─────────────────────────

function updateProgress(pasoNum) {
  const pct = Math.round((pasoNum / TOTAL_PASOS) * 100);
  const bar = document.getElementById('progress-bar');
  const txt = document.getElementById('progress-text');
  if (bar) bar.style.width = `${pct}%`;
  if (txt) txt.textContent = `Paso ${pasoNum} de ${TOTAL_PASOS}`;
}

// ── NAVEGACIÓN DE PANTALLAS ─────────────────

function showScreen(nombre, direction = 'forward') {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('slide-in', 'slide-in-reverse');
    s.classList.add('hidden');
  });

  const target = document.getElementById(`screen-${nombre}`);
  if (target) {
    target.classList.remove('hidden');
    const animClass = direction === 'back' ? 'slide-in-reverse' : 'slide-in';
    target.classList.add(animClass);
    setTimeout(() => target.classList.remove(animClass), 300);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  bookingState.paso = nombre;
}

// ═══════════════════════════════════════════
//  PASO 1 — CONTACTO
// ═══════════════════════════════════════════

function initContacto() {
  ['nombre', 'apellidos', 'email', 'telefono', 'instagram'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', validateContacto);
  });
  document.getElementById('btn-contacto')?.addEventListener('click', goToQuiz);
}

function validateContacto() {
  const nombre    = document.getElementById('nombre')?.value.trim();
  const apellidos = document.getElementById('apellidos')?.value.trim();
  const email     = document.getElementById('email')?.value.trim();
  const tel       = document.getElementById('telefono')?.value.trim();
  const instagram = document.getElementById('instagram')?.value.trim();

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
  const telOk   = /^[\d\s\-().+]{6,20}$/.test(tel || '');

  const valid = nombre && apellidos && emailOk && telOk && instagram;

  const btn = document.getElementById('btn-contacto');
  if (btn) btn.disabled = !valid;

  showFieldError('email-error',    email && !emailOk ? 'Introduce un email válido' : '');
  showFieldError('telefono-error', tel   && !telOk   ? 'Introduce un teléfono válido' : '');

  return !!valid;
}

function goToQuiz() {
  if (!validateContacto()) return;

  const prefix = document.getElementById('telefono-prefix')?.value || '+34';
  bookingState.nombre    = document.getElementById('nombre')?.value.trim()    || '';
  bookingState.apellidos = document.getElementById('apellidos')?.value.trim() || '';
  bookingState.email     = document.getElementById('email')?.value.trim()     || '';
  bookingState.telefono  = prefix + document.getElementById('telefono')?.value.trim();
  bookingState.instagram = document.getElementById('instagram')?.value.trim() || '';

  bookingState.quizIndex     = 0;
  bookingState.quizResponses = {};

  showScreen('quiz');
  renderQuizQuestion();
  updateProgress(2);
}

// ═══════════════════════════════════════════
//  PASOS 2-10 — QUIZ
// ═══════════════════════════════════════════

function renderQuizQuestion() {
  const idx      = bookingState.quizIndex;
  const pregunta = CONFIG.QUIZ[idx];
  const total    = CONFIG.QUIZ.length;

  updateProgress(2 + idx);

  const numEl  = document.getElementById('quiz-num');
  const txtEl  = document.getElementById('quiz-pregunta');
  const optsEl = document.getElementById('quiz-opciones');

  if (numEl)  numEl.textContent  = `Pregunta ${idx + 1} de ${total}`;
  if (txtEl)  txtEl.textContent  = pregunta.pregunta;

  if (optsEl) {
    optsEl.innerHTML = pregunta.opciones.map(opcion => `
      <div class="quiz-option" data-value="${escapeHtml(opcion.value)}"
           onclick="seleccionarOpcion('${escapeHtml(pregunta.id)}', '${escapeHtml(opcion.value)}')">
        <span class="opcion-label">${escapeHtml(opcion.label)}</span>
      </div>
    `).join('');

    // Restaurar selección previa si el usuario vuelve atrás
    const prevRespuesta = bookingState.quizResponses[pregunta.id];
    if (prevRespuesta) {
      const prevEl = optsEl.querySelector(`[data-value="${prevRespuesta}"]`);
      if (prevEl) prevEl.classList.add('selected');
    }
  }

  // Botón atrás
  const backBtn = document.getElementById('btn-quiz-back');
  if (backBtn) {
    backBtn.onclick = () => {
      if (idx === 0) {
        showScreen('contacto', 'back');
        updateProgress(1);
      } else {
        bookingState.quizIndex--;
        renderQuizQuestion();
      }
    };
  }
}

function seleccionarOpcion(preguntaId, valor) {
  bookingState.quizResponses[preguntaId] = valor;

  // Marcar visualmente
  const optsEl = document.getElementById('quiz-opciones');
  if (optsEl) {
    optsEl.querySelectorAll('.quiz-option').forEach(el => el.classList.remove('selected'));
    optsEl.querySelector(`[data-value="${valor}"]`)?.classList.add('selected');
  }

  // Avanzar tras 300ms
  setTimeout(() => {
    const siguienteIdx = bookingState.quizIndex + 1;
    if (siguienteIdx < CONFIG.QUIZ.length) {
      bookingState.quizIndex = siguienteIdx;
      renderQuizQuestion();
    } else {
      // Quiz completo → calcular score y pasar al calendario
      const { score, prioridad } = calcularScoreYPrioridad();
      console.log(`[Quiz] Score: ${score} → Prioridad: ${prioridad}`);
      goToCalendario();
    }
  }, 300);
}

// ── SCORING ────────────────────────────────

function calcularScoreYPrioridad() {
  let score = 0;
  const responses = bookingState.quizResponses;

  CONFIG.QUIZ.forEach(pregunta => {
    const respuesta = responses[pregunta.id];
    if (respuesta) {
      const opcion = pregunta.opciones.find(o => o.value === respuesta);
      if (opcion) score += opcion.score;
    }
  });

  // Normaliza a 0-100
  const scoreNormalizado = Math.round(
    (score / CONFIG.SCORE_MAXIMO_POSIBLE) * 100
  );

  let prioridad;
  if (scoreNormalizado >= CONFIG.SCORING.umbrales.maxima) {
    prioridad = 'maxima';
  } else if (scoreNormalizado >= CONFIG.SCORING.umbrales.media) {
    prioridad = 'media';
  } else {
    prioridad = 'baja';
  }

  bookingState.quizScore = scoreNormalizado;
  bookingState.prioridad = prioridad;

  return { score: scoreNormalizado, prioridad };
}

// ═══════════════════════════════════════════
//  PASO 11 — CALENDARIO
// ═══════════════════════════════════════════

function goToCalendario() {
  bookingState.fechaSeleccionada = null;
  bookingState.slotSeleccionado  = null;

  const slotsContainer = document.getElementById('slots-container');
  if (slotsContainer) slotsContainer.classList.add('hidden');
  const btnConfirm = document.getElementById('btn-confirm');
  if (btnConfirm) btnConfirm.disabled = true;

  showScreen('calendario');
  updateProgress(11);
  initCalendar(bookingState.prioridad, onDateSelected);
}

function onTimezoneChange(tz) {
  bookingState.zonaHoraria      = tz;
  bookingState.slotSeleccionado = null;
  const btnConfirm = document.getElementById('btn-confirm');
  if (btnConfirm) btnConfirm.disabled = true;
  if (bookingState.fechaSeleccionada) {
    renderSlots(bookingState.fechaSeleccionada, onSlotSelected);
  }
}

function initCalendarStep() {
  document.getElementById('btn-back-cal')?.addEventListener('click', () => {
    bookingState.quizIndex = CONFIG.QUIZ.length - 1;
    showScreen('quiz', 'back');
    renderQuizQuestion();
  });
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

  const btnConfirm = document.getElementById('btn-confirm');
  if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = 'Verificando disponibilidad…'; }

  // ── Paso 0: re-validar el slot antes de enviar a GHL ──────────────────────
  try {
    const freeSlots = await ghlGetFreeSlots(bookingState.fechaSeleccionada);
    const slotMadrid = bookingState.slotSeleccionado; // 'HH:MM' en Madrid

    const disponible = freeSlots.some(s => {
      const t = typeof s === 'string' ? s : (s.startTime || s.start || '');
      return t.startsWith(slotMadrid);
    });

    if (!disponible) {
      // El slot ya no está libre — mostrarlo como ocupado y pedir nueva selección
      if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = 'Confirmar reserva →'; }
      showSlotUnavailable(bookingState.slotSeleccionado);
      bookingState.slotSeleccionado = null;
      return;
    }
  } catch (_) {
    // Si la validación falla por red, dejamos pasar y que GHL decida
  }

  if (btnConfirm) btnConfirm.textContent = 'Confirmar reserva →';
  showLoadingState();

  const slowTimer = setTimeout(() => {
    setLoadingStatus('Estamos registrando tu cita, no cierres esta ventana…');
  }, 8000);

  try {
    setLoadingStatus('Registrando tus datos…');
    const result = await ghlSubmitBooking(bookingState);

    bookingState.contactId      = result.contactId;
    bookingState.opportunityId  = result.opportunityId;
    bookingState.appointmentId  = result.appointmentId;
    bookingState.assignedUserId = result.assignedUserId;

    setLoadingStatus('Preparando tu confirmación…');
    const closerName = await ghlGetUserName(result.assignedUserId);

    clearTimeout(slowTimer);
    bookingState.bookedAt = new Date().toISOString();
    saveBookingToStorage();
    renderConfirmation(closerName);

  } catch (err) {
    clearTimeout(slowTimer);
    // Si GHL rechaza el slot en el último momento, mostrar aviso inline en lugar de pantalla de error genérica
    if (err.errorCode === 'APPOINTMENT_400' || err.errorCode?.includes('APPOINTMENT') || err.errorCode === 'APPOINTMENT_422' || err.errorCode === 'APPOINTMENT_409') {
      if (btnConfirm) btnConfirm.disabled = true;
      showSlotUnavailable(bookingState.slotSeleccionado);
      bookingState.slotSeleccionado = null;
      // Restaurar el calendario si fue reemplazado por el loading
      const cal = document.getElementById('screen-calendario');
      if (cal._originalContent) {
        cal.innerHTML = cal._originalContent;
        initCalendarStep();
        renderSlots(bookingState.fechaSeleccionada, onSlotSelected);
      }
    } else {
      showErrorState(err.message, err.errorCode || null);
    }
  }
}

/**
 * Muestra un aviso inline de slot ocupado, marca el slot como no disponible
 * y pide al usuario que elija otro.
 */
function showSlotUnavailable(slotTime) {
  // Eliminar el slot del DOM — si está ocupado no debe ser seleccionable
  const slotEl = document.querySelector(`.slot[data-time="${slotTime}"]`);
  if (slotEl) slotEl.remove();

  // Mostrar aviso encima de los slots
  const container = document.getElementById('slots-container');
  const existing  = document.getElementById('slot-unavailable-msg');
  if (existing) existing.remove();

  const msg = document.createElement('div');
  msg.id    = 'slot-unavailable-msg';
  msg.style.cssText = `
    background:#FEF3C7;border:1.5px solid #F59E0B;border-radius:10px;
    padding:12px 16px;margin-bottom:12px;display:flex;align-items:flex-start;gap:10px;
  `;
  msg.innerHTML = `
    <span style="font-size:1.1rem;flex-shrink:0">⚠️</span>
    <div>
      <p style="font-weight:700;font-size:.875rem;color:#92400E;margin:0 0 2px">
        Esta hora ya no está disponible
      </p>
      <p style="font-size:.8rem;color:#B45309;margin:0">
        Alguien acaba de reservar ese horario. Por favor elige otra hora.
      </p>
    </div>
  `;
  if (container) container.prepend(msg);

  // Hacer scroll hasta los slots para que el usuario vea el aviso
  container?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── ESTADOS DE CARGA / ERROR ─────────────────

function showLoadingState() {
  const cal = document.getElementById('screen-calendario');
  if (!cal) return;
  cal._originalContent = cal.innerHTML;
  cal.innerHTML = `
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

function showErrorState(_errorMsg, errorCode = null) {
  const cal = document.getElementById('screen-calendario');
  if (!cal) return;

  // Mensaje amigable según tipo de error
  const isDataError = errorCode && (errorCode.startsWith('CONTACT_4') || errorCode === 'CONTACT_400' || errorCode === 'CONTACT_422');
  const friendlyMsg = isDataError
    ? 'Parece que algún dato que nos has proporcionado no es correcto. Por favor, revisa tu email y teléfono e inténtalo de nuevo.'
    : 'Parece que hemos tenido algún problema. Por favor, vuelve a intentarlo o usa nuestro calendario de respaldo.';

  cal.innerHTML = `
    <div style="padding:2rem 0;text-align:center">
      <div style="font-size:2.5rem;margin-bottom:1rem">⚠️</div>
      <h2 style="font-family:'Syne',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:.75rem;color:var(--text)">
        No se pudo confirmar la reserva
      </h2>
      <p style="color:var(--text2);font-size:.9rem;margin-bottom:1.25rem;max-width:380px;margin-left:auto;margin-right:auto;line-height:1.5">
        ${friendlyMsg}
      </p>
      <div style="display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;margin-bottom:1.25rem">
        <button class="btn btn-primary" id="btn-retry">Reintentar</button>
        <button class="btn btn-ghost"   id="btn-back-error">Volver al calendario</button>
      </div>
      <div style="margin:0 auto;padding:1rem 1.25rem;background:#F5EDD6;border-radius:12px;max-width:360px;border:1.5px solid #B8963E">
        <p style="font-size:.85rem;color:#0D1B2A;margin-bottom:.75rem;line-height:1.5">
          Si el problema persiste, puedes agendar tu auditoría directamente desde nuestro calendario de respaldo:
        </p>
        <a href="https://focusevent.online/calendario/" target="_blank" rel="noopener noreferrer"
           style="display:inline-block;background:#0D1B2A;color:#fff;font-family:'Inter',sans-serif;font-weight:600;font-size:.875rem;padding:.75rem 1.5rem;border-radius:8px;text-decoration:none">
          Calendario de respaldo →
        </a>
      </div>
    </div>
  `;

  const restoreCalendar = () => {
    if (cal._originalContent) cal.innerHTML = cal._originalContent;
    initCalendar(bookingState.prioridad, onDateSelected);
    document.getElementById('btn-back-cal')?.addEventListener('click', () => {
      bookingState.quizIndex = CONFIG.QUIZ.length - 1;
      showScreen('quiz', 'back');
      renderQuizQuestion();
    });
    document.getElementById('btn-confirm')?.addEventListener('click', confirmBooking);
  };

  document.getElementById('btn-retry')?.addEventListener('click', () => {
    restoreCalendar();
    if (bookingState.fechaSeleccionada) {
      renderSlots(bookingState.fechaSeleccionada, onSlotSelected).then(() => {
        if (bookingState.slotSeleccionado) {
          document.querySelector(`.slot[data-time="${bookingState.slotSeleccionado}"]`)
            ?.classList.add('slot-selected');
          const btnConfirm = document.getElementById('btn-confirm');
          if (btnConfirm) btnConfirm.disabled = false;
        }
      });
    }
  });

  document.getElementById('btn-back-error')?.addEventListener('click', restoreCalendar);
}

// ── CONFIRMACIÓN ──────────────────────────────

function renderConfirmation(closerName = null) {
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

  const confirmEl = document.getElementById('screen-confirmacion');
  if (confirmEl) {
    confirmEl.innerHTML = `
      <div class="confirm-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>

      <h2 style="font-family:'Syne',sans-serif;font-weight:700;font-size:1.375rem;
                 text-align:center;margin-bottom:.5rem">
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
            ${(() => {
              const userTz    = bookingState.zonaHoraria || 'Europe/Madrid';
              const isMadrid  = userTz === 'Europe/Madrid';
              const localTime = isMadrid
                ? slotSeleccionado
                : convertMadridSlotToTz(fechaSeleccionada, slotSeleccionado, userTz);
              const tzLabel   = isMadrid ? '' : userTz.replace('_', ' ').split('/').pop();
              return isMadrid
                ? `<div class="confirm-detail-value">${slotSeleccionado} h <span style="color:var(--text3);font-size:.8rem">(Madrid)</span></div>`
                : `<div class="confirm-detail-value">${localTime} h <span style="color:var(--text3);font-size:.8rem">(${tzLabel})</span></div>
                   <div style="font-size:.8rem;color:var(--text3);margin-top:.2rem">Madrid: ${slotSeleccionado} h</div>`;
            })()}
          </div>
        </div>
      </div>

      <div class="banner banner-green" style="margin-bottom:1rem">
        <span class="banner-icon">🎯</span>
        <span>${closerName
          ? `Tu llamada será con <strong>${escapeHtml(closerName)}</strong>`
          : 'Tu llamada está confirmada — te contactaremos con los detalles'
        }</span>
      </div>

      <a href="${gcalUrl}" target="_blank" rel="noopener"
         class="btn btn-secondary btn-full" style="margin-bottom:.75rem">
        📆 Añadir a Google Calendar
      </a>

      <div class="banner banner-green" style="margin-top:1rem">
        <span class="banner-icon">🔔</span>
        <span>Recibirás un recordatorio <strong>24 horas antes</strong> de tu auditoría.</span>
      </div>
    `;
  }

  showScreen('confirmacion');
}

// ── LOCALSTORAGE ─────────────────────────────

const STORAGE_KEY = 'booking_app_reservas';

function saveBookingToStorage() {
  const existing = getBookingsFromStorage();
  const record = {
    id:                Date.now(),
    nombre:            bookingState.nombre,
    apellidos:         bookingState.apellidos,
    email:             bookingState.email,
    telefono:          bookingState.telefono,
    instagram:         bookingState.instagram,
    quizResponses:     bookingState.quizResponses,
    quizScore:         bookingState.quizScore,
    prioridad:         bookingState.prioridad,
    fechaSeleccionada: bookingState.fechaSeleccionada,
    slotSeleccionado:  bookingState.slotSeleccionado,
    contactId:         bookingState.contactId,
    opportunityId:     bookingState.opportunityId,
    appointmentId:     bookingState.appointmentId,
    assignedUserId:    bookingState.assignedUserId,
    bookedAt:          bookingState.bookedAt,
    timestamp:         new Date().toISOString(),
    estado:            'confirmado',
  };
  existing.push(record);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(existing)); } catch (_) {}

  fetch('/api/save-booking', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(record),
  }).catch(() => {});
}

function getBookingsFromStorage() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch (_) { return []; }
}

// ── HELPERS ───────────────────────────────────

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}
