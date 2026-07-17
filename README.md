# All Updater

All Updater is a portable Windows desktop app for updating installed applications through `winget`.

It is not Windows Update and does not patch the operating system. The app focuses on a simple, local, non-invasive flow for checking available app updates, selecting what to install, optionally creating a System Restore point, tracking results, and exporting diagnostics when something fails.

## What It Does

- Checks installed application updates using Windows Package Manager (`winget`).
- Supports English and Spanish UI.
- Runs as Administrator because `winget` operations and restore points require elevation.
- Shows install progress, live `winget` logs, and batch progress.
- Handles common update outcomes: success, failure, reboot required, app in use, inapplicable update, hash mismatch, and interrupted network.
- Stores settings, history, ignored updates, logs, and diagnostics locally.
- Can check GitHub Releases for a newer All Updater version, stage the selected release asset locally, verify it, and guide the user through the manual update.

## Main Flow

1. Start the app with Administrator permissions.
2. Check for available updates.
3. Review and select installable updates.
4. Run preflight checks.
5. Choose whether to create a System Restore point.
6. Install selected updates one by one.
7. Review the final summary and history.

## Local Data

In packaged portable mode, the app tries to store data next to the executable in a local `data` folder. If that folder is not writable, it falls back to roaming app data.

Typical local data includes:

- user settings
- installation history
- temporary ignore rules
- staged All Updater update downloads
- `app_update_audit.jsonl`
- `app_debug.txt`
- `restore_debug.txt`

The UI shows the active data folder path in the Troubleshooting modal.

## App Self-Update Flow

At startup, All Updater performs a silent GitHub Releases check against `Ixoman/All_updater`.

The self-update flow is intentionally guided instead of silent:

1. The main process checks the selected release channel (`stable` by default, `beta` with `ALL_UPDATER_UPDATE_CHANNEL=beta`).
2. The main process approves one release asset and keeps the approved candidate internally.
3. The renderer can only request download of that approved candidate; it cannot provide an arbitrary download URL.
4. The asset is downloaded into a controlled staging folder under local app data.
5. The app validates repository/tag/asset origin, extension, file size, available disk space, SHA256 when GitHub publishes one, and publisher signature status.
6. A verified staged file is copied to the user-selected folder.
7. The user receives post-download instructions, including rollback guidance.

App update events are appended to `app_update_audit.jsonl` for troubleshooting.

## Development

Install dependencies:

```powershell
npm install
```

Run the Vite/Electron development app:

```powershell
npm run dev
```

`npm run dev` keeps the same Administrator requirement as the real app. For UI-only work without elevation prompts, run:

```powershell
npm run dev:ui
```

`dev:ui` is only for local interface review. Do not use it to validate real install, restore-point, or release behavior because those flows require Administrator privileges.

Run verification:

```powershell
npm run verify
```

Run regression tests:

```powershell
npm run test:regression
```

## Quality Commands

- `npm run lint`
- `npm run typecheck:app`
- `npm run typecheck:electron`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:regression`

## Build and Release

The default Windows build and release artifacts are currently unsigned. No signing certificate or signing environment variables are required.

Default commands:

```powershell
npm run build
npm run release
```

`npm run build` creates the portable `.exe`. `npm run release` also creates the versioned ZIP. To publish that ZIP explicitly:

```powershell
npm run release:github
```

Windows SmartScreen may show an unknown-publisher warning for these artifacts. Optional signing commands remain available for a future policy change and are documented in `SIGNING_SMARTSCREEN.md`.

## Important Files

- `electron/main.ts`: Electron startup, portable data path, Administrator enforcement, close protection.
- `electron/preload.ts`: safe IPC bridge exposed to the renderer.
- `src/main/ipc.ts`: main-process IPC handlers and policy checks.
- `src/main/services/winget.ts`: `winget` parsing, update discovery, install execution, health checks.
- `src/main/services/restore.ts`: System Restore point creation and verification.
- `src/main/services/preflight.ts`: readiness checks before updating.
- `src/main/services/app-update.ts`: GitHub release check and update asset download.
- `src/App.tsx`: main renderer orchestration and UI state.
- `src/hooks/useUpdateFlow.ts`: restore/preflight/batch update orchestration.
- `src/hooks/useBatchInstall.ts`: install overlay state, logs, progress, cancellation.
- `src/shared/types.ts`: shared main/renderer contracts.
- `src/shared/translations.ts`: English and Spanish UI text.

## Manual Regression Checklist

See `PRUEBAS_REGRESION.md` for the manual regression checklist.
