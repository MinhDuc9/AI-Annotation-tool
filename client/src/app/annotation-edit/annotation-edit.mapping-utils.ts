import {
    BoxAnn,
    PendingBoxSnapshot,
    PendingPointSnapshot,
    Keypoint,
} from './annotation-edit.types';
import { BoundingBoxDTO, SkeletalDTO } from '../services/socket.service';

export function getOrCreateNestedMap<K, V>(
    root: Map<string, Map<K, V>>,
    slideId: string
): Map<K, V> {
    let map = root.get(slideId);
    if (!map) {
        map = new Map<K, V>();
        root.set(slideId, map);
    }
    return map;
}

export function markPendingBox(
    pendingBoxes: Map<string, Map<number, PendingBoxSnapshot>>,
    slideId: string,
    localId: number,
    box: BoxAnn
): void {
    const map = getOrCreateNestedMap(pendingBoxes, slideId);
    map.set(localId, {
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        color: box.color,
        labelId: box.labelId,
        createdAt: Date.now(),
    });
}

export function takePendingBoxMatch(
    pendingBoxes: Map<string, Map<number, PendingBoxSnapshot>>,
    slideId: string,
    srv: BoundingBoxDTO
): number | null {
    const map = pendingBoxes.get(slideId);
    if (!map || map.size === 0) return null;
    let bestId: number | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const tolerance = 1;
    for (const [localId, snap] of map) {
        if (snap.color !== srv.color || snap.labelId !== srv.category) {
            continue;
        }
        const score =
            Math.abs(snap.x - srv.x_pos) +
            Math.abs(snap.y - srv.y_pos) +
            Math.abs(snap.w - srv.x_long) +
            Math.abs(snap.h - srv.y_long);
        if (score < bestScore && score <= tolerance * 4) {
            bestScore = score;
            bestId = localId;
        }
    }
    if (bestId != null) {
        map.delete(bestId);
        return bestId;
    }
    return null;
}

export function clearPendingBox(
    pendingBoxes: Map<string, Map<number, PendingBoxSnapshot>>,
    slideId: string,
    localId: number
): void {
    pendingBoxes.get(slideId)?.delete(localId);
}

export function pLocKey(skLocalId: number, pid: string): string {
    return `${skLocalId}:${pid}`;
}

function getPointLocalToServer(
    pointLocalToServer: Map<string, Map<string, string>>,
    slideId: string
) {
    return getOrCreateNestedMap(pointLocalToServer, slideId);
}

function getPointServerToLocal(
    pointServerToLocal: Map<string, Map<string, { sk: number; pid: string }>>,
    slideId: string
) {
    return getOrCreateNestedMap(pointServerToLocal, slideId);
}

export function linkPointIds(
    pointLocalToServer: Map<string, Map<string, string>>,
    pointServerToLocal: Map<string, Map<string, { sk: number; pid: string }>>,
    slideId: string,
    skLocalId: number,
    pid: string,
    serverId: string
): void {
    getPointLocalToServer(pointLocalToServer, slideId).set(
        pLocKey(skLocalId, pid),
        serverId
    );
    getPointServerToLocal(pointServerToLocal, slideId).set(serverId, {
        sk: skLocalId,
        pid,
    });
}

export function serverPointId(
    pointLocalToServer: Map<string, Map<string, string>>,
    slideId: string,
    skLocalId: number,
    pid: string
): string | undefined {
    return getPointLocalToServer(pointLocalToServer, slideId).get(
        pLocKey(skLocalId, pid)
    );
}

export function localPointOf(
    pointServerToLocal: Map<
        string,
        Map<string, { sk: number; pid: string }>
    >,
    slideId: string,
    serverId: string
): { sk: number; pid: string } | undefined {
    return getPointServerToLocal(pointServerToLocal, slideId).get(serverId);
}

function getPendingPointsMap(
    pendingPoints: Map<string, Map<string, PendingPointSnapshot>>,
    slideId: string
) {
    return getOrCreateNestedMap(pendingPoints, slideId);
}

export function markPendingPoint(
    pendingPoints: Map<string, Map<string, PendingPointSnapshot>>,
    slideId: string,
    skId: number,
    pid: string,
    point: Keypoint,
    color: string,
    labelId: string
): void {
    getPendingPointsMap(pendingPoints, slideId).set(pLocKey(skId, pid), {
        skId,
        pid,
        x: point.x,
        y: point.y,
        color,
        labelId,
        createdAt: Date.now(),
    });
}

export function takePendingPointMatch(
    pendingPoints: Map<string, Map<string, PendingPointSnapshot>>,
    slideId: string,
    srv: SkeletalDTO
): { skId: number; pid: string } | null {
    const map = pendingPoints.get(slideId);
    if (!map || map.size === 0) return null;
    let bestKey: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const tolerance = 2;
    for (const [key, snap] of map) {
        if (srv.color && snap.color !== srv.color) continue;
        if (srv.category && snap.labelId !== srv.category) continue;
        const targetX = typeof srv.x_pos === 'number' ? srv.x_pos : snap.x;
        const targetY = typeof srv.y_pos === 'number' ? srv.y_pos : snap.y;
        const score =
            Math.abs(snap.x - targetX) + Math.abs(snap.y - targetY);
        if (score < bestScore && score <= tolerance * 2) {
            bestScore = score;
            bestKey = key;
        }
    }
    if (bestKey != null) {
        const snap = map.get(bestKey);
        if (snap) {
            map.delete(bestKey);
            return { skId: snap.skId, pid: snap.pid };
        }
        map.delete(bestKey);
    }
    return null;
}

export function clearPendingPoint(
    pendingPoints: Map<string, Map<string, PendingPointSnapshot>>,
    slideId: string,
    skId: number,
    pid: string
): void {
    pendingPoints.get(slideId)?.delete(pLocKey(skId, pid));
}
