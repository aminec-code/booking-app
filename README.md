# Booking App — Sistema de Agendamiento con GHL

App web completa de agendamiento para lanzamientos, conectada directamente a GoHighLevel (GHL) sin intermediarios.

---

## Estructura de archivos

```
booking-app/
├── index.html       → App pública (el lead agenda aquí)
├── admin.html       → Dashboard privado (métricas y leads)
├── config.js        → Toda la configuración del lanzamiento ← EMPIEZA AQUÍ
├── ghl.js           → Todas las llamadas a la API de GHL
├── booking.js       → Lógica del flujo de agendamiento
├── calendar.js      → Lógica del calendario y slots
├── admin.js         → Lógica del dashboard
└── styles.css       → Estilos compartidos
```

---

## 1. Configurar config.js con tus datos de GHL

Abre `config.js` y rellena cada campo:

```js
GHL_API_KEY:     'pk_...'       // Tu Private API Key de GHL
GHL_LOCATION_ID: 'abc123'      // ID de tu sub-cuenta/location
GHL_CALENDAR_ID: 'cal_xyz'     // ID del calendario donde se crearán las citas
GHL_PIPELINE_ID: 'pip_abc'     // ID del pipeline (opcional pero recomendado)
GHL_STAGE_ID:    'stage_xyz'   // ID de la etapa del pipeline
GHL_CUSTOM_FIELD_INVERSION: 'field_id'  // ID del campo personalizado para la inversión
```

> **Modo demo:** Si dejas `GHL_API_KEY` en blanco o con el placeholder, la app funciona completamente en modo demo (los slots se generan localmente y la confirmación falla con un error claro). Úsalo para probar el diseño antes de conectar GHL.

---

## 2. Cómo encontrar cada ID en GoHighLevel

### API Key (Private)
1. Ve a **Settings → API Keys** en tu cuenta GHL
2. Crea una nueva clave de tipo "Private"
3. Copia el valor y pégalo en `GHL_API_KEY`

### Location ID
1. Ve a **Settings → Business Info** (dentro de la sub-cuenta)
2. El Location ID aparece en la URL: `app.gohighlevel.com/location/**abc123**/...`
3. O en **Settings → API Keys**, verás el Location ID asociado

### Calendar ID
1. Ve a **Calendars → Calendars**
2. Haz clic en los 3 puntos del calendario que quieras usar → **Edit**
3. El ID aparece en la URL o en la respuesta de la API: `GET /calendars/`

### Pipeline ID y Stage ID
1. Ve a **Opportunities → Pipelines**
2. Haz clic en el pipeline que quieras
3. El Pipeline ID está en la URL
4. Para el Stage ID, llama a: `GET /opportunities/pipelines/{pipeline_id}` desde la API

### Custom Field ID (Inversión)
1. Ve a **Settings → Custom Fields**
2. Crea un campo de texto llamado "Inversión mensual" (o el nombre que prefieras)
3. El ID lo encuentras en la respuesta de `GET /custom-fields/` vía API

---

## 3. Despliegue en un dominio propio

### Opción A — Subir por FTP
1. Sube todos los archivos a la carpeta raíz o a una subcarpeta de tu hosting (ej: `/reserva/`)
2. Asegúrate de que el servidor sirva `index.html` por defecto
3. Accede a `https://tudominio.com/reserva/`

