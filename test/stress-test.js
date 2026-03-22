'use strict';
// ─────────────────────────────────────────────────────────
//  STRESS TEST — Simulación de 500 agendamientos en 1 hora
//  REQUIERE: STRESS_TEST_MODE=true en el servidor
//
//  Uso:
//    node test/stress-test.js          → simulación real (60 min)
//    node test/stress-test.js --fast   → comprimido (3 min)
// ─────────────────────────────────────────────────────────

const CONFIG = {
  TARGET_URL:          'http://localhost:3000',
  TOTAL_BOOKINGS:      500,
  WAVE_1_COUNT:        350,
  WAVE_1_DURATION_MS:  20 * 60 * 1000,
  WAVE_2_COUNT:        150,
  WAVE_2_DURATION_MS:  40 * 60 * 1000,
  CONCURRENCY:         20,
  REQUEST_TIMEOUT_MS:  10_000,
};

// --fast: comprime los tiempos a 3 minutos totales
if (process.argv.includes('--fast')) {
  CONFIG.WAVE_1_DURATION_MS = 60 * 1000;
  CONFIG.WAVE_2_DURATION_MS = 120 * 1000;
  console.log('⚡ Modo --fast: 500 requests en ~3 minutos\n');
}

// ── GENERADOR DE LEADS FICTICIOS ──────────────
const NOMBRES    = ['Carlos', 'María', 'Javier', 'Laura', 'Miguel', 'Ana', 'Pablo', 'Lucía', 'David', 'Sara', 'Sergio', 'Elena', 'Alberto', 'Marta', 'Rubén', 'Nuria', 'Alejandro', 'Patricia', 'Iván', 'Cristina'];
const APELLIDOS  = ['García', 'Martínez', 'López', 'Sánchez', 'González', 'Fernández', 'Pérez', 'Rodríguez', 'Romero', 'Torres', 'Jiménez', 'Navarro', 'Moreno', 'Molina', 'Ortega', 'Ruiz', 'Castro', 'Vega', 'Ramos', 'Díaz'];
const NEGOCIOS   = ['Consultoría', 'E-commerce', 'Agencia marketing', 'Inmobiliaria', 'Restauración', 'Tecnología', 'Clínica dental', 'Academia online', 'Fisioterapia', 'Arquitectura'];
const TICKETS    = ['500', '1000', '2000', '5000', '300', '800', '1500', '3000'];
const INVERSIONES = [
  ...Array(30).fill('+3000'),
  ...Array(30).fill('1000-3000'),
  ...Array(25).fill('300-1000'),
  ...Array(15).fill('0-300'),
];
const FECHAS_VIP    = ['2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-06'];
const FECHAS_BASICO = ['2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-13'];
const HORAS         = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateLead(index) {
  const nombre    = pick(NOMBRES);
  const apellido  = pick(APELLIDOS);
  const inversion = pick(INVERSIONES);
  const isVip     = ['+3000', '1000-3000'].includes(inversion);
  const fecha     = pick(isVip ? FECHAS_VIP : FECHAS_BASICO);
  const hora      = pick(HORAS);

  return {
    contact: {
      email:        `stress.test.${index}.${Date.now()}@test-booking.dev`,
      firstName:    nombre,
      lastName:     apellido,
      phone:        `+346${String(Math.floor(Math.random() * 90000000) + 10000000)}`,
      tags:         [isVip ? 'Prioritario' : 'Estandar'],
      customFields: [
        { id: 'stress_inversion',  value: inversion },
        { id: 'stress_negocio',    value: pick(NEGOCIOS) },
        { id: 'stress_ticket',     value: pick(TICKETS) },
      ],
    },
    opportunity: { name: `${nombre} ${apellido}` },
    appointment: {
      startTime:        `${fecha}T${hora}:00+01:00`,
      endTime:          `${fecha}T${hora}:45+01:00`,
      selectedTimezone: 'Europe/Madrid',
      title:            `Auditoría · Lanzamiento Marzo 2026`,
    },
    leadMeta: {
      email: `stress.test.${index}@test-booking.dev`,
      tier:  isVip ? 'vip' : 'basico',
      fecha,
      hora,
    },
  };
}

