# Diagnóstico del Panel Admin

## CAUSA RAÍZ ENCONTRADA

CONFIG.js NO contiene la propiedad `TIERS`. Sin embargo, admin.js la usa en múltiples lugares:

1. `detectTier()` línea 242: `Object.entries(CONFIG.TIERS)` → TypeError: Cannot convert undefined to object
2. `getWeekRanges()` línea 259: `Object.values(CONFIG.TIERS)` → TypeError: Cannot convert undefined to object

Cuando `loadData()` termina y llama a `renderMetrics()` → `analyzeAppointments()` → `getWeekRanges()`,
este último crashea porque `CONFIG.TIERS` es undefined.

El error no capturado detiene la ejecución de `loadData()`, y `renderTable()` nunca se ejecuta.
Por eso la tabla se queda en "Cargando datos..." para siempre.

## SOLUCIÓN

Opción A: Añadir TIERS al CONFIG en server.js
Opción B: Hacer que admin.js sea resiliente a la ausencia de TIERS

Vamos con ambas: añadir TIERS al config Y proteger admin.js contra undefined.
