// src/app/annotation-edit/topbar/services/annotation-history.service.ts
import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AnnotationHistoryService {
  private _undo = signal<any[]>([]);
  private _redo = signal<any[]>([]);

  canUndo() { return this._undo().length > 0; }
  canRedo() { return this._redo().length > 0; }

  push(state: any) {
    // push a state to undo stack and clear redo
    this._undo.update(s => [...s, state]);
    this._redo.set([]);
  }

  undo() {
    if (this._undo().length === 0) return;
    const last = this._undo().slice(-1)[0];
    this._undo.set(this._undo().slice(0, -1));
    this._redo.update(r => [...r, last]);
    // TODO: call real rollback logic or emit event for your annotation state manager
  }

  redo() {
    if (this._redo().length === 0) return;
    const last = this._redo().slice(-1)[0];
    this._redo.set(this._redo().slice(0, -1));
    this._undo.update(u => [...u, last]);
    // TODO: call real redo logic
  }
}
