'use strict';
// ─────────────────────────────────────────────────────────
//  STRESS TEST REAL — 500 agendamientos contra GHL
//  Envía formulario completo → contacto → oportunidad → cita
//
//  Tandas: 200 → 150 → 80 → 70
//  Concurrencia: 5 simultáneos (para no saturar GHL API)
//  Delay entre grupos: 2s (respetar rate limits de GHL)
// ─────────────────────────────────────────────────────────

const BASE_URL = process.argv[2] || 'https://booking-app-production-11e0.up.railway.app';

const WAVES = [
  { name: 'TANDA 1', count: 200 },
  { name: 'TANDA 2', count: 150 },
  { name: 'TANDA 3', count: 80 },
  { name: 'TANDA 4', count: 70 },
];

const CONCURRENCY       = 3;      // 3 simultáneos para no saturar GHL
const DELAY_BETWEEN_MS  = 3000;   // 3s entre grupos
const REQUEST_TIMEOUT   = 30_000; // 30s timeout (GHL puede ser lento)

// ── DATOS FICTICIOS ──────────────────────────────
const NOMBRES   = ['Carlos','María','Javier','Laura','Miguel','Ana','Pablo','Lucía','David','Sara','Sergio','Elena','Alberto','Marta','Rubén','Nuria','Alejandro','Patricia','Iván','Cristina','Diego','Sofía','Andrés','Carmen','Fernando','Raquel','Óscar','Beatriz','Marcos','Irene','Hugo','Natalia','Adrián','Paula','Daniel','Silvia','Víctor','Claudia','Tomás','Alicia','Gonzalo','Lorena','Emilio','Eva','Nicolás','Rosa','Guillermo','Inés','Ramón','Pilar'];
const APELLIDOS = ['García','Martínez','López','Sánchez','González','Fernández','Pérez','Rodríguez','Romero','Torres','Jiménez','Navarro','Moreno','Molina','Ortega','Ruiz','Castro','Vega','Ramos','Díaz','Herrera','Muñoz','Blanco','Suárez','Medina','Iglesias','Cortés','Guerrero','Reyes','Delgado','Rubio','Serrano','Cano','Prieto','Domínguez','Calvo','Gallego','Pascual','Herrero','Fuentes'];

const NEGOCIOS  = ['Consultoría estratégica','E-commerce moda','Agencia marketing digital','Inmobiliaria premium','Restauración saludable','SaaS B2B','Clínica dental','Academia online','Fisioterapia deportiva','Arquitectura sostenible','Coaching empresarial','Tienda gourmet online','Agencia de viajes','Estudio de diseño','Asesoría fiscal','Gimnasio boutique','Peluquería premium','Taller mecánico','Veterinaria','Farmacia online'];

// Distribución realista de respuestas del quiz
const QUIZ_PROFILES = {
  hot: {  // ~40% — leads calientes
    q1: ['saas','servicios','ecommerce'],
    q2: ['+500','200-500'],
    q3: ['alto','medio'],
    q4: ['+500k','200-500k'],
    q5: ['+3000','1000-3000'],
    q6: ['sistema','marketing'],
    q7: ['crm','basico'],
    q8: ['ahora','1mes'],
    q9: ['si'],
  },
  warm: { // ~35% — leads tibios
    q1: ['servicios','ecommerce','otra'],
    q2: ['200-500','100-200'],
    q3: ['medio','bajo'],
    q4: ['50-200k','200-500k'],
    q5: ['1000-3000','300-1000'],
    q6: ['marketing','inicio','tiempo'],
    q7: ['basico','no'],
    q8: ['1mes','3meses'],
    q9: ['si','compartida'],
  },
  cold: { // ~25% — leads fríos
    q1: ['otra','ecommerce'],
    q2: ['100-200','-100'],
    q3: ['bajo'],
    q4: ['-50k','50-200k'],
    q5: ['300-1000','0-300'],
    q6: ['inicio','tiempo'],
    q7: ['no','basico'],
    q8: ['3meses','explorando'],
    q9: ['compartida','no'],
  },
};

// Fechas con slots disponibles (verificado en producción)
const FECHAS_DISPONIBLES = [
  '2026-03-26','2026-03-27','2026-03-28','2026-03-29','2026-03-30',
  '2026-03-31','2026-04-01','2026-04-02','2026-04-03','2026-04-04',
];

// Horas dentro del horario configurado (10:00-21:00)
const HORAS_DISPONIBLES = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];

