# v1.0.9

## ES

Esta versión corrige rutas de actualización y varios casos donde All Updater podía mostrar un resultado engañoso o bloquear una acción válida. También adopta oficialmente el flujo portable unsigned aprobado por el responsable del proyecto.

### Cambios y correcciones

- Actualizaciones Winget más precisas:
  - Cada instalación conserva el `source` detectado y usa `--exact`, evitando seleccionar otro paquete o una instalación administrada por una fuente diferente.
  - Se elimina la restricción forzada de arquitectura para dejar que Winget elija el instalador compatible.
  - El fallback `install --force` reutiliza el mismo paquete y source, transmite logs y conserva correctamente el estado de reinicio requerido.
  - Errores de acceso, ejecución y salida no parseable ya no se presentan como una lista vacía de actualizaciones.
- Correcciones de flujo y UI:
  - Los paquetes marcados anteriormente como `inapplicable` pueden volver a seleccionarse para reintentar; solo los omitidos explícitamente permanecen bloqueados.
  - Los toasts ya no reinician continuamente su temporizador por cambios de referencia del callback.
  - Limpiar el historial elimina también el backup anterior para impedir que reaparezcan entradas borradas.
- Validación y seguridad local:
  - Validación estricta de `source`, secuencias de restore point y descripciones recibidas por IPC.
  - La verificación Authenticode y la inspección de ZIP pasan rutas mediante variables de entorno, soportando espacios y evitando interpretación accidental de argumentos por PowerShell.
  - El rate limit conserva correctamente ventanas largas al procesar canales con límites diferentes.
- Build y publicación:
  - `npm run build`, `npm run release` y `npm run release:github` son el flujo portable unsigned predeterminado.
  - Los comandos firmados quedan disponibles únicamente como capacidad opcional futura.

### Calidad

- Lint limpio.
- TypeScript limpio (`app` y `electron`).
- Suite local de regresión limpia: 8 pruebas unitarias y 1 prueba de integración.
- Nuevas regresiones para selección de actualizaciones, argumentos Winget, errores de consulta, restore points, PowerShell, historial, rate limit y temporizadores de toast.

### Estado de publicación

- `v1.0.9` se distribuye como artefacto portable sin firma digital por decisión explícita del responsable del proyecto.
- Windows puede mostrar una advertencia de editor desconocido o SmartScreen.

## EN

This release fixes update routing and several cases where All Updater could show a misleading result or block a valid action. It also officially adopts the project-owner-approved unsigned portable workflow.

### Changes and fixes

- More precise Winget updates:
  - Each installation preserves the detected `source` and uses `--exact`, preventing selection of another package or an installation managed by a different source.
  - The forced architecture restriction was removed so Winget can select the compatible installer.
  - The `install --force` fallback reuses the same package and source, streams logs, and preserves reboot-required status correctly.
  - Access, execution, and unparseable-output errors are no longer presented as an empty update list.
- Flow and UI fixes:
  - Packages previously marked `inapplicable` can be selected again for retry; only explicitly skipped packages remain blocked.
  - Toast timers no longer restart continuously when callback references change.
  - Clearing history also removes the previous backup so deleted entries cannot reappear.
- Local validation and security:
  - Strict validation for `source`, restore-point sequence numbers, and descriptions received through IPC.
  - Authenticode verification and ZIP inspection pass paths through environment variables, supporting spaces and preventing accidental PowerShell argument interpretation.
  - Rate limiting now preserves longer windows when channels use different limits.
- Build and publishing:
  - `npm run build`, `npm run release`, and `npm run release:github` are the default unsigned portable workflow.
  - Signed commands remain available only as an optional future capability.

### Quality

- Clean lint.
- Clean TypeScript (`app` and `electron`).
- Clean local regression suite: 8 unit tests and 1 integration test.
- New regressions for update selection, Winget arguments, query errors, restore points, PowerShell, history, rate limits, and toast timers.

### Release status

- `v1.0.9` is distributed as an unsigned portable artifact by explicit project-owner decision.
- Windows may display an unknown-publisher or SmartScreen warning.
