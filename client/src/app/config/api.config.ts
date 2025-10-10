const runtimeEnv = (window as any)?.env ?? {};

function normalizeBaseUrl(url: unknown): string | null {
    if (typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function resolveProtocol(): string {
    const protocol = runtimeEnv.API_PROTOCOL;
    if (typeof protocol === 'string' && protocol.trim()) {
        return protocol.endsWith(':') ? protocol.trim() : `${protocol.trim()}:`;
    }

    if (typeof window !== 'undefined' && window.location?.protocol) {
        return window.location.protocol;
    }

    return 'http:';
}

function resolveHost(): string {
    const host = runtimeEnv.API_HOST;
    if (typeof host === 'string' && host.trim()) {
        return host.trim();
    }

    if (typeof window !== 'undefined' && window.location?.hostname) {
        return window.location.hostname;
    }

    return 'localhost';
}

function resolvePort(): string {
    const port = runtimeEnv.API_PORT;
    if (typeof port === 'string' && port.trim()) {
        return port.trim();
    }

    if (typeof port === 'number') {
        return String(port);
    }

    return '8080';
}

const resolvedPort = resolvePort();

export const API_BASE_URL =
    normalizeBaseUrl(runtimeEnv.API_URL) ??
    `${resolveProtocol()}//${resolveHost()}${resolvedPort ? `:${resolvedPort}` : ''}`;

export function buildApiUrl(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE_URL}${normalized}`;
}
