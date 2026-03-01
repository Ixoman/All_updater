# Agent Build Policy

This project must use **signed Windows artifacts** for any build/release intended for distribution.

## Mandatory rules

1. Do not publish or upload unsigned `.exe` artifacts.
2. Preferred commands:
   - `npm run build`
   - `npm run release`
3. These commands must run signing checks and fail if signing is not configured.
4. If signing variables are missing, stop and report the issue instead of producing unsigned release artifacts.

## Allowed fallback for local-only debugging

- Unsigned builds are allowed only for local debugging and must not be released:
  - `npm run build:unsigned`
  - `npm run build:portable:unsigned`

## Temporary owner-approved unsigned release exception

Until a signing certificate is available again, the project owner has explicitly approved a temporary unsigned release flow.

- Keep signed release commands as the default:
  - `npm run build`
  - `npm run release`
- Use unsigned release commands only when an unsigned GitHub release is explicitly intended:
  - `npm run release:portable:unsigned`
  - `npm run release:portable:unsigned:github`
- These unsigned commands are temporary and should be removed from the release workflow once signing is restored.

## Signing docs

- See `SIGNING_SMARTSCREEN.md` for certificate variables and SmartScreen reputation workflow.
