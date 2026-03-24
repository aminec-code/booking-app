# Auditoría Completa - Booking App
## Bugs, Edge Cases y Soluciones

---

## BUG 1 — CRÍTICO: Desfase UTC en consulta de free-slots
**Archivo:** `server.js` líneas 407-408
**Problema:** Los timestamps de startDate/endDate se calculan en UTC, pero GHL espera el rango en la zona horaria del calendario (Europe/Madrid). Esto causa que:
- Para fecha=2026-03-25, se envía rango UTC 00:00-23:59 que en Madrid es 01:00-00:59+1
- GHL devuelve slots del día SIGUIENTE en la clave del día siguiente
- El frontend busca `data["2026-03-25"]` pero GHL devuelve `data["2026-03-26"]`
- Resultado: rawSlots = [] → fallback marca TODOS los slots como disponibles

**Impacto:** Los usuarios ven todos los horarios como disponibles aunque estén ocupados. Al confirmar, GHL rechaza → error.

**Solución:** No usar timestamps epoch. Usar el formato ISO con timezone que GHL acepta, o calcular el offset correcto de Madrid.

---

## BUG 2 — CRÍTICO: Fallback peligroso cuando GHL no devuelve slots
**Archivo:** `calendar.js` líneas 133-135
**Problema:** Si `ghlGetFreeSlots` devuelve null o array vacío, TODOS los slots se marcan como `available: true`. Combinado con Bug 1, esto pasa constantemente.

**Impacto:** El usuario selecciona un slot "disponible" que en realidad está ocupado → error al confirmar.

**Solución:** Si GHL devuelve vacío, NO asumir que todo está libre. Mostrar un mensaje de "no se pudo verificar disponibilidad" o reintentar.

---

## BUG 3 — CRÍTICO: Parsing de respuesta GHL ignora fechas cruzadas
**Archivo:** `ghl.js` líneas 82-90
**Problema:** GHL devuelve slots agrupados por fecha. La respuesta puede contener múltiples fechas (ej: slots del día pedido + medianoche del siguiente). El parser solo busca `data[fecha]` exacta, ignorando slots que GHL agrupa bajo otra fecha.

**Impacto:** Slots válidos se pierden o se mezclan con slots de otro día.

**Solución:** Iterar TODAS las claves de fecha en la respuesta, filtrar solo los slots cuya hora Madrid cae dentro del día pedido.

---

## BUG 4 — ALTO: SCORE_MAXIMO_POSIBLE incorrecto
**Archivo:** `server.js` línea 157 (config dinámico)
**Problema:** `SCORE_MAXIMO_POSIBLE` está en 200, pero la suma real de scores máximos es 215.
- Score normalizado = (score_real / 200) * 100
- Un lead perfecto obtiene 215/200*100 = 107.5 (se redondea a 108)
- Esto hace que los umbrales de prioridad sean más fáciles de alcanzar

**Impacto:** Más leads se clasifican como "Máxima Prioridad" de lo que deberían. Puede saturar las fechas tempranas.

**Solución:** Cambiar a 215 o recalcular los umbrales.

---

## BUG 5 — ALTO: Filesystem efímero en Railway
**Archivo:** `server.js` líneas 13-14
**Problema:** `failed_bookings.json` y `bookings_backup.json` se guardan en el filesystem local. Railway usa filesystem efímero que se borra en cada redeploy.

**Impacto:** Se pierden todos los registros de errores y backups en cada deploy. Durante el lanzamiento, si hay que hacer un hotfix y redesplegar, se pierde todo.

**Solución:** Usar una base de datos externa (Redis, PostgreSQL, o incluso un JSON en S3) o al menos loguear a un servicio externo.

---

## BUG 6 — ALTO: Cambio de horario DST (29 marzo 2026)
**Archivo:** `ghl.js` función `buildISOWithTimezone`
**Problema:** El 29 de marzo 2026, España cambia de UTC+1 a UTC+2. La función `buildISOWithTimezone` calcula el offset comparando UTC con Madrid, lo cual puede dar resultados incorrectos durante la transición (la hora 02:00 no existe ese día).

**Impacto:** Citas agendadas para el 29 de marzo podrían tener la hora incorrecta en GHL.

**Solución:** La función ya maneja esto razonablemente con Intl.DateTimeFormat, pero hay que verificar que no se generen horas en el rango 02:00-03:00 del 29/03.

---

