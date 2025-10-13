export function parseWsPayload(
    payload: unknown,
): Record<string, unknown> | null {
    let raw: unknown = payload;

    if (typeof payload === "string") {
        try {
            raw = JSON.parse(payload);
        } catch {
            return null;
        }
    }

    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }

    return null;
}

export function pickString(obj: Record<string, unknown>, key: string): string {
    const value = obj[key];
    return typeof value === "string" ? value : "";
}
