# Notas de Auditoría - Booking App

## Hallazgo crítico: Respuesta de GHL free-slots

La API de GHL `/calendars/{calendarId}/free-slots` devuelve datos en un formato inesperado:

### Ejemplo: Consulta para fecha=2026-03-25
```json
{
    "2026-03-26": {
        "slots": ["2026-03-26T00:00:00+01:00"]
    }
}
```

### Problema 1: GHL devuelve slots en MÚLTIPLES fechas
Cuando pides fecha 2026-03-26, GHL devuelve:
- Clave "2026-03-26" con 23 slots
- Clave "2026-03-27" con 1 slot (medianoche del día siguiente)

### Problema 2: El frontend busca la fecha pedida como clave
En ghl.js línea 84: `data?.[fecha]?.slots` — busca la fecha exacta como clave.
Pero la API de GHL usa timestamps con offset (+01:00), y la fecha en la respuesta
puede ser diferente a la fecha pedida.

### Problema 3: Formato de startDate/endDate en server.js
En server.js línea 407-408:
```js
const dayStart = new Date(`${fecha}T00:00:00Z`).getTime();  // UTC midnight
const dayEnd   = new Date(`${fecha}T23:59:59Z`).getTime();  // UTC end
```
Esto envía timestamps en UTC, pero el timezone es Europe/Madrid (UTC+1 en invierno, UTC+2 en verano).
Resultado: pide slots del día anterior/siguiente en hora local.

Para 2026-03-25 UTC, GHL devuelve slots del 2026-03-26 en Madrid porque:
- 2026-03-25T00:00:00Z = 2026-03-25T01:00:00+01:00 (Madrid)
- 2026-03-25T23:59:59Z = 2026-03-26T00:59:59+01:00 (Madrid)

¡El rango UTC no cubre el día completo en hora Madrid!

### Problema 4: Cambio de horario DST
El 29 de marzo 2026 España cambia a horario de verano (UTC+2).
Esto puede causar que los cálculos de offset fallen durante la transición.

### Problema 5: Fallback peligroso en calendar.js
Línea 134: Si GHL devuelve array vacío o null, TODOS los slots se marcan como disponibles.
Esto significa que si la API falla, el usuario puede seleccionar cualquier hora,
y luego GHL rechaza la cita → error en el último paso.

## Otros problemas detectados

### 6: Race condition en doble booking
Si dos usuarios seleccionan el mismo slot simultáneamente, ambos pasan la validación
pre-booking (línea 301-319 de booking.js) pero solo uno puede reservar realmente.
El segundo recibe error.

### 7: Funciones legacy muertas en ghl.js
ghlUpsertContact, ghlCreateOpportunity, ghlCreateAppointment llaman a endpoints
que NO existen en server.js (/api/contacts/upsert, /api/opportunities, /api/appointments).
Si alguien las invoca por error → 404.

### 8: Admin endpoints sin await
server.js línea 482-484: readBackupDB() y readFailedBookings() son async pero
se llaman sin await en los handlers de admin.

### 9: buildISOWithTimezone puede fallar con horas >= 24
En HORARIO_EXCEPCIONES hay { start: 22, end: 24 }.
getSlotsForDate genera slot "23:00" pero no "24:00".
Sin embargo, si end fuera > 24 o si SLOT_DURATION_MIN se suma, podría generar horas inválidas.

### 10: Persistencia en filesystem de Railway
Railway usa ephemeral filesystem. Los archivos failed_bookings.json y bookings_backup.json
se pierden en cada redeploy. Esto es un problema serio para el tracking de errores.

### 11: SCORE_MAXIMO_POSIBLE incorrecto
CONFIG dice 200, pero sumando los scores máximos de cada pregunta:
q1: 30, q2: 20, q3: 15, q4: 25, q5: 30, q6: 25, q7: 20, q8: 30, q9: 20 = 215
El score normalizado nunca llega a 100 con 200, y con 215 sería correcto.
Esto afecta los umbrales de prioridad.
