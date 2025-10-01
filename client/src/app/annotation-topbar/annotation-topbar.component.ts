// src/app/annotation-edit/topbar/annotation-topbar.component.ts
import { Component, HostListener, computed, signal, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ReactiveFormsModule } from '@angular/forms';

// Local helpers / services (stubs provided below)
import { CollaborationService, Collaborator } from '../services/collaboration.service';
import { AnnotationHistoryService } from '../services/annotation-history.service';
import { ShareDialogAdvanced } from './share-dialog.component';

@Component({
  selector: 'app-annotation-topbar',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule
  ],
  templateUrl: './annotation-topbar.component.html',
  styleUrls: ['./annotation-topbar.component.scss']
})
export class AnnotationTopbarComponent {
  // Optional input: projectId (useful for share dialog)
  projectId = input<string | undefined>();

  // Outputs the parent can listen to; also the component will call history service itself if present
  undo = output<void>();
  redo = output<void>();

  private router = inject(Router);
  private dialog = inject(MatDialog);

  // optional services: if your app provides better implementations, they'll be used automatically
  private collabService = inject(CollaborationService, { optional: true });
  private historyService = inject(AnnotationHistoryService, { optional: true });

  // fallback in-component signals if services are missing
  private _fallbackCollabs = signal<Collaborator[]>([
    { id: 'u1', name: 'Alice Johnson', email: 'alice@example.com', online: true },
    { id: 'u2', name: 'Bob Smith', email: 'bob@example.com', online: true },
    { id: 'u3', name: 'Cecilia Tang', email: 'cecilia@example.com', online: false },
    { id: 'u4', name: 'David Lin', email: 'david@example.com', online: true },
    { id: 'u5', name: 'Eve Kim', email: 'eve@example.com', online: false }
  ]);

  // whichever signal we have from the service (or fallback)
  collaborators = this.collabService?.collaborators ?? this._fallbackCollabs;

  // UI computed helpers
  visibleCollaborators = computed(() => this.collaborators().slice(0, 4));
  extraCount = computed(() => Math.max(0, this.collaborators().length - 4));

  canUndo = computed(() => !!this.historyService ? this.historyService.canUndo() : false);
  canRedo = computed(() => !!this.historyService ? this.historyService.canRedo() : false);

  goBack() {
    this.router.navigateByUrl('/');
  }

  undoClicked() {
    // prefer service; also emit so parent can wire fallback handling
    this.historyService?.undo();
    this.undo.emit();
  }

  redoClicked() {
    this.historyService?.redo();
    this.redo.emit();
  }

  openShare() {
    this.dialog.open(ShareDialogAdvanced, {
      width: '460px',
      data: { projectId: this.projectId() }
    });
  }

  initials(name = '') {
    return (name || '').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  }

  // Keyboard shortcuts: Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z / Ctrl+Y
  // avoids interfering when user is typing in an input/textarea
  @HostListener('window:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    const activeTag = (document?.activeElement as HTMLElement | null)?.tagName?.toLowerCase();
    const typingElement = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || (document?.activeElement as HTMLElement)?.isContentEditable;
    if (typingElement) return;

    const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    const meta = isMac ? e.metaKey : e.ctrlKey;

    if (meta && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.undoClicked();
    } else if ((meta && e.shiftKey && e.key.toLowerCase() === 'z') || (meta && !isMac && e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      this.redoClicked();
    }
  }
}
