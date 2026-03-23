// ─────────────────────────────────────────────
//  CONFIG.JS  —  Configuración del lanzamiento v2
//  Las credenciales sensibles están en .env (solo en el servidor)
// ─────────────────────────────────────────────

const CONFIG = {

  // ── CUSTOM FIELD IDs (no son secretos, solo identificadores) ──
  GHL_CUSTOM_FIELD_INVERSION:  '9CVYG4HZq0U94kCtvzMh',
  GHL_CUSTOM_FIELD_NEGOCIO:    'h1zj59J1oZOOZNyXYp1v',
  GHL_CUSTOM_FIELD_TICKET:     'IUsjyqxqr9hkaohb9q3e',

  // ── LANZAMIENTO ───────────────────────────
  LAUNCH_NAME:        'Lanzamiento Marzo 2026',   // interno — nunca lo ve el cliente
  APPOINTMENT_TITLE:  'Auditoría FOCUS Consulting', // público — aparece en GCal y GHL
  TIMEZONE:          'Europe/Madrid',
  SLOT_DURATION_MIN:  45,   // duración real de la cita (para calcular endTime)
  SLOT_INTERVAL_MIN:  60,   // intervalo entre slots en el calendario (horas en punto)
  BUFFER_BEFORE_MIN: 25,
  BUFFER_AFTER_MIN:  25,

  // ── SCORING ───────────────────────────────
  SCORING: {
    umbrales: {
      maxima: 75,   // 75-100 = Máxima Prioridad
      media:  50,   // 50-74  = Prioridad Media
                    // 0-49   = Baja Prioridad
    },
    etiquetas: {
      maxima: 'Máxima Prioridad',
      media:  'Prioridad Media',
      baja:   'Baja Prioridad',
    },
    tags_ghl: {
      maxima: 'Maxima-Prioridad',
      media:  'Media-Prioridad',
      baja:   'Baja-Prioridad',
    },
  },

  // ── VENTANA DE FECHAS POR PRIORIDAD ───────
  VENTANA_FECHAS: {
    maxima: {
      ventanaInicial: 4,
      expansion:      2,
      maxDias:        14,
      fechaInicio:    '2026-03-24',
      fechaMax:       '2026-04-06',
    },
    media: {
      ventanaInicial: 7,
      expansion:      3,
      maxDias:        21,
      fechaInicio:    '2026-03-24',
      fechaMax:       '2026-04-13',
    },
    baja: {
      ventanaInicial: 14,
      expansion:      5,
      maxDias:        30,
      fechaInicio:    '2026-04-02',
      fechaMax:       '2026-04-20',
    },
  },

  // ── HORARIO GENERAL (lunes a viernes) ─────
  HORARIO: { start: 10, end: 22 },

  // ── EXCEPCIONES DE HORARIO POR DÍA ────────
  HORARIO_EXCEPCIONES: {
    '2026-03-24': { start: 22, end: 24 },
  },

  // ── QUIZ ──────────────────────────────────
  QUIZ: [
    {
      id: 'q1_negocio',
      pregunta: '¿A qué te dedicas exactamente?',
      tipo: 'radio',
      opciones: [
        { label: 'E-commerce / tienda online',  value: 'ecommerce', score: 25 },
        { label: 'Servicios / consultoría',      value: 'servicios', score: 20 },
        { label: 'Producto digital / SaaS',      value: 'saas',      score: 30 },
        { label: 'Otra',                         value: 'otra',      score: 10 },
      ],
    },
    {
      id: 'q2_ticket',
      pregunta: '¿Cuál es tu ticket medio por cliente?',
      tipo: 'radio',
      opciones: [
        { label: 'Más de 500€',   value: '+500',    score: 20 },
        { label: '200€ – 500€',   value: '200-500', score: 15 },
        { label: '100€ – 200€',   value: '100-200', score: 10 },
        { label: 'Menos de 100€', value: '-100',    score: 5  },
      ],
    },
    {
      id: 'q3_margen',
      pregunta: '¿Cuál es tu margen aproximado por venta?',
      tipo: 'radio',
      opciones: [
        { label: 'Alto (más del 40%)',   value: 'alto',  score: 15 },
        { label: 'Medio (20% – 40%)',    value: 'medio', score: 10 },
        { label: 'Bajo (menos del 20%)', value: 'bajo',  score: 5  },
      ],
    },
    {
      id: 'q4_facturacion',
      pregunta: '¿Cuál es tu facturación anual aproximada?',
      tipo: 'radio',
      opciones: [
        { label: 'Más de 500.000€',     value: '+500k',    score: 25 },
        { label: '200.000€ – 500.000€', value: '200-500k', score: 20 },
        { label: '50.000€ – 200.000€',  value: '50-200k',  score: 15 },
        { label: 'Menos de 50.000€',    value: '-50k',     score: 10 },
      ],
    },
    {
      id: 'q5_inversion',
      pregunta: '¿Cuánto podrías invertir al mes si fuera rentable?',
      tipo: 'radio',
      opciones: [
        { label: 'Más de 3.000€',   value: '+3000',     score: 30 },
        { label: '1.000€ – 3.000€', value: '1000-3000', score: 25 },
        { label: '300€ – 1.000€',   value: '300-1000',  score: 15 },
        { label: '0€ – 300€',       value: '0-300',     score: 0  },
      ],
    },
    {
      id: 'q6_frena',
      pregunta: '¿Qué te frena más a la hora de escalar?',
      tipo: 'radio',
      opciones: [
        { label: 'Falta de sistema / procesos',     value: 'sistema',   score: 25 },
        { label: 'Falta de inversión en marketing', value: 'marketing', score: 25 },
        { label: 'No sé por dónde empezar',         value: 'inicio',    score: 20 },
        { label: 'Tiempo o recursos limitados',     value: 'tiempo',    score: 15 },
      ],
    },
    {
      id: 'q7_sistema',
      pregunta: '¿Tienes un sistema para gestionar tus clientes?',
      tipo: 'radio',
      opciones: [
        { label: 'Sí, uso un CRM profesional', value: 'crm',    score: 20 },
        { label: 'Sí, pero algo básico',        value: 'basico', score: 15 },
        { label: 'No tengo ninguno',            value: 'no',     score: 0  },
      ],
    },
    {
      id: 'q8_tiempo',
      pregunta: '¿En cuánto tiempo quieres empezar?',
      tipo: 'radio',
      opciones: [
        { label: 'Ahora mismo',           value: 'ahora',      score: 30 },
        { label: 'En el próximo mes',     value: '1mes',       score: 20 },
        { label: 'En 3 meses',            value: '3meses',     score: 10 },
        { label: 'Solo estoy explorando', value: 'explorando', score: 5  },
      ],
    },
    {
      id: 'q9_decisor',
      pregunta: '¿Eres tú quien toma la decisión de inversión?',
      tipo: 'radio',
      opciones: [
        { label: 'Sí, la decisión es mía',       value: 'si',        score: 20 },
        { label: 'La comparto con otra persona',  value: 'compartida', score: 10 },
        { label: 'No, decide otra persona',       value: 'no',        score: 0  },
      ],
    },
  ],

  SCORE_MAXIMO_POSIBLE: 200,

  // ── FALLBACK DE CONTACTO (si la confirmación falla) ──
  CONTACT_FALLBACK: {
    telefono:    '+34 600 000 000',   // ← cambia por tu número real
    email:       'hola@tudominio.com', // ← cambia por tu email real
    calendarUrl: '',                   // ← URL del calendario nativo GHL (ej: https://link.focusconsulting.com/widget/booking/...)
  },
};
