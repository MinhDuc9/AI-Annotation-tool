import {
    CommentModel,
    slideCommentDTO,
} from '../services/slide.service';
import {
    SocketCommentDTO,
} from '../services/socket.service';

export function mapDtoToComment(dto: slideCommentDTO): CommentModel {
    return {
        id: dto.id,
        slideId: dto.slideId,
        userId: dto.userId,
        content: dto.content,
        createdAt: new Date(dto.createdAt),
        updatedAt: new Date(dto.updatedAt),
    };
}

export function mapSocketToComment(dto: SocketCommentDTO): CommentModel {
    const created = dto.createdAt ? new Date(dto.createdAt) : new Date();
    const updated = dto.updatedAt ? new Date(dto.updatedAt) : created;
    return {
        id: dto.id,
        slideId: dto.slideId,
        userId: (dto.userId ?? '').trim(),
        content: dto.content,
        createdAt: Number.isNaN(created.getTime()) ? new Date() : created,
        updatedAt: Number.isNaN(updated.getTime()) ? created : updated,
    };
}

export class PendingCommentTracker {
    private readonly windowMs: number;
    private readonly store = new Map<
        string,
        Array<{ key: string; at: number }>
    >();

    constructor(windowMs = 5000) {
        this.windowMs = windowMs;
    }

    add(slideId: string, key: string): void {
        const entries = this.store.get(slideId) ?? [];
        entries.push({ key, at: Date.now() });
        const cutoff = Date.now() - this.windowMs;
        const fresh = entries.filter((entry) => entry.at >= cutoff);
        this.store.set(slideId, fresh);
    }

    consume(slideId: string, key: string): boolean {
        const entries = this.store.get(slideId);
        if (!entries?.length) return false;
        const index = entries.findIndex((entry) => entry.key === key);
        if (index === -1) return false;
        entries.splice(index, 1);
        if (!entries.length) {
            this.store.delete(slideId);
        }
        return true;
    }

    clear(): void {
        this.store.clear();
    }
}
