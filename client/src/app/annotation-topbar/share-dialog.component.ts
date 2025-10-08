// src/app/annotation-edit/topbar/share-dialog.component.ts
import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-share-dialog-advanced',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  template: `
    <h2 mat-dialog-title>Share project</h2>
    <mat-dialog-content style="min-width:320px;">
      <p>Invite new users by email and give them a role.</p>
      <form style="display:grid; gap:12px;">
        <mat-form-field appearance="outline">
          <mat-label>Email</mat-label>
          <input matInput [formControl]="email" placeholder="name@example.com" />
          <mat-error *ngIf="email.invalid">Please enter a valid email</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Permission</mat-label>
          <mat-select [formControl]="permission">
            <mat-option value="viewer">Viewer</mat-option>
            <mat-option value="commenter">Commenter</mat-option>
            <mat-option value="editor">Editor</mat-option>
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close()" tabindex="-1">Cancel</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="email.invalid || sending()" >
        <mat-spinner *ngIf="sending()" diameter="18"></mat-spinner>
        <span *ngIf="!sending()">Invite</span>
      </button>
    </mat-dialog-actions>
  `,
})
export class ShareDialogAdvanced {
  private dialogRef = inject(MatDialogRef<ShareDialogAdvanced>, { optional: true });
  readonly data = inject(MAT_DIALOG_DATA, { optional: true }) as { projectId?: string } | undefined;

  email = new FormControl('', [Validators.required, Validators.email]);
  permission = new FormControl('viewer');
  sending = signal(false);

  submit() {
    if (this.email.invalid) return;
    this.sending.set(true);
    // TODO: call your backend invite endpoint here. For now we simulate.
    setTimeout(() => {
      this.sending.set(false);
      this.close();
    }, 800);
  }

  close() {
    this.dialogRef?.close();
  }
}
