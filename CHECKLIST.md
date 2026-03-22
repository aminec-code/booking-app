# Checklist pre-lanzamiento

## Despliegue
- [ ] Railway desplegado y activo
- [ ] Variables de entorno configuradas en Railway
- [ ] /api/health responde 200
- [ ] index.html carga en el dominio con HTTPS
- [ ] admin.html carga y el login funciona

## Test de estrés
- [ ] quick-test.js pasa (10/10 éxitos)
- [ ] stress-test.js --fast pasa (>95% éxitos)
- [ ] No hay errores 429 en el test
- [ ] Tiempo medio de respuesta < 1000ms

## Prueba end-to-end real (hacer con datos reales el día 23)
- [ ] Booking Prioritario completo → verificar en GHL:
  - [ ] Contacto creado con tag "Prioritario"
  - [ ] Oportunidad creada con nombre "Nombre Apellido"
  - [ ] Cita en el calendario a la hora correcta
  - [ ] Closer asignado correctamente
- [ ] Booking Estándar completo → mismas verificaciones
- [ ] Reasignar closer desde admin → verificar en GHL
- [ ] Intentar booking duplicado → solo 1 oportunidad en GHL

## El día del lanzamiento
- [ ] Abrir Railway dashboard en una pestaña (ver logs en tiempo real)
- [ ] Abrir admin.html en otra pestaña
- [ ] Tener el teléfono de emergencia configurado en config.js
- [ ] failed_bookings.json vacío antes de empezar
