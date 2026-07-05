import { contextBridge, ipcRenderer } from 'electron'

type RendererListener = Parameters<typeof ipcRenderer.on>[1];
const listenerMap = new Map<string, Map<RendererListener, RendererListener>>();
const allowedInvokeChannels = new Set([
    'winget:check-updates',
    'winget:install-update',
    'winget:get-release-notes-url',
    'winget:get-health',
    'system:create-restore-point',
    'system:verify-restore-point',
    'system:open-logs',
    'system:is-elevated',
    'system:get-info',
    'system:set-online-state',
    'settings:get',
    'settings:set',
    'system:begin-operation',
    'system:end-operation',
    'system:open-url',
    'system:show-item-in-folder',
    'system:open-path',
    'system:open-system-restore',
    'system:open-services-console',
    'system:check-app-update',
    'system:download-app-update',
    'system:cancel-app-update-download',
    'system:run-preflight',
    'system:export-diagnostics',
    'system:check-data-folder',
    'history:get',
    'history:add',
    'history:clear',
    'system:factory-reset',
    'ignore:get-active',
    'ignore:add-temporary',
    'system:get-userdata-path'
]);
const allowedOnChannels = new Set([
    'winget:log',
    'main-process-message',
    'app-update:download-progress'
]);
const allowedSendChannels = new Set([
    'log:info',
    'log:error'
]);

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
    on(...args: Parameters<typeof ipcRenderer.on>) {
        const [channel, listener] = args
        if (!allowedOnChannels.has(channel)) {
            throw new Error(`IPC channel not allowed for on(): ${channel}`);
        }
        let channelListeners = listenerMap.get(channel);
        if (!channelListeners) {
            channelListeners = new Map();
            listenerMap.set(channel, channelListeners);
        }

        const existing = channelListeners.get(listener);
        if (existing) {
            ipcRenderer.off(channel, existing);
        }

        const wrapped: RendererListener = (event, ...eventArgs) => listener(event, ...eventArgs);
        channelListeners.set(listener, wrapped);
        return ipcRenderer.on(channel, wrapped)
    },
    off(...args: Parameters<typeof ipcRenderer.off>) {
        const [channel, listener] = args
        if (!allowedOnChannels.has(channel)) {
            throw new Error(`IPC channel not allowed for off(): ${channel}`);
        }
        const channelListeners = listenerMap.get(channel);
        const wrapped = channelListeners?.get(listener as RendererListener);
        if (wrapped) {
            channelListeners?.delete(listener as RendererListener);
            if (channelListeners && channelListeners.size === 0) {
                listenerMap.delete(channel);
            }
            return ipcRenderer.off(channel, wrapped);
        }
        return ipcRenderer.off(channel, listener)
    },
    send(...args: Parameters<typeof ipcRenderer.send>) {
        const [channel, ...omit] = args
        if (!allowedSendChannels.has(channel)) {
            throw new Error(`IPC channel not allowed for send(): ${channel}`);
        }
        return ipcRenderer.send(channel, ...omit)
    },
    invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
        const [channel, ...omit] = args
        if (!allowedInvokeChannels.has(channel)) {
            throw new Error(`IPC channel not allowed for invoke(): ${channel}`);
        }
        return ipcRenderer.invoke(channel, ...omit)
    },
})
