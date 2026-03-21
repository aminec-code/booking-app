// ─────────────────────────────────────────────
//  CONFIG.EXAMPLE.JS
//  Copia este archivo como config.js y rellena tus valores
// ─────────────────────────────────────────────

const CONFIG = {

  // ── GHL CREDENTIALS ───────────────────────
  GHL_API_KEY:     'pit-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
  GHL_LOCATION_ID: 'TU_LOCATION_ID',
  GHL_CALENDAR_ID: 'TU_CALENDAR_ID',
  GHL_PIPELINE_ID: 'TU_PIPELINE_ID',
  GHL_STAGE_ID:    'TU_STAGE_ID',

  // ── CUSTOM FIELD IDs ──────────────────────
  GHL_CUSTOM_FIELD_INVERSION:  '',
  GHL_CUSTOM_FIELD_NEGOCIO:    '',
  GHL_CUSTOM_FIELD_TICKET:     '',

  // ── LANZAMIENTO ───────────────────────────
  LAUNCH_NAME:       'Lanzamiento Marzo 2026',
  TIMEZONE:          'Europe/Madrid',
  SLOT_DURATION_MIN: 30,

  // ── FECHAS POR TIER ───────────────────────
  TIERS: {
    vip: {
      label:      'Prioritario',
      tag:        'tier-vip',
      inversiones: ['1000-3000', '+3000'],
      semanas: [
        { start: '2026-03-24', end: '2026-03-30' },
        { start: '2026-03-31', end: '2026-04-06' },
      ],
    },
    basico: {
      label:      'Estándar',
      tag:        'tier-basico',
      inversiones: ['0-300', '300-1000'],
      semanas: [
        { start: '2026-04-07', end: '2026-04-13' },
      ],
    },
  },

  // ── HORARIO GENERAL (lunes a viernes) ─────
  HORARIO: { start: 10, end: 22 },

  // ── EXCEPCIONES DE HORARIO POR DÍA ────────
  HORARIO_EXCEPCIONES: {},

  // ── OPCIONES DEL SELECT DE INVERSIÓN ──────
  OPCIONES_INVERSION: [
    { value: '0-300',     label: '0 – 300 €' },
    { value: '300-1000',  label: '300 € – 1.000 €' },
    { value: '1000-3000', label: '1.000 € – 3.000 €' },
    { value: '+3000',     label: '+ 3.000 €' },
  ],

  // ── ADMIN ─────────────────────────────────
  ADMIN_PASSWORD: 'TU_PASSWORD_ADMIN',

  // ── BASE URL DE LA API DE GHL ─────────────
  GHL_BASE_URL: 'https://services.leadconnectorhq.com',
  GHL_VERSION:  '2021-07-28',
};
