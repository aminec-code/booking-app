// ─────────────────────────────────────────────
//  CONFIG.JS  —  Configuración del lanzamiento
//  Las credenciales sensibles están en .env (solo en el servidor)
// ─────────────────────────────────────────────

const CONFIG = {

  // ── CUSTOM FIELD IDs (no son secretos, solo identificadores) ──
  GHL_CUSTOM_FIELD_INVERSION:  '9CVYG4HZq0U94kCtvzMh',
  GHL_CUSTOM_FIELD_NEGOCIO:    'h1zj59J1oZOOZNyXYp1v',
  GHL_CUSTOM_FIELD_TICKET:     'IUsjyqxqr9hkaohb9q3e',

  // ── LANZAMIENTO ───────────────────────────
  LAUNCH_NAME:       'Lanzamiento Marzo 2026',
  TIMEZONE:          'Europe/Madrid',
  SLOT_DURATION_MIN:  45,   // duración real de la cita (para calcular endTime)
  SLOT_INTERVAL_MIN:  60,   // intervalo entre slots en el calendario (horas en punto)
  BUFFER_BEFORE_MIN: 25,
  BUFFER_AFTER_MIN:  25,

  // ── FECHAS POR TIER ───────────────────────
  TIERS: {
    vip: {
      label:      'Prioritario',
      tag:        'Prioritario',
      inversiones: ['1000-3000', '+3000'],
      semanas: [
        { start: '2026-03-24', end: '2026-03-30' },
        { start: '2026-03-31', end: '2026-04-06' },
      ],
    },
    basico: {
      label:      'Estándar',
      tag:        'Estandar',
      inversiones: ['0-300', '300-1000'],
      semanas: [
        { start: '2026-04-07', end: '2026-04-13' },
      ],
    },
  },

  // ── HORARIO GENERAL (lunes a viernes) ─────
  HORARIO: { start: 10, end: 22 },

  // ── EXCEPCIONES DE HORARIO POR DÍA ────────
  HORARIO_EXCEPCIONES: {
    '2026-03-24': { start: 22, end: 24 },
  },

  // ── FALLBACK DE CONTACTO (si la confirmación falla) ──
  CONTACT_FALLBACK: {
    telefono: '+34 600 000 000',   // ← cambia por tu número real
    email:    'hola@tudominio.com', // ← cambia por tu email real
  },

  // ── OPCIONES DEL SELECT DE INVERSIÓN ──────
  OPCIONES_INVERSION: [
    { value: '0-300',     label: '0 – 300 €' },
    { value: '300-1000',  label: '300 € – 1.000 €' },
    { value: '1000-3000', label: '1.000 € – 3.000 €' },
    { value: '+3000',     label: '+ 3.000 €' },
  ],
};
