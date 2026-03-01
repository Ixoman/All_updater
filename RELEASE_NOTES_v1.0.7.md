# v1.0.7

## ES
Esta versión se enfoca en mantenibilidad, trazabilidad y validación, sin cambiar la filosofía no invasiva de la app.

### Cambios y correcciones
- Refactor estructural del renderer:
  - `App.tsx` se redujo de forma importante al extraer lógica a hooks dedicados.
  - Se separaron responsabilidades de actualización de la app, flujo de batch, release notes y orquestación del proceso.
- UI más clara durante instalación:
  - Nuevo panel opcional de log en vivo durante la instalación.
  - La estimación de tiempo restante ahora es más estable y menos engañosa.
  - El flujo sigue siendo no invasivo: cancelar detiene el lote después de la app actual.
- Flujo post-batch mejorado:
  - La app ahora refresca la lista automáticamente al terminar el lote.
  - Si el punto de restauración queda confirmado, se ofrece acceso rápido a Protección del sistema.
- Hardening técnico:
  - Se añadió rate-limit defensivo en canales IPC sensibles para evitar spam accidental o abusivo desde el renderer.
  - Se mantuvo la política de rutas seguras y ejecución local controlada.
- Calidad y regresión:
  - Nuevos tests unitarios para helpers críticos, parser de `WingetService` y rate-limit IPC.
  - Nuevas pruebas de integración para el flujo principal de `WingetService` (filtros por historial, fallback y parseo).

### Calidad
- Lint limpio.
- TypeScript limpio (`app` y `electron`).
- Suite local de regresión limpia (`unit` + `integration`).

### Estado de publicación
- El código queda preparado para `v1.0.7`.
- El artefacto de distribución firmado sigue bloqueado hasta configurar el certificado de firma requerido por la política del proyecto.

## EN
This release focuses on maintainability, traceability, and validation while preserving the app's non-invasive philosophy.

### Changes and fixes
- Renderer structural refactor:
  - `App.tsx` was significantly reduced by extracting logic into dedicated hooks.
  - Responsibilities are now separated across app update, batch flow, release notes, and update orchestration.
- Clearer installation UI:
  - Added an optional live log panel during installation.
  - Remaining-time estimation is now more stable and less misleading.
  - The flow remains non-invasive: cancel stops the batch after the current app.
- Improved post-batch flow:
  - The app now refreshes the updates list automatically after the batch finishes.
  - If the restore point stays confirmed, a quick shortcut to System Protection is offered.
- Technical hardening:
  - Added defensive rate-limiting on sensitive IPC channels to prevent accidental spam or renderer abuse.
  - Safe-path and controlled local execution policies remain in place.
- Quality and regression:
  - Added new unit tests for critical helpers, `WingetService` parser logic, and IPC rate limiting.
  - Added integration tests for the main `WingetService` flow (history filtering, fallback, and parsing).

### Quality
- Clean lint.
- Clean TypeScript (`app` and `electron`).
- Clean local regression suite (`unit` + `integration`).

### Release status
- Code is prepared for `v1.0.7`.
- Signed distribution artifacts are still blocked until the required signing certificate is configured under project policy.
