# Optional SmartScreen + Code Signing (Windows)

La firma de código está desactivada como requisito del flujo normal. `npm run build`, `npm run release` y `npm run release:github` generan o publican artefactos unsigned sin requerir certificado.

Los comandos de esta página se conservan sólo como capacidad opcional para el futuro.

## 1) Requisitos de firma

Usa una de estas opciones de identidad:

- `WIN_CSC_LINK` (o `CSC_LINK`): ruta/URL/base64 de tu `.pfx`
- `WIN_CSC_NAME` (o `CSC_NAME`): nombre del certificado en el store

Y opcional/recomendado:

- `WIN_CSC_KEY_PASSWORD` (o `CSC_KEY_PASSWORD`): password del `.pfx`

## 2) Scripts disponibles

- `npm run signing:check`: valida que haya identidad de firma configurada
- `npm run build:portable:signed`: build portable + `forceCodeSigning=true`
- `npm run signing:verify-artifact`: valida firma Authenticode del `.exe`
- `npm run release:portable:signed`: build firmado + verificación de firma
- `npm run build`: build portable unsigned predeterminado
- `npm run release`: build portable unsigned + ZIP versionado
- `npm run release:github`: build unsigned + ZIP + create/update del release en GitHub

## 3) Ejemplo rápido (PowerShell)

```powershell
$env:WIN_CSC_LINK = "C:\certs\all-updater.pfx"
$env:WIN_CSC_KEY_PASSWORD = "TU_PASSWORD"
npm run release:portable:signed
```

El comando explícito `release:portable:signed` falla si el binario queda sin firma. Esto no afecta los comandos predeterminados.

## 3.1) Flujo predeterminado sin firma

```powershell
npm run release
```

Esto:

- genera el portable unsigned
- crea `release/All-Updater-vX.Y.Z-portable.zip`

Y si además quieres publicar directo en GitHub:

```powershell
npm run release:github
```

Esto:

- genera el portable unsigned
- empaqueta el ZIP versionado
- crea o actualiza el release `vX.Y.Z` en GitHub usando `RELEASE_NOTES_vX.Y.Z.md`

No existe un hook que bloquee tags o pushes por falta de firma.

## 4) Paso Defender (reputación SmartScreen)

Objetivo: acelerar reputación para reducir advertencias SmartScreen en equipos nuevos.

### Manual (recomendado para este proyecto)

1. Publica un release. Si en el futuro vuelve a firmarse, usa el artefacto firmado.
2. Sube el `.exe`/`.zip` al portal de Microsoft Security Intelligence:
   - `https://www.microsoft.com/wdsi/filesubmission`
3. Selecciona categoría de software legítimo/false positive y agrega contexto:
   - nombre de app
   - versión
   - hash SHA256
   - URL del release en GitHub
4. Guarda el ticket/caso para trazabilidad.

### ¿Se puede automatizar?

- En escenarios estándar (cuenta personal), **normalmente no hay API pública simple** para automatizar este envío end-to-end.
- En entorno enterprise con Microsoft Defender APIs + app registration/Azure AD, se puede automatizar parcialmente, pero requiere infraestructura adicional y no está habilitado aquí por defecto.

## 5) Nota importante

- Esto reduce SmartScreen, pero no elimina el prompt UAC de administrador (eso depende de `requireAdministrator`, y en esta app es parte del flujo intencional).