## BUG 7 — MEDIO: Race condition en doble booking
**Archivo:** `booking.js` líneas 301-319
**Problema:** La validación pre-booking consulta slots libres, pero entre la validación y el envío a GHL pueden pasar segundos. Si dos usuarios seleccionan el mismo slot, ambos pasan la validación pero solo uno puede reservar.

**Impacto:** El segundo usuario recibe error después de haber esperado. Ya está parcialmente manejado con `showSlotUnavailable`, pero la UX podría mejorar.

**Solución:** Aceptable como está, pero añadir un mecanismo de "lock" temporal o mostrar un contador de "X personas viendo este horario".

---

## BUG 8 — MEDIO: Admin endpoints sin await
**Archivo:** `server.js` líneas 482-493
**Problema:** `readBackupDB()` y `readFailedBookings()` son funciones async que devuelven Promises, pero en los handlers de admin se llaman sin `await`:
```js
app.get('/api/admin/backup', requireAdmin, (req, res) => {
  res.json(readBackupDB());  // ← Envía una Promise, no el resultado
});
```

**Impacto:** El endpoint `/api/admin/backup` devuelve `{}` en lugar de los datos reales. El dashboard admin no muestra datos.

**Solución:** Añadir `async/await` a estos handlers.

---

## BUG 9 — MEDIO: Funciones legacy muertas en ghl.js
**Archivo:** `ghl.js` líneas 112-207
**Problema:** `ghlUpsertContact`, `ghlCreateOpportunity`, `ghlCreateAppointment` llaman a endpoints que NO existen en server.js (`/api/contacts/upsert`, `/api/opportunities`, `/api/appointments`).

**Impacto:** Si alguien invoca estas funciones por error → 404. No afecta al flujo actual (usa `ghlSubmitBooking`), pero es código muerto confuso.

**Solución:** Eliminar o marcar como deprecated.

---

## BUG 10 — MEDIO: getNextBusinessDays excluye fines de semana
**Archivo:** `calendar.js` líneas 37-51
**Problema:** La función excluye sábados y domingos. Pero el horario configurado es 10:00-22:00 sin distinción de día. Si el lanzamiento necesita disponibilidad en fin de semana, no se mostrará.

**Impacto:** Los fines de semana nunca aparecen como disponibles, aunque GHL tenga slots libres.

**Solución:** Verificar si se quieren incluir fines de semana. Si sí, eliminar el filtro `dow !== 0 && dow !== 6`.

---

## BUG 11 — MEDIO: Google Calendar URL usa hora local sin timezone
**Archivo:** `calendar.js` líneas 556-572
**Problema:** `buildGoogleCalendarUrl` usa `parseLocalDate` y `setHours` que trabajan en hora local del navegador, no en hora Madrid. Luego convierte a ISO con `toISOString()` que es UTC. Si el usuario está en otra zona horaria, la hora en Google Calendar será incorrecta.

**Impacto:** El recordatorio de Google Calendar muestra la hora equivocada para usuarios fuera de España.

**Solución:** Usar `buildISOWithTimezone` para generar las fechas correctas en Madrid y luego convertir a formato Google Calendar.

---

## BUG 12 — BAJO: Validación de teléfono muy permisiva
**Archivo:** `booking.js` línea 100
**Problema:** Solo verifica `length >= 6`. Acepta cualquier string de 6+ caracteres como teléfono válido (ej: "aaaaaa").

**Impacto:** Datos de contacto inválidos en GHL.

**Solución:** Añadir regex para validar formato numérico.

---

## BUG 13 — BAJO: Instagram sin validación de formato
**Archivo:** `booking.js` líneas 97, 102
**Problema:** El campo Instagram solo verifica que no esté vacío. No valida formato (@usuario, sin espacios, etc.).

**Impacto:** Datos inconsistentes en GHL.

---

## BUG 14 — BAJO: XSS potencial en quiz opciones
**Archivo:** `booking.js` línea 152
**Problema:** `onclick="seleccionarOpcion('${escapeHtml(pregunta.id)}', '${escapeHtml(opcion.value)}')"` — aunque usa escapeHtml, el valor se inyecta en un atributo onclick inline. Si un valor contiene comillas simples escapadas de forma especial, podría haber XSS.

**Impacto:** Bajo porque los valores vienen del config del servidor, no del usuario.

---

## BUG 15 — BAJO: Timeout de 10s en ghlFetch puede ser corto
**Archivo:** `server.js` línea 186
**Problema:** El timeout de 10 segundos para llamadas a GHL puede ser insuficiente bajo carga alta durante el lanzamiento.

**Impacto:** Timeouts prematuros que causan errores innecesarios.

**Solución:** Subir a 15-20 segundos.
