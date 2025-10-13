// src/app/annotation-edit/topbar/services/annotation-history.service.ts
import { Injectable, signal } from '@angular/core';

type MaybePromise<T> = T | Promise<T>;

export interface AnnotationHistoryEntry {
  readonly id: string;
  readonly slideId: string;
  readonly description: string;
  /** Apply the change again (redo). */
  redo(): MaybePromise<void>;
  /** Revert the change (undo). */
  undo(): MaybePromise<void>;
}

@Injectable({ providedIn: 'root' })
export class AnnotationHistoryService {
  private readonly _undo = signal<AnnotationHistoryEntry[]>([]);
  private readonly _redo = signal<AnnotationHistoryEntry[]>([]);
  private _executing = false;

  canUndo(): boolean {
    return this._undo().length > 0;
  }

  canRedo(): boolean {
    return this._redo().length > 0;
  }

  get isExecuting(): boolean {
    return this._executing;
  }

  push(entry: AnnotationHistoryEntry): void {
    if (this._executing) return;
    this._undo.update((stack) => [...stack, entry]);
    this._redo.set([]);
  }

  clear(): void {
    if (this._executing) return;
    this._undo.set([]);
    this._redo.set([]);
  }

  async undo(): Promise<void> {
    const stack = this._undo();
    if (!stack.length || this._executing) return;
    const entry = stack[stack.length - 1];
    this._undo.set(stack.slice(0, -1));
    this._executing = true;
    try {
      await entry.undo();
      this._redo.update((redo) => [...redo, entry]);
    } finally {
      this._executing = false;
    }
  }

  async redo(): Promise<void> {
    const stack = this._redo();
    if (!stack.length || this._executing) return;
    const entry = stack[stack.length - 1];
    this._redo.set(stack.slice(0, -1));
    this._executing = true;
    try {
      await entry.redo();
      this._undo.update((undo) => [...undo, entry]);
    } finally {
      this._executing = false;
    }
  }
}
