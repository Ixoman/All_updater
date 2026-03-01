import type { AppUpdate, IgnoreRule } from '../shared/types';

export interface InstallerFailurePayload {
    category?: string;
    installerExitCode?: string;
}

const normalizeWingetLog = (value: string): string => (
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
);

export const parsePercentFromWingetLog = (logLine: string): number | null => {
    const matches = Array.from(logLine.matchAll(/(^|[^0-9])([0-9]{1,3})%(?![0-9])/g));
    if (matches.length === 0) return null;
    const raw = Number(matches[matches.length - 1][2]);
    if (!Number.isFinite(raw)) return null;
    return Math.max(0, Math.min(100, raw));
};

export const parseEstimatedPercentFromWingetLog = (logLine: string): number | null => {
    const normalized = normalizeWingetLog(logLine);
    const phaseRules: Array<{ percent: number, regex: RegExp }> = [
        { percent: 12, regex: /\bstarting|iniciando|initializing|inicializando\b/ },
        { percent: 28, regex: /\bdownloading|download|descargando|descarga|transferring|transfer\b/ },
        { percent: 45, regex: /\bextract|unpack|decompress|descomprim|expandiendo\b/ },
        { percent: 70, regex: /\binstalling|install|instaland|aplicando|applying|executing|ejecutando\b/ },
        { percent: 84, regex: /\bverifying|verify|verificando|verificar|hash|checksum\b/ },
        { percent: 95, regex: /\bfinalizing|finalizando|completing|completion|completado|completed|done|hecho|terminado|installed successfully|instalado correctamente\b/ }
    ];

    for (const rule of phaseRules) {
        if (rule.regex.test(normalized)) {
            return rule.percent;
        }
    }

    return null;
};

const normalizeIgnoreVersion = (value?: string): string => (value || '').trim();

export const buildIgnoreRuleKey = (id: string, availableVersion?: string): string => {
    const normalizedVersion = normalizeIgnoreVersion(availableVersion);
    return normalizedVersion ? `${id}@@${normalizedVersion}` : `${id}@@*`;
};

export const isUpdateIgnoredByRule = (update: AppUpdate, rule: IgnoreRule): boolean => {
    if (rule.id !== update.id) return false;
    const normalizedRuleVersion = normalizeIgnoreVersion(rule.availableVersion);
    if (!normalizedRuleVersion) return true;
    return normalizedRuleVersion === normalizeIgnoreVersion(update.available);
};

export const parseInstallerFailurePayload = (errorMessage: string): InstallerFailurePayload | null => {
    const marker = 'InstallerFailed:';
    const markerIndex = errorMessage.indexOf(marker);
    if (markerIndex === -1) return null;

    const rawPayload = errorMessage.slice(markerIndex + marker.length).trim();
    if (!rawPayload) return {};

    try {
        return JSON.parse(rawPayload) as InstallerFailurePayload;
    } catch {
        return {};
    }
};
