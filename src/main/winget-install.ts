function withSource(args: string[], source?: string): string[] {
    return source ? [...args, '--source', source] : args;
}

export function buildWingetUpgradeArgs(id: string, source?: string): string[] {
    return [
        ...withSource([
            'upgrade',
            '--id', id,
            '--exact',
            '--silent'
        ], source),
        '--include-unknown',
        '--accept-package-agreements',
        '--accept-source-agreements'
    ];
}

export function buildWingetForceInstallArgs(id: string, source?: string): string[] {
    return [
        ...withSource([
            'install',
            '--id', id,
            '--exact',
            '--silent',
            '--force'
        ], source),
        '--accept-package-agreements',
        '--accept-source-agreements'
    ];
}

export function mapTechnologyFallbackError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('RebootRequired:')) {
        return error instanceof Error ? error : new Error(message);
    }

    return new Error('Inapplicable: Manual uninstall required. Different installation technology and force install failed.');
}