// ── EJECUTOR DE REQUEST INDIVIDUAL ────────────
async function sendBooking(lead, index) {
  const start = Date.now();
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${CONFIG.TARGET_URL}/api/booking`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(lead),
      signal:  controller.signal,
    });
    clearTimeout(timeout);
    const ms   = Date.now() - start;
    const data = await res.json();
    return { index, ok: data.success === true, status: res.status, ms, error: data.success ? null : (data.errorStep || String(res.status)) };
  } catch (err) {
    clearTimeout(timeout);
    const ms = Date.now() - start;
    const isTimeout = err.name === 'AbortError';
    return { index, ok: false, status: isTimeout ? 'TIMEOUT' : 'NETWORK', ms, error: isTimeout ? 'TIMEOUT' : err.message };
  }
}

// ── EJECUTOR DE OLEADA ────────────────────────
async function runWave(leads, durationMs, waveName) {
  const results  = [];
  const groups   = [];
  for (let i = 0; i < leads.length; i += CONFIG.CONCURRENCY) {
    groups.push(leads.slice(i, i + CONFIG.CONCURRENCY));
  }

  const delayBetween = groups.length > 1 ? durationMs / (groups.length - 1) : 0;
  let maxConcurrent  = 0;

  console.log(`\n🚀 ${waveName}: ${leads.length} requests en ${Math.round(durationMs / 1000)}s (${groups.length} grupos de ${CONFIG.CONCURRENCY})`);

  for (let g = 0; g < groups.length; g++) {
    const group   = groups[g];
    const offset  = leads.indexOf(group[0]);
    maxConcurrent = Math.max(maxConcurrent, group.length);

    process.stdout.write(`\r   Grupo ${g + 1}/${groups.length} — completados: ${results.length}/${leads.length}`);

    const groupResults = await Promise.all(group.map((lead, i) => sendBooking(lead, offset + i)));
    results.push(...groupResults);

    if (g < groups.length - 1 && delayBetween > 0) {
      await new Promise(r => setTimeout(r, delayBetween));
    }
  }

  process.stdout.write(`\r   Completado: ${results.length}/${leads.length}                    \n`);
  return { results, maxConcurrent };
}

// ── ESTADÍSTICAS ──────────────────────────────
function percentile(sortedArr, p) {
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)];
}

function buildReport(wave1, wave2) {
  const all     = [...wave1.results, ...wave2.results];
  const ok      = all.filter(r => r.ok);
  const errors  = all.filter(r => !r.ok);
  const times   = all.map(r => r.ms).sort((a, b) => a - b);

  const errCounts = {};
  errors.forEach(e => {
    const key = String(e.status);
    errCounts[key] = (errCounts[key] || 0) + 1;
  });

  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  const p95 = percentile(times, 95);
  const p99 = percentile(times, 99);

  const rate429    = errCounts['429'] || 0;
  const successPct = Math.round((ok.length / all.length) * 100 * 10) / 10;
  const verdict    = successPct >= 95 && avg < 1000 && !errCounts['429']
    ? '✅ APTO PARA PRODUCCIÓN'
    : '❌ REVISAR ANTES DEL LANZAMIENTO';

  return { all, ok, errors, times, errCounts, avg, p95, p99, rate429, successPct, verdict, wave1, wave2 };
}

function printReport(r) {
  const pad  = (str, n) => String(str).padEnd(n);
  const line = (label, value) => `║ ${pad(label, 28)}${pad(value, 14)}║`;

  console.log('\n');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        REPORTE DE ESTRÉS — v1.2              ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(line('Total enviados:', r.all.length));
  console.log(line('Éxitos:', `${r.ok.length} (${r.successPct}%)`));
  console.log(line('Errores:', `${r.errors.length} (${100 - r.successPct}%)`));
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║ TIEMPOS DE RESPUESTA                         ║');
  console.log(line('Mínimo:', `${r.times[0]}ms`));
  console.log(line('Máximo:', `${r.times[r.times.length - 1]}ms`));
  console.log(line('Promedio:', `${r.avg}ms`));
  console.log(line('Percentil 95:', `${r.p95}ms`));
  console.log(line('Percentil 99:', `${r.p99}ms`));
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║ OLEADA 1 (pico webinar)                      ║');
  console.log(line(`${CONFIG.WAVE_1_COUNT} req →`, `${r.wave1.results.filter(x => x.ok).length} éxitos`));
  console.log(line('Pico simultáneo:', r.wave1.maxConcurrent));
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║ OLEADA 2 (post-webinar)                      ║');
  console.log(line(`${CONFIG.WAVE_2_COUNT} req →`, `${r.wave2.results.filter(x => x.ok).length} éxitos`));
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║ ERRORES DETECTADOS                           ║');
  if (Object.keys(r.errCounts).length === 0) {
    console.log('║ Ninguno                                      ║');
  } else {
    Object.entries(r.errCounts).forEach(([code, count]) => {
      const label = code === 'TIMEOUT' ? 'Timeout (>10s)' : `HTTP ${code}`;
      console.log(line(`${label}:`, count));
    });
  }
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║ VEREDICTO: ${r.verdict.padEnd(35)}║`);
  console.log('╚══════════════════════════════════════════════╝');

  // Sugerencia automática si hay rate limit
  if (r.rate429 > 0) {
    const needed = Math.ceil(CONFIG.WAVE_1_COUNT / (CONFIG.WAVE_1_DURATION_MS / 1000 / 60) * 15);
    console.log(`\n⚠️  Rate limit alcanzado (${r.rate429} errores 429).`);
    console.log(`   Sube el límite en server.js a: max: ${needed}`);
    console.log(`   Línea a cambiar: const limiter = rateLimit({ windowMs: 15*60*1000, max: ${needed} })\n`);
  }
}

