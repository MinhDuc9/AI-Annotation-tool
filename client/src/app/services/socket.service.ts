import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';
import { Socket, io } from 'socket.io-client';

export interface CommentDto {
  slideId: string;
  userId: string;
  content: string;
}

@Injectable({
  providedIn: 'root'
})
export class SocketService {

  private socket: Socket;

  constructor(private zone: NgZone) {
    this.socket = io((window as any).env?.WS_URL ?? "http://localhost:3000", {
      transports: ["websocket"],
    });
  }

  joinSlide(slideId: string): void {
    this.socket.emit("joinSlide", { slideId });
  }

  onJoined(): Observable<{ slideId: string }> {
    return this.fromEventInZone("joined");
  }

  onCommentCreated(): Observable<CommentDto> {
    return this.fromEventInZone("commentCreated");
  }

  onError(): Observable<{ message: string }> {
    return this.fromEventInZone("error");
  }

  createComment(slideId: string, userId: string, content: string): void {
    this.socket.emit("createComment", { slideId, userId, content });
  }

  disconnect(): void {
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