### Opción B — Netlify Drop (más rápido)
1. Ve a [netlify.com/drop](https://app.netlify.com/drop)
2. Arrastra la carpeta `booking-app/` completa al área indicada
3. Netlify te dará una URL inmediatamente (con HTTPS incluido)
4. Opcional: configura un dominio personalizado desde el panel de Netlify

### Opción C — GitHub Pages
1. Sube los archivos a un repositorio de GitHub
2. Ve a **Settings → Pages**
3. Selecciona la rama `main` y la carpeta raíz (`/`)
4. GitHub te dará una URL tipo `tuusuario.github.io/booking-app/`

> ⚠️ **IMPORTANTE:** La API de GHL requiere HTTPS. En localhost el modo demo funciona, pero para confirmar reservas reales necesitas HTTPS en producción.

---

## 4. Cambiar fechas para el siguiente lanzamiento

Edita únicamente la sección `TIERS` en `config.js`:

```js
TIERS: {
  vip: {
    semanas: [
      { start: '2026-06-01', end: '2026-06-07' },  // ← Cambia estas fechas
      { start: '2026-06-08', end: '2026-06-14' },
    ]
  },
  basico: {
    semanas: [
      { start: '2026-06-15', end: '2026-06-21' },  // ← Y estas
    ]
  }
}
```

También puedes cambiar:
- `LAUNCH_NAME` → el nombre que aparece en la cabecera
- `HORARIO` → el rango de horas general (ej: `{ start: 9, end: 21 }`)
- `HORARIO_EXCEPCIONES` → para días con horario especial
- `SLOT_DURATION_MIN` → duración de cada cita en minutos

---

## 5. Acceder al dashboard admin

Abre `https://tudominio.com/reserva/admin.html`

- **Contraseña por defecto:** la que hayas puesto en `config.js → ADMIN_PASSWORD`
- La sesión se mantiene mientras no cierres el navegador (usa `sessionStorage`)

### Qué muestra el admin
- **Resumen:** 4 métricas clave + gráficos de donut, barras y línea temporal
- **Agendamientos:** Tabla con los últimos 20 registros
- **Gráficos:** Vista ampliada de todos los gráficos
- **Configuración:** Estado de la conexión con GHL y resumen de fechas

### Fuente de datos
1. El admin consulta primero GHL directamente (`GET /calendars/events`)
2. Si GHL no responde o no hay datos, usa `localStorage` como fallback
3. Verás los datos de todos los bookings confirmados desde ese navegador

---

## 6. Flujo técnico completo

```
Lead llega a index.html
    │
    ▼
[Paso 1] Formulario con datos personales + inversión declarada
    │
    ▼  (cálculo instantáneo del tier)
[Paso 2] Calendario filtrado según tier:
    │   VIP   → Semana 1 + Semana 2
    │   Básico → Semana 3
    │
    ▼  (GHL free-slots → filtra ocupados)
Elige día y hora
    │
    ▼  (al confirmar, 3 llamadas en secuencia)
① ghlUpsertContact()      → crea/actualiza contacto con tag de tier
② ghlCreateOpportunity()  → crea oportunidad en pipeline
③ ghlCreateAppointment()  → crea cita en el calendario
    │
    ▼
[Paso 3] Pantalla de confirmación + botón Google Calendar
```

---

## 7. Preguntas frecuentes

**¿Funciona sin GHL?**
Sí. Con la API Key en blanco, la app funciona en modo demo. Los slots se generan localmente (todos libres). Solo falla al intentar confirmar, mostrando un mensaje claro.

**¿Qué pasa si GHL tarda en responder?**
Todas las llamadas tienen reintentos automáticos (3 intentos con backoff de 1s, 2s, 4s). Para los free-slots, si falla muestra todos los horarios como disponibles (fallback graceful).

**¿Los datos se guardan en algún sitio?**
Sí. Cada reserva confirmada se guarda en `localStorage` del navegador como respaldo. El admin puede leer estos datos aunque GHL no esté disponible.

**¿Hay autenticación en la app pública?**
No. `index.html` es público e indexable. Si quieres restringir el acceso, añade un mecanismo de autenticación en el servidor (básica HTTP, Netlify Identity, etc.).

**¿Puedo personalizar el diseño?**
Sí. Edita las variables CSS en `styles.css` (colores, radios, sombras) y los textos en los HTML. No hay frameworks, todo es CSS/HTML puro.

---

## 8. Notas de seguridad

- La `GHL_API_KEY` queda expuesta en `config.js` (es JavaScript del lado del cliente). Esto es inevitable en una app sin backend.
- Para mitigar riesgos: usa una API Key con permisos mínimos (solo Calendar + Contacts + Opportunities).
- Restringe el uso de la API Key por dominio si GHL lo permite.
- Nunca expongas esta app en un repositorio público con la API Key real.
# booking-app
# booking-app
