// socket.service.ts
import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config/api.config';

/** -------- Shared slide presence -------- */
export interface SlideParticipantPublic {
  socketId: string;
  userName: string;
}
export interface SlideJoinedEvent {
  slideId: string;
  user: SlideParticipantPublic;
  participants?: SlideParticipantPublic[];
}
export interface SlideLeftEvent {
  slideId: string;
  user: SlideParticipantPublic;
}

export interface BoundingBoxCreatePayload
  extends Omit<BoundingBoxDTO, 'id' | 'slideId'> {
  clientTempId?: string;
}

export interface SkeletalCreatePayload
  extends Omit<SkeletalDTO, 'id' | 'slideId'> {
  clientTempId?: string;
}

export interface BoundingBoxCreatedEvent extends BoundingBoxDTO {
  clientTempId?: string;
}
export interface SkeletalCreatedEvent extends SkeletalDTO {
  clientTempId?: string;
}

/** -------- Comments (existing) -------- */
export interface SocketCommentDTO {
  id: string;
  slideId: string;
  userId: string;
  content: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}
export interface SocketCommentDeletedDTO {
  id: string;
  slideId: string;
}

/** -------- Bounding Boxes -------- */
export interface BoundingBoxDTO {
  id: string;
  slideId: string;
  x_pos: number;
  y_pos: number;
  x_long: number;
  y_long: number;
  color: string;
  category: string;
}
export interface BoundingBoxDeletedDTO {
  boundingBoxId: string;
  slideId?: string;
}
export type BoundingBoxUpdate = Partial<
  Pick<BoundingBoxDTO, 'x_pos' | 'y_pos' | 'x_long' | 'y_long' | 'color' | 'category'>
>;

