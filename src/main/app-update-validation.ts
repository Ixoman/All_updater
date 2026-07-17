const allowedGitHubDownloadHosts = new Set([
    'github.com',
    'objects.githubusercontent.com',
    'release-assets.githubusercontent.com'
]);

export function isAllowedGitHubDownloadHost(hostname: string): boolean {
    const normalizedHostname = hostname.trim().toLowerCase();
    return allowedGitHubDownloadHosts.has(normalizedHostname)
        || normalizedHostname.endsWith('.github.com');
}