// ── GUARDAR REPORTE JSON ──────────────────────
function saveReport(r) {
  const fs        = require('fs');
  const path      = require('path');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file      = path.join(__dirname, `stress-report-${timestamp}.json`);
  const data = {
    timestamp:   new Date().toISOString(),
    config:      CONFIG,
    summary: {
      total:      r.all.length,
      ok:         r.ok.length,
      errors:     r.errors.length,
      successPct: r.successPct,
      avgMs:      r.avg,
      p95Ms:      r.p95,
      p99Ms:      r.p99,
      verdict:    r.verdict,
    },
    errCounts: r.errCounts,
    raw:       r.all,
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`\n📄 Reporte guardado en: ${file}`);
}

// ── MAIN ──────────────────────────────────────
async function main() {
  console.log('════════════════════════════════════════════════');
  console.log('  STRESS TEST — Booking App v1.2');
  console.log(`  Target: ${CONFIG.TARGET_URL}`);
  console.log(`  Total:  ${CONFIG.TOTAL_BOOKINGS} bookings`);
  console.log('════════════════════════════════════════════════');

  // Verificar que el servidor está vivo
  try {
    const health = await fetch(`${CONFIG.TARGET_URL}/api/health`);
    const data   = await health.json();
    if (data.status !== 'ok') throw new Error('health check failed');
    console.log(`\n✅ Servidor activo (v${data.version || '?'})`);
  } catch (_) {
    console.error('\n❌ El servidor no responde. Arranca el servidor antes del test.');
    process.exit(1);
  }

  // Verificar STRESS_TEST_MODE
  try {
    const testRes  = await fetch(`${CONFIG.TARGET_URL}/api/booking`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contact: { email: 'probe@test.dev', firstName: 'Test', lastName: 'Test' }, opportunity: { name: 'Test' }, appointment: { startTime: '2026-03-24T10:00:00+01:00', endTime: '2026-03-24T10:45:00+01:00', selectedTimezone: 'Europe/Madrid', title: 'Test' }, leadMeta: { email: 'probe@test.dev', tier: 'vip', fecha: '2026-03-24', hora: '10:00' } }),
    });
    const testData = await testRes.json();
    if (!testData.success || !testData.contactId?.startsWith('stress_')) {
      console.error('\n❌ STRESS_TEST_MODE no está activo en el servidor.');
      console.error('   Añade STRESS_TEST_MODE=true al .env y reinicia el servidor.\n');
      process.exit(1);
    }
    console.log('✅ STRESS_TEST_MODE confirmado — GHL no recibirá llamadas reales\n');
  } catch (err) {
    console.error('\n❌ Error al verificar el modo de test:', err.message);
    process.exit(1);
  }

  // Generar leads
  const allLeads = Array.from({ length: CONFIG.TOTAL_BOOKINGS }, (_, i) => generateLead(i + 1));
  const leads1   = allLeads.slice(0, CONFIG.WAVE_1_COUNT);
  const leads2   = allLeads.slice(CONFIG.WAVE_1_COUNT);

  const startTime = Date.now();

  const wave1 = await runWave(leads1, CONFIG.WAVE_1_DURATION_MS, 'OLEADA 1 — Pico webinar');
  const wave2 = await runWave(leads2, CONFIG.WAVE_2_DURATION_MS, 'OLEADA 2 — Post-webinar');

  const totalMs = Date.now() - startTime;
  console.log(`\nTiempo total real: ${Math.round(totalMs / 1000)}s`);

  const report = buildReport(wave1, wave2);
  printReport(report);
  saveReport(report);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
