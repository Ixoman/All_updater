# v1.0.10

## ES

Esta versión corrige la descarga de actualizaciones desde GitHub Releases.

### Corrección

- Se permite de forma explícita `release-assets.githubusercontent.com`, el host oficial al que GitHub redirige actualmente los assets de un release.
- La allowlist continúa siendo estricta: solo se acepta HTTPS y hosts concretos de GitHub; dominios parecidos o con sufijos maliciosos siguen rechazándose.
- Se añadió una prueba de regresión para el CDN real y para variantes de dominio no confiables.
- Se validó la redirección real del ZIP publicado y se confirmó una respuesta HTTP 200 desde el host permitido.

### Actualización manual única

Las versiones `v1.0.8` y `v1.0.9` contienen la allowlist anterior y rechazan la redirección antes de descargar. Por ese motivo, el paso a `v1.0.10` debe hacerse manualmente una sola vez desde este GitHub Release. A partir de `v1.0.10`, las descargas futuras desde la aplicación reconocerán el CDN actual de GitHub.

### Calidad y publicación

- Lint, TypeScript, pruebas unitarias e integración en limpio.
- Artefacto portable distribuido sin firma digital por decisión explícita del responsable del proyecto.
- Windows puede mostrar una advertencia de editor desconocido o SmartScreen.

## EN

This release fixes application-update downloads from GitHub Releases.

### Fix

- Explicitly allows `release-assets.githubusercontent.com`, the official host GitHub currently redirects release assets to.
- The allowlist remains strict: only HTTPS and specific GitHub hosts are accepted; lookalike domains and malicious suffixes remain rejected.
- Adds regression coverage for the real CDN and untrusted hostname variants.
- Validates the published ZIP's real redirect and confirms an HTTP 200 response from the allowed host.

### One-time manual update

Versions `v1.0.8` and `v1.0.9` contain the previous allowlist and reject the redirect before downloading. Therefore, moving to `v1.0.10` requires a one-time manual download from this GitHub Release. Starting with `v1.0.10`, future in-app downloads will recognize GitHub's current release CDN.

### Quality and publishing

- Clean lint, TypeScript, unit, and integration checks.
- Portable artifact distributed without a digital signature by explicit project-owner decision.
- Windows may display an unknown-publisher or SmartScreen warning.