// Custom field IDs reales
const CF_INVERSION = '9CVYG4HZq0U94kCtvzMh';
const CF_NEGOCIO   = 'h1zj59J1oZOOZNyXYp1v';
const CF_TICKET    = 'IUsjyqxqr9hkaohb9q3e';

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getProfile() {
  const r = Math.random();
  if (r < 0.40) return 'hot';
  if (r < 0.75) return 'warm';
  return 'cold';
}

function generateQuizResponses(profile) {
  const p = QUIZ_PROFILES[profile];
  return {
    q1_negocio:    pick(p.q1),
    q2_ticket:     pick(p.q2),
    q3_margen:     pick(p.q3),
    q4_facturacion:pick(p.q4),
    q5_inversion:  pick(p.q5),
    q6_frena:      pick(p.q6),
    q7_sistema:    pick(p.q7),
    q8_tiempo:     pick(p.q8),
    q9_decisor:    pick(p.q9),
  };
}

function calcScore(responses) {
  const scoreMap = {
    q1_negocio:    { saas: 30, ecommerce: 25, servicios: 20, otra: 10 },
    q2_ticket:     { '+500': 20, '200-500': 15, '100-200': 10, '-100': 5 },
    q3_margen:     { alto: 15, medio: 10, bajo: 5 },
    q4_facturacion:{ '+500k': 25, '200-500k': 20, '50-200k': 15, '-50k': 10 },
    q5_inversion:  { '+3000': 30, '1000-3000': 25, '300-1000': 15, '0-300': 0 },
    q6_frena:      { sistema: 25, marketing: 25, inicio: 20, tiempo: 15 },
    q7_sistema:    { crm: 20, basico: 15, no: 0 },
    q8_tiempo:     { ahora: 30, '1mes': 20, '3meses': 10, explorando: 5 },
    q9_decisor:    { si: 20, compartida: 10, no: 0 },
  };
  let total = 0;
  for (const [key, val] of Object.entries(responses)) {
    total += scoreMap[key]?.[val] || 0;
  }
  return Math.round((total / 215) * 100);
}

function getPrioridad(score) {
  if (score >= 75) return 'maxima';
  if (score >= 50) return 'media';
  return 'baja';
}

function generateLead(index) {
  const nombre   = pick(NOMBRES);
  const apellido = pick(APELLIDOS);
  const profile  = getProfile();
  const quiz     = generateQuizResponses(profile);
  const score    = calcScore(quiz);
  const prioridad = getPrioridad(score);

  const fecha = pick(FECHAS_DISPONIBLES);
  const hora  = pick(HORAS_DISPONIBLES);

  const inversionLabel = quiz.q5_inversion;
  const negocio = pick(NEGOCIOS);
  const ticket  = quiz.q2_ticket;

  // Tag GHL según prioridad
  const tagMap = { maxima: 'Maxima-Prioridad', media: 'Media-Prioridad', baja: 'Baja-Prioridad' };

  // Nota completa del lead (como lo haría el frontend)
  const notaLead = [
    `📋 DATOS DEL LEAD — Test de estrés #${index}`,
    `Nombre: ${nombre} ${apellido}`,
    `Score: ${score}% (${prioridad})`,
    `Perfil: ${profile}`,
    `Negocio: ${negocio}`,
    `Ticket: ${ticket}`,
    `Inversión: ${inversionLabel}`,
    `Fecha seleccionada: ${fecha}`,
    `Hora seleccionada: ${hora}`,
    `---`,
    `Respuestas quiz:`,
    ...Object.entries(quiz).map(([k, v]) => `  ${k}: ${v}`),
  ].join('\n');

  return {
    contact: {
      email:     `stress.real.${index}.${Date.now()}@test-booking.dev`,
      firstName: nombre,
      lastName:  apellido,
      phone:     `+346${String(Math.floor(Math.random() * 90000000) + 10000000)}`,
      tags:      [tagMap[prioridad] || 'Baja-Prioridad'],
      customFields: [
        { id: CF_INVERSION, value: inversionLabel },
        { id: CF_NEGOCIO,   value: negocio },
        { id: CF_TICKET,    value: ticket },
      ],
    },
    opportunity: {
      name: `${nombre} ${apellido} — Auditoría FOCUS`,
    },
    appointment: {
      startTime:        `${fecha}T${hora}:00+01:00`,
      endTime:          (() => {
        const h = parseInt(hora.split(':')[0]);
        const endH = String(h).padStart(2, '0');
        return `${fecha}T${endH}:45:00+01:00`;
      })(),
      selectedTimezone: 'Europe/Madrid',
      title:            'Auditoría FOCUS Consulting',
    },
    leadMeta: {
      email:     `stress.real.${index}.${Date.now()}@test-booking.dev`,
      nombre,
      apellidos: apellido,
      telefono:  `+346${String(Math.floor(Math.random() * 90000000) + 10000000)}`,
      prioridad,
      quizScore: score,
      fecha,
      hora,
      notaLead,
    },
  };
}

