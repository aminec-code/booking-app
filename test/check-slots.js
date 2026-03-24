'use strict';

const BASE = 'https://booking-app-production-11e0.up.railway.app';

// Todas las fechas del rango del lanzamiento
const FECHAS = [];
const start = new Date('2026-03-25');
const end   = new Date('2026-04-20');
for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  FECHAS.push(d.toISOString().slice(0, 10));
}

async function checkSlots() {
  console.log('Consultando slots disponibles en GHL para cada fecha...\n');
  
  let totalSlots = 0;
  let totalDiasConSlots = 0;
  const results = [];

  for (const fecha of FECHAS) {
    try {
      const res = await fetch(`${BASE}/api/slots?fecha=${fecha}`);
      const data = await res.json();
      
      let slots = [];
      for (const [key, val] of Object.entries(data)) {
        if (key !== 'traceId' && val && val.slots) {
          slots = slots.concat(val.slots);
        }
      }
      
      // Filtrar solo horas dentro del horario (10:00-21:00)
      const slotsEnHorario = slots.filter(s => {
        const hour = parseInt(s.split('T')[1].split(':')[0]);
        return hour >= 10 && hour <= 21;
      });

      results.push({ fecha, total: slots.length, enHorario: slotsEnHorario.length });
      totalSlots += slotsEnHorario.length;
      if (slotsEnHorario.length > 0) totalDiasConSlots++;
      
      const dia = new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short' });
      console.log(`${fecha} (${dia}): ${slotsEnHorario.length} slots en horario | ${slots.length} slots GHL total`);
      
      // Pequeño delay para no saturar
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.log(`${fecha}: ERROR - ${err.message}`);
      results.push({ fecha, total: 0, enHorario: 0 });
    }
  }

  console.log('\n════════════════════════════════════════════════');
  console.log(`TOTAL SLOTS DISPONIBLES (en horario 10-21h): ${totalSlots}`);
  console.log(`Días con disponibilidad: ${totalDiasConSlots}/${FECHAS.length}`);
  console.log('════════════════════════════════════════════════');
  
  // Resumen por semana
  console.log('\nResumen por semana:');
  const semanas = {};
  results.forEach(r => {
    const d = new Date(r.fecha + 'T12:00:00');
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay() + 1); // lunes
    const weekKey = weekStart.toISOString().slice(0, 10);
    if (!semanas[weekKey]) semanas[weekKey] = 0;
    semanas[weekKey] += r.enHorario;
  });
  for (const [week, count] of Object.entries(semanas)) {
    console.log(`  Semana del ${week}: ${count} slots`);
  }
}

checkSlots().catch(console.error);
