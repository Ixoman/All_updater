# v1.0.6

## ES
Esta versión refuerza robustez operativa y claridad de estado, manteniendo la filosofía no invasiva y portable.

### Cambios y correcciones
- Reglas de ignorar más precisas:
  - El ignorado temporal ahora se guarda por `app + versión disponible` (no solo por ID).
  - Evita ocultar futuras versiones nuevas de la misma app por accidente.
- Salud de Winget más robusta:
  - `winget source list` ahora prioriza parseo JSON y usa fallback de texto más estricto.
  - Se reducen falsos positivos en el resumen de fuentes detectadas.
- Diagnóstico continuo de entorno:
  - Se agregó refresco periódico de estado Winget (focus, online y por intervalo).
  - Se agregó revalidación periódica de carpeta de datos escribible con aviso no invasivo.
- UX de soporte y trazabilidad:
  - Mejoras en resumen de lote, progreso estimado y mensajes de estado.
  - Se mantiene separación clara entre progreso real y estimado.
- Infraestructura IPC y flujo local:
  - Nuevo canal seguro para abrir rutas directas (`system:open-path`) en lugar de comportamientos ambiguos de explorador.
  - Ajustes de tipos compartidos para coherencia entre main/renderer.

### Calidad
- Lint limpio.
- TypeScript limpio (`app` y `electron`).

### Nota temporal (firma)
- Esta release incluye artefacto portable sin firma digital mientras se configura el certificado de firma.
- Es una medida temporal. En próximas versiones se retomará la distribución firmada.

## EN
This release strengthens operational robustness and status clarity while preserving the non-invasive, portable philosophy.

### Changes and fixes
- More precise temporary ignore rules:
  - Ignore is now stored by `app + available version` (not only by ID).
  - Prevents accidentally hiding future new versions of the same app.
- Stronger Winget health parsing:
  - `winget source list` now prefers JSON parsing with a stricter text fallback.
  - Reduces false positives in detected source summaries.
- Continuous environment diagnostics:
  - Added periodic Winget health refresh (focus, online, and interval).
  - Added periodic writable-data-folder revalidation with non-invasive user feedback.
- UX and traceability improvements:
  - Improvements to batch summary, estimated progress, and status messaging.
  - Clear separation between real and estimated progress is preserved.
- IPC and local flow hardening:
  - Added secure direct-path open channel (`system:open-path`) instead of ambiguous folder reveal behavior.
  - Shared type updates for main/renderer consistency.

### Quality
- Clean lint.
- Clean TypeScript checks (`app` and `electron`).

### Temporary note (signing)
- This release includes a portable artifact without digital signature while signing certificate setup is pending.
- This is temporary. Signed distribution will resume in upcoming versions.
