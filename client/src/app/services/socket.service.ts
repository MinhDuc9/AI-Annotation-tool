import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';
import { Socket, io } from 'socket.io-client';

export interface SocketCommentDTO {
  id: string;
  slideId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface SocketCommentDeletedDTO {
  id: string;
  slideId: string;
}

@Injectable({
  providedIn: 'root'
})
export class SocketService {

  private socket: Socket;
  private currentSlideId: string | null = null;

  constructor(private zone: NgZone) {
    this.socket = io((window as any).env?.WS_URL ?? 'http://localhost:8080', {
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      if (this.currentSlideId) {
        this.socket.emit('joinSlide', { slideId: this.currentSlideId });
      }
    });
  }

  joinSlide(slideId: string): void {
    const normalized = slideId.trim();
    if (!normalized) {
      return;
    }
    this.currentSlideId = normalized;
    if (!this.socket.connected) {
      this.socket.connect();
    }
    this.socket.emit('joinSlide', { slideId: normalized });
  }

  onJoined(): Observable<{ slideId: string }> {
    return this.fromEventInZone('joined');
  }

  onCommentCreated(): Observable<SocketCommentDTO> {
    return this.fromEventInZone('commentCreated');
  }

  onCommentUpdated(): Observable<SocketCommentDTO> {
    return this.fromEventInZone('commentUpdated');
  }

  onCommentDeleted(): Observable<SocketCommentDeletedDTO> {
    return this.fromEventInZone('commentDeleted');
  }

  onError(): Observable<{ message: string }> {
    return this.fromEventInZone('error');
  }

  createComment(slideId: string, userId: string, content: string): void {
    this.socket.emit('createComment', { slideId: slideId.trim(), userId: userId.trim(), content });
  }

  editComment(slideId: string, userId: string, commentId: string, content: string): void {
    this.socket.emit('updateComment', { slideId: slideId.trim(), userId: userId.trim(), content, commentId });
  }

  disconnect(): void {
    this.currentSlideId = null;
    this.socket.disconnect();
  }

  private fromEventInZone<T = any>(event: string): Observable<T> {
    return new Observable<T>((observer) => {
      const handler = (data: T) => this.zone.run(() => observer.next(data));
      this.socket.on(event, handler);
      return () => this.socket.off(event, handler);
    });
  }
}
