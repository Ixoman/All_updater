import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'path'
import fs from 'node:fs'
import { fileURLToPath } from 'url'

// Necessary for ESM in Electron
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

// --- Persistencia Portable ---
// Si la app está empaquetada (portable), guardamos los datos localmente
if (app.isPackaged) {
    const portableBaseDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
    const portableDataPath = path.join(portableBaseDir, 'data');
    let userDataPath: string | null = null;

    try {
        fs.mkdirSync(portableDataPath, { recursive: true });
        const probePath = path.join(portableDataPath, '.all-updater-write-test');
        fs.writeFileSync(probePath, 'ok', 'utf8');
        fs.unlinkSync(probePath);
        userDataPath = portableDataPath;
    } catch (error) {
        console.warn('[Main] Portable data folder is not writable. Falling back to roaming appData.', error);
        try {
            const fallbackPath = path.join(app.getPath('appData'), 'All Updater', 'data');
            fs.mkdirSync(fallbackPath, { recursive: true });
            const fallbackProbePath = path.join(fallbackPath, '.all-updater-write-test');
            fs.writeFileSync(fallbackProbePath, 'ok', 'utf8');
            fs.unlinkSync(fallbackProbePath);
            userDataPath = fallbackPath;
        } catch (fallbackError) {
            console.warn('[Main] Roaming appData fallback is not writable. Keeping default userData path.', fallbackError);
        }
    }

    if (userDataPath) {
        app.setPath('userData', userDataPath);
    }
}

// --- Refuerzo de Administrador ---
async function ensureElevated() {
    try {
        const { execa } = await import('execa');
        await execa('net', ['session'], { reject: true });
        return true;
    } catch {
        try {
            const { execa } = await import('execa');
            const { stdout } = await execa('powershell', [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
            ], { reject: false });

            return stdout.trim().toLowerCase() === 'true';
        } catch {
            return false;
        }
    }
}

let win: BrowserWindow | null
let isOperationActive = false;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
    let forceClose = false;

    win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true,
        title: "All Updater",
        icon: path.join(process.env.VITE_PUBLIC as string, 'logo.png')
    })

    // Protection against closing while updating
    win.on('close', (e) => {
        if (forceClose) return;

        if (isOperationActive) {
            e.preventDefault();
            const choice = dialog.showMessageBoxSync(win!, {
                type: 'warning',
                buttons: ['Wait / Esperar', 'Close Anyway (Dangerous) / Cerrar de todos modos (Peligroso)'],
                title: 'Operation in Progress / Operacion en progreso',
                message: 'An application update or restore point is currently in progress. Closing the app now could leave your system or software in an unstable state.\n\nHay una actualizacion o punto de restauracion en progreso. Cerrar ahora puede dejar el sistema o software inestable.',
                detail: 'It is highly recommended to wait until the process finishes.\nSe recomienda esperar a que el proceso termine.',
                defaultId: 0,
                cancelId: 0
            });

            if (choice === 1) {
                forceClose = true;
                isOperationActive = false; // Allow closing next time
                win?.close();
            }
        }
    });

    // Test active push message to Key 
    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        // win.loadFile('dist/index.html')
        win.loadFile(path.join(process.env.DIST || '', 'index.html'))
    }
}

// IPC to manage operation state
ipcMain.handle('system:set-operation-active', (_, active: boolean) => {
    isOperationActive = active;
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(async () => {
    const isElevated = await ensureElevated();

    if (!isElevated) {
        dialog.showErrorBox(
            'Insufficient privileges / Privilegios insuficientes',
            'All Updater requires Administrator permissions to manage Winget and create restore points.\n\nAll Updater requiere permisos de Administrador para gestionar Winget y crear puntos de restauracion.'
        );
        app.quit();
        return;
    }

    const { setupIPC } = await import('../src/main/ipc.js');
    setupIPC();

    createWindow();
});