// ── EJECUTOR DE REQUEST ──────────────────────────
async function sendBooking(lead, globalIndex) {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(`${BASE_URL}/api/booking`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(lead),
      signal:  controller.signal,
    });
    clearTimeout(timeout);
    const ms   = Date.now() - start;
    const data = await res.json();

    return {
      index: globalIndex,
      ok: data.success === true,
      status: res.status,
      ms,
      contactId: data.contactId || null,
      appointmentId: data.appointmentId || null,
      errorStep: data.errorStep || null,
      errorMessage: data.errorMessage || null,
      email: lead.contact.email,
      fecha: lead.leadMeta.fecha,
      hora: lead.leadMeta.hora,
      prioridad: lead.leadMeta.prioridad,
      score: lead.leadMeta.quizScore,
    };
  } catch (err) {
    clearTimeout(timeout);
    const ms = Date.now() - start;
    return {
      index: globalIndex,
      ok: false,
      status: err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK',
      ms,
      errorStep: 'network',
      errorMessage: err.message,
      email: lead.contact.email,
      fecha: lead.leadMeta.fecha,
      hora: lead.leadMeta.hora,
      prioridad: lead.leadMeta.prioridad,
      score: lead.leadMeta.quizScore,
    };
  }
}

// ── EJECUTOR DE TANDA ────────────────────────────
async function runWave(leads, waveName, globalOffset) {
  const results = [];
  const groups  = [];
  for (let i = 0; i < leads.length; i += CONCURRENCY) {
    groups.push(leads.slice(i, i + CONCURRENCY));
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  🚀 ${waveName}: ${leads.length} agendas (${groups.length} grupos de ${CONCURRENCY})`);
  console.log(`${'═'.repeat(60)}`);

  let okCount = 0;
  let errCount = 0;

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const groupResults = await Promise.all(
      group.map((lead, i) => sendBooking(lead, globalOffset + g * CONCURRENCY + i))
    );

    for (const r of groupResults) {
      results.push(r);
      if (r.ok) {
        okCount++;
        process.stdout.write(`\r   ✅ ${okCount} OK | ❌ ${errCount} ERR | Progreso: ${results.length}/${leads.length}`);
      } else {
        errCount++;
        process.stdout.write(`\r   ✅ ${okCount} OK | ❌ ${errCount} ERR | Progreso: ${results.length}/${leads.length}`);
        // Log del error inmediato
        console.log(`\n   ⚠️  #${r.index}: ${r.errorStep} → ${r.errorMessage} (${r.ms}ms)`);
      }
    }

    // Delay entre grupos para no saturar GHL
    if (g < groups.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS));
    }
  }

  console.log(`\n   Completado: ${okCount}/${leads.length} éxitos`);
  return results;
}

