# v1.0.8

## ES
Esta version fortalece el flujo de actualizacion de All Updater desde GitHub y simplifica la experiencia visual sin cambiar el enfoque portable y no invasivo.

### Cambios y correcciones
- Flujo de actualizacion propia mas seguro:
  - El renderer ya no puede enviar URLs arbitrarias de descarga; el proceso principal conserva el candidato aprobado.
  - Validacion de repositorio, tag, asset, extension, host de descarga, tamano y espacio libre.
  - Descarga con staging local controlado antes de copiar el archivo a la carpeta elegida por el usuario.
  - Verificacion SHA256 cuando GitHub publica digest.
  - Verificacion Authenticode para EXE y para ejecutables dentro del ZIP.
  - Firma invalida bloquea y elimina el archivo; firma ausente se reporta como actualizacion unsigned.
  - Cancelacion real de descarga desde la UI.
  - Release notes visibles en el banner de actualizacion.
  - Auditoria local en `app_update_audit.jsonl`.
  - Guia post-descarga con nota de rollback.
- Mejoras de UX:
  - Sidebar mas simple y menos texto tecnico en la pantalla principal.
  - Estado de Winget mas compacto.
  - Tarjetas de actualizacion mas densas y faciles de escanear.
  - Nuevo modo `npm run dev:ui` para revisar la interfaz sin UAC en desarrollo local.
- Robustez general:
  - Validacion mas estricta de IPC y payloads.
  - Backups antes de escribir settings e historial.
  - Concurrencia limitada al precargar release notes.

### Calidad
- Lint limpio.
- TypeScript limpio (`app` y `electron`).
- Suite local de regresion limpia (`unit` + `integration`).

### Estado de publicacion
- `v1.0.8` se publica de forma temporal sin firma digital por decision explicita del responsable del proyecto.
- La firma sigue siendo el objetivo para futuras versiones cuando el certificado este disponible.

## EN
This release strengthens All Updater's GitHub self-update flow and simplifies the visual experience while keeping the portable, non-invasive approach.

### Changes and fixes
- Safer app self-update flow:
  - The renderer can no longer provide arbitrary download URLs; the main process keeps the approved candidate.
  - Repository, tag, asset, extension, download host, size, and free-space validation.
  - Controlled local staging before copying the asset to the user-selected folder.
  - SHA256 verification when GitHub publishes a digest.
  - Authenticode verification for EXE files and executables inside ZIP assets.
  - Invalid signatures block and remove the file; missing signatures are reported as unsigned updates.
  - Real download cancellation from the UI.
  - Release notes are shown in the update banner.
  - Local audit trail in `app_update_audit.jsonl`.
  - Post-download rollback guidance.
- UX improvements:
  - Simpler sidebar with less technical text on the main screen.
  - More compact Winget health status.
  - Denser update rows for easier scanning.
  - New `npm run dev:ui` mode for local UI review without UAC.
- General robustness:
  - Stricter IPC and payload validation.
  - Backups before settings/history writes.
  - Limited concurrency when prefetching release notes.

### Quality
- Clean lint.
- Clean TypeScript (`app` and `electron`).
- Clean local regression suite (`unit` + `integration`).

### Release status
- `v1.0.8` is being published temporarily without a digital signature by explicit project-owner decision.
- Signed distribution remains the target for future versions once the certificate is available.
