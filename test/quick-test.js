'use strict';
// ─────────────────────────────────────────────────────────
//  QUICK TEST — 10 requests simultáneos
//  Verifica que el servidor responde antes del test completo
//  REQUIERE: STRESS_TEST_MODE=true en el servidor
//
//  Uso: node test/quick-test.js
// ─────────────────────────────────────────────────────────

const TARGET_URL = 'http://localhost:3000';
const COUNT      = 10;
const TIMEOUT_MS = 10_000;

const LEAD = (i) => ({
  contact: {
    email:        `quick.test.${i}.${Date.now()}@test-booking.dev`,
    firstName:    'Quick',
    lastName:     `Test${i}`,
    phone:        '+34600000000',
    tags:         ['Prioritario'],
    customFields: [],
  },
  opportunity: { name: `Quick Test${i}` },
  appointment: {
    startTime:        '2026-03-25T10:00:00+01:00',
    endTime:          '2026-03-25T10:45:00+01:00',
    selectedTimezone: 'Europe/Madrid',
    title:            'Auditoría · Test',
  },
  leadMeta: { email: `quick.test.${i}@test-booking.dev`, tier: 'vip', fecha: '2026-03-25', hora: '10:00' },
});

async function sendOne(i) {
  const start      = Date.now();
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res  = await fetch(`${TARGET_URL}/api/booking`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(LEAD(i)),
      signal:  controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    const ms   = Date.now() - start;
    return { i, ok: data.success === true, ms, status: res.status };
  } catch (err) {
    clearTimeout(timeout);
    return { i, ok: false, ms: Date.now() - start, status: err.name === 'AbortError' ? 'TIMEOUT' : 'ERROR' };
  }
}

async function main() {
  console.log(`\n⚡ Quick Test — ${COUNT} requests simultáneos contra ${TARGET_URL}\n`);

  // Health check
  try {
    const h = await fetch(`${TARGET_URL}/api/health`);
    const d = await h.json();
    console.log(`✅ Servidor activo (v${d.version || '?'})\n`);
  } catch (_) {
    console.error('❌ El servidor no responde en', TARGET_URL);
    process.exit(1);
  }

  const start   = Date.now();
  const results = await Promise.all(Array.from({ length: COUNT }, (_, i) => sendOne(i + 1)));
  const total   = Date.now() - start;

  const ok     = results.filter(r => r.ok);
  const errors = results.filter(r => !r.ok);
  const times  = results.map(r => r.ms).sort((a, b) => a - b);
  const avg    = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

  console.log('┌─────────────────────────────────────┐');
  console.log('│         RESULTADO QUICK TEST         │');
  console.log('├─────────────────────────────────────┤');
  results.forEach(r => {
    const icon = r.ok ? '✅' : '❌';
    console.log(`│ ${icon} Request ${String(r.i).padStart(2)}  ${String(r.ms).padStart(5)}ms   ${String(r.status).padEnd(7)}│`);
  });
  console.log('├─────────────────────────────────────┤');
  console.log(`│ Éxitos:   ${ok.length}/${COUNT}                       │`);
  console.log(`│ Promedio: ${avg}ms                       │`);
  console.log(`│ Total:    ${Math.round(total / 1000)}s                         │`);

  if (errors.length === 0) {
    console.log('│                                     │');
    console.log('│ ✅ LISTO PARA STRESS TEST COMPLETO  │');
  } else {
    console.log('│                                     │');
    console.log('│ ❌ REVISA LOS ERRORES ANTES          │');
    errors.forEach(e => console.log(`│    Request ${e.i}: ${e.status}              │`));
  }
  console.log('└─────────────────────────────────────┘\n');
}

main().catch(err => { console.error(err); process.exit(1); });
