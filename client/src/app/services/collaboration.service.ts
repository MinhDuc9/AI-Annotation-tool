// src/app/annotation-edit/topbar/services/collaboration.service.ts
import { Injectable, signal } from '@angular/core';

export interface Collaborator {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  online?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CollaborationService {
  // small signal that holds collaborator list; your real app likely streams this from a socket
  private _collabs = signal<Collaborator[]>([]);
  collaborators = this._collabs;

  setCollaborators(list: Collaborator[]) {
    this._collabs.set(list);
  }

  // convenience: add / remove
  upsert(collab: Collaborator) {
    this._collabs.update(arr => {
      const idx = arr.findIndex(c => c.id === collab.id);
      if (idx === -1) return [...arr, collab];
      const copy = arr.slice();
      copy[idx] = collab;
      return copy;
    });
  }

  remove(id: string) {
    this._collabs.update(arr => arr.filter(c => c.id !== id));
  }
}