/** Touch payloads are broadcast verbatim by the server. Keep flexible. */
export interface TouchPayload {
  slideId: string;
  [k: string]: any;
}
export interface BoxTouchPayload {
  slideId: string;
  userId: string;
  boxId?: number;
  boundingBoxId?: string;
  clientInstanceId?: string;
}
export interface SkeletalTouchPayload {
  slideId: string;
  userId: string;
  skeletalId?: number;
  pointId?: string;
  pointServerId?: string;
  clientInstanceId?: string;
}
/** -------- Skeletons -------- */
export interface SkeletalDTO {
  id: string;
  slideId: string;
  x_pos: number;
  y_pos: number;
  key_points?: string[] | null;
  color: string;
  category: string;
}
export interface SkeletalDeletedDTO {
  skeletalId: string;
  slideId?: string;
}
export type SkeletalUpdate = {
  x_pos?: number;
  y_pos?: number;
  color?: string;
  category?: string;
  key_points?: string[] | null;
};

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket;
  private lastJoin: { slideId: string; userId: string } | null = null;
  readonly clientInstanceId: string;

  constructor(private zone: NgZone) {
    this.clientInstanceId =
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const runtimeWsUrl = (window as any)?.env?.WS_URL;
    const socketUrl =
      typeof runtimeWsUrl === 'string' && runtimeWsUrl.trim()
        ? runtimeWsUrl.trim()
        : API_BASE_URL;

    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    // On reconnect, re-join the slide with user context
    this.socket.on('connect', () => {
      if (this.lastJoin) {
        this.socket.emit('joinSlide', {
          slideId: this.lastJoin.slideId,
          userId: this.lastJoin.userId,
        });
      }
    });
  }

  /** ========== Slide presence (join / leave) ========== */

  joinSlide(slideId: string, userId: string): void {
    const sid = slideId?.trim();
    const uid = userId?.trim();
    if (!sid || !uid) return;

    // Leave the previous slide room if switching
    if (this.lastJoin && this.lastJoin.slideId && this.lastJoin.slideId !== sid) {
      this.socket.emit('leaveSlide', { slideId: this.lastJoin.slideId });
    }

    this.lastJoin = { slideId: sid, userId: uid };
    if (!this.socket.connected) this.socket.connect();
    this.socket.emit('joinSlide', { slideId: sid, userId: uid });
  }

  leaveSlide(slideId?: string): void {
    const sid = slideId?.trim() || this.lastJoin?.slideId;
    if (!sid) return;
    this.socket.emit('leaveSlide', { slideId: sid });
    if (this.lastJoin?.slideId === sid) this.lastJoin = null;
  }

  onJoined(): Observable<SlideJoinedEvent> {
    return this.fromEventInZone<SlideJoinedEvent>('joined');
  }

  onLeft(): Observable<SlideLeftEvent> {
    return this.fromEventInZone<SlideLeftEvent>('left');
  }

  /** ========== Comments (existing) ========== */

  onCommentCreated(): Observable<SocketCommentDTO> {
    return this.fromEventInZone('commentCreated');
  }
  onCommentUpdated(): Observable<SocketCommentDTO> {
    return this.fromEventInZone('commentUpdated');
  }
  onCommentDeleted(): Observable<SocketCommentDeletedDTO> {
    return this.fromEventInZone('commentDeleted');
  }
  createComment(slideId: string, userId: string, content: string): void {
    this.socket.emit('createComment', { slideId: slideId.trim(), userId: userId.trim(), content });
  }
  editComment(slideId: string, userId: string, commentId: string, content: string): void {
    this.socket.emit('updateComment', { slideId: slideId.trim(), userId: userId.trim(), commentId, content });
  }

  /** ========== Bounding Boxes (annotation) ========== */

  // Live cursor/drag broadcasts
  boxTouch(payload: TouchPayload): void {
    this.socket.emit('onTouch', { ...payload, clientInstanceId: this.clientInstanceId });
  }
  boxUnTouch(payload: TouchPayload): void {
    this.socket.emit('unTouch', { ...payload, clientInstanceId: this.clientInstanceId });
  }
  onBoxTouch(): Observable<BoxTouchPayload> {
    return this.fromEventInZone('onTouch');
  }
  onBoxUnTouch(): Observable<BoxTouchPayload> {
    return this.fromEventInZone('unTouch');
  }

  // CRUD
  createBoundingBox(slideId: string, dto: BoundingBoxCreatePayload): void {
    const { x_pos, y_pos, x_long, y_long, color, category, clientTempId } = dto;
    this.socket.emit('createBoundingBox', { slideId, x_pos, y_pos, x_long, y_long, color, category, clientTempId });
  }
  updateBoundingBox(slideId: string, boundingBoxId: string, patch: BoundingBoxUpdate): void {
    this.socket.emit('updatePosition', { slideId, boundingBoxId, ...patch });
  }
  deleteBoundingBox(slideId: string, boundingBoxId: string): void {
    this.socket.emit('deleteBoundingBox', { slideId, boundingBoxId });
  }

  onBoundingBoxCreated(): Observable<BoundingBoxCreatedEvent> {
    return this.fromEventInZone('boundingBoxCreated');
  }
  onBoundingBoxUpdated(): Observable<BoundingBoxDTO> {
    return this.fromEventInZone('boundingBoxPositionUpdated');
  }
  onBoundingBoxDeleted(): Observable<BoundingBoxDeletedDTO> {
    return this.fromEventInZone('boundingBoxDeleted');
  }

  /** ========== Skeletons (annotation) ========== */

  // Live cursor/drag broadcasts
  skeletalTouch(payload: TouchPayload): void {
    this.socket.emit('skeletalOnTouch', { ...payload, clientInstanceId: this.clientInstanceId });
  }
  skeletalUnTouch(payload: TouchPayload): void {
    this.socket.emit('skeletalUnTouch', { ...payload, clientInstanceId: this.clientInstanceId });
  }
  onSkeletalTouch(): Observable<SkeletalTouchPayload> {
    return this.fromEventInZone('skeletalOnTouch');
  }
  onSkeletalUnTouch(): Observable<SkeletalTouchPayload> {
    return this.fromEventInZone('skeletalUnTouch');
  }

  // CRUD
  createSkeletal(slideId: string, dto: SkeletalCreatePayload): void {
    const { x_pos, y_pos, key_points, color, category, clientTempId } = dto;
    this.socket.emit('createSkeletal', { slideId, x_pos, y_pos, key_points: key_points ?? null, color, category, clientTempId });
  }
  updateSkeletal(slideId: string, skeletalId: string, patch: SkeletalUpdate): void {
    this.socket.emit('updateState', { slideId, skeletalId, ...patch });
  }
  deleteSkeletal(slideId: string, skeletalId: string): void {
    this.socket.emit('deleteSkeletal', { slideId, skeletalId });
  }

  onSkeletalCreated(): Observable<BoundingBoxCreatedEvent> {
    return this.fromEventInZone('skeletalCreated');
  }
  onSkeletalUpdated(): Observable<SkeletalDTO> {
    return this.fromEventInZone('skeletalStateUpdated');
  }
  onSkeletalDeleted(): Observable<SkeletalDeletedDTO> {
    return this.fromEventInZone('skeletalDeleted');
  }

  /** ========== Errors & teardown ========== */

  onError(): Observable<{ message: string }> {
    return this.fromEventInZone('error');
  }

  onConnect(): Observable<void> {
    return this.fromEventInZone('connect');
  }

  onDisconnect(): Observable<void> {
    return this.fromEventInZone('disconnect');
  }

  onConnectError(): Observable<unknown> {
    return this.fromEventInZone('connect_error');
  }

  isConnected(): boolean {
    return this.socket.connected;
  }

  disconnect(): void {
    this.lastJoin = null;
    this.socket.disconnect();
  }

  /** Utility: wrap socket events so callbacks run inside Angular's zone */
  private fromEventInZone<T = any>(event: string): Observable<T> {
    return new Observable<T>((observer) => {
      const handler = (data: T) => this.zone.run(() => observer.next(data));
      this.socket.on(event, handler);
      return () => this.socket.off(event, handler);
    });
  }
}