// ── ESTADÍSTICAS ─────────────────────────────────
function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function printFinalReport(allResults, waveResults) {
  const ok     = allResults.filter(r => r.ok);
  const errors = allResults.filter(r => !r.ok);
  const times  = allResults.map(r => r.ms).sort((a, b) => a - b);
  const avg    = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  const p95    = percentile(times, 95);
  const p99    = percentile(times, 99);

  const errByStep = {};
  errors.forEach(e => {
    const key = e.errorStep || 'unknown';
    errByStep[key] = (errByStep[key] || 0) + 1;
  });

  const byPrioridad = { maxima: { ok: 0, err: 0 }, media: { ok: 0, err: 0 }, baja: { ok: 0, err: 0 } };
  allResults.forEach(r => {
    const p = r.prioridad || 'baja';
    if (r.ok) byPrioridad[p].ok++;
    else byPrioridad[p].err++;
  });

  const successPct = Math.round((ok.length / allResults.length) * 1000) / 10;

  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     REPORTE FINAL — TEST DE ESTRÉS REAL (GHL)          ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║ Total enviados:         ${String(allResults.length).padEnd(33)}║`);
  console.log(`║ Éxitos:                 ${String(`${ok.length} (${successPct}%)`).padEnd(33)}║`);
  console.log(`║ Errores:                ${String(`${errors.length} (${(100 - successPct).toFixed(1)}%)`).padEnd(33)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║ TIEMPOS DE RESPUESTA                                   ║');
  console.log(`║ Mínimo:                 ${String(`${times[0]}ms`).padEnd(33)}║`);
  console.log(`║ Máximo:                 ${String(`${times[times.length - 1]}ms`).padEnd(33)}║`);
  console.log(`║ Promedio:               ${String(`${avg}ms`).padEnd(33)}║`);
  console.log(`║ Percentil 95:           ${String(`${p95}ms`).padEnd(33)}║`);
  console.log(`║ Percentil 99:           ${String(`${p99}ms`).padEnd(33)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║ RESULTADOS POR TANDA                                   ║');
  waveResults.forEach((wr, i) => {
    const wOk = wr.filter(r => r.ok).length;
    console.log(`║ ${WAVES[i].name}: ${String(`${wOk}/${wr.length} OK`).padEnd(44)}║`);
  });
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║ RESULTADOS POR PRIORIDAD                               ║');
  for (const [p, counts] of Object.entries(byPrioridad)) {
    const total = counts.ok + counts.err;
    if (total > 0) {
      console.log(`║ ${p.padEnd(10)}: ${String(`${counts.ok}/${total} OK`).padEnd(38)}║`);
    }
  }
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║ ERRORES POR PASO                                       ║');
  if (Object.keys(errByStep).length === 0) {
    console.log('║ Ninguno — todo perfecto                                ║');
  } else {
    for (const [step, count] of Object.entries(errByStep)) {
      console.log(`║ ${step.padEnd(20)}: ${String(count).padEnd(30)}║`);
    }
  }
  console.log('╠══════════════════════════════════════════════════════════╣');
  const verdict = successPct >= 95 ? '✅ APTO PARA PRODUCCIÓN' : '❌ REVISAR ANTES DEL LANZAMIENTO';
  console.log(`║ VEREDICTO: ${verdict.padEnd(46)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  return { allResults, ok, errors, times, avg, p95, p99, errByStep, byPrioridad, successPct, waveResults };
}

// ── GUARDAR REPORTE ──────────────────────────────
function saveReport(report) {
  const fs   = require('fs');
  const path = require('path');
  const ts   = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(__dirname, `stress-real-report-${ts}.json`);

  const data = {
    timestamp: new Date().toISOString(),
    target: BASE_URL,
    waves: WAVES,
    summary: {
      total:      report.allResults.length,
      ok:         report.ok.length,
      errors:     report.errors.length,
      successPct: report.successPct,
      avgMs:      report.avg,
      p95Ms:      report.p95,
      p99Ms:      report.p99,
    },
    errByStep:    report.errByStep,
    byPrioridad:  report.byPrioridad,
    raw:          report.allResults,
  };

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`\n📄 Reporte guardado en: ${file}`);
  return file;
}

// ── MAIN ─────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  STRESS TEST REAL — 500 agendas contra GHL             ║');
  console.log(`║  Target: ${BASE_URL.padEnd(48)}║`);
  console.log(`║  Tandas: 200 → 150 → 80 → 70                          ║`);
  console.log(`║  Concurrencia: ${CONCURRENCY} simultáneos                            ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Health check
  try {
    const health = await fetch(`${BASE_URL}/api/health`);
    const data   = await health.json();
    if (data.status !== 'ok') throw new Error('health check failed');
    console.log(`\n✅ Servidor activo`);
  } catch (_) {
    console.error('\n❌ El servidor no responde.');
    process.exit(1);
  }

  // Generar todos los leads
  const totalCount = WAVES.reduce((sum, w) => sum + w.count, 0);
  console.log(`\n📝 Generando ${totalCount} leads ficticios...`);
  const allLeads = Array.from({ length: totalCount }, (_, i) => generateLead(i + 1));

  // Ejecutar tandas
  const waveResults = [];
  let offset = 0;

  for (let w = 0; w < WAVES.length; w++) {
    const wave = WAVES[w];
    const leads = allLeads.slice(offset, offset + wave.count);
    const results = await runWave(leads, wave.name, offset);
    waveResults.push(results);
    offset += wave.count;

    // Pausa entre tandas (excepto la última)
    if (w < WAVES.length - 1) {
      console.log(`\n⏸️  Pausa de 10s antes de la siguiente tanda...`);
      await new Promise(r => setTimeout(r, 10_000));
    }
  }

  const allResults = waveResults.flat();
  const report = printFinalReport(allResults, waveResults);
  saveReport(report);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
