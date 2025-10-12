import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ProjectService } from '../services/project.service';
import { CommonModule } from '@angular/common';

interface ShareData {
  projectId: string;
  projectName?: string;
}
@Component({
  selector: 'app-share-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule
  ],
  template: `
  <h2 mat-dialog-title>Share {{data.projectName || 'Project'}}</h2>
  <div mat-dialog-content [formGroup]="form">
    @for (ctrl of entries().controls; track $index; let i = $index) {
      <div class="row" formArrayName="entries">
        <mat-form-field appearance="outline" class="email">
          <mat-label>Email</mat-label>
          <input matInput [formControlName]="i" [formControl]="emailAt(i)" placeholder="name@example.com">
          <button mat-icon-button matSuffix (click)="remove(i)" aria-label="Remove"><mat-icon>close</mat-icon></button>
        </mat-form-field>

        <mat-form-field appearance="outline" class="role">
          <mat-label>Role</mat-label>
          <mat-select [formControl]="roleAt(i)">
            <mat-option [value]="1">Write</mat-option>
            <mat-option [value]="2">Read</mat-option>
          </mat-select>
        </mat-form-field>
      </div>
    }

    <button mat-stroked-button color="primary" (click)="add()">Add another</button>
  </div>

  <div mat-dialog-actions align="end">
    <button mat-button (click)="onCancel()">Cancel</button>
    <button mat-flat-button color="primary" (click)="onShare()">Share</button>
  </div>
`,
  styles: [`
    .row { display: grid; grid-template-columns: 1fr 160px; gap: 12px; margin-bottom: 8px; }
    .email, .role { width: 100%; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShareDialogComponent {
  readonly data = inject<ShareData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<ShareDialogComponent>);
  private fb = inject(FormBuilder);
  private proj = inject(ProjectService);
  private snack = inject(MatSnackBar);

  form = this.fb.group({
    entries: this.fb.array<FormControl<string | null>>([this.fb.control('', Validators.email)]),
    roles: this.fb.array<FormControl<number | null>>([this.fb.control(2)])
  });

  entries() { return this.form.get('entries') as FormArray<FormControl<string | null>>; }
  roles() { return this.form.get('roles') as FormArray<FormControl<number | null>>; }

  emailAt(i: number) { return this.entries().at(i); }
  roleAt(i: number) { return this.roles().at(i); }

  add() {
    this.entries().push(this.fb.control('', Validators.email));
    this.roles().push(this.fb.control(2));
  }
  remove(i: number) {
    if (this.entries().length <= 1) return;
    this.entries().removeAt(i);
    this.roles().removeAt(i);
  }

  onCancel() { this.dialogRef.close(); }

  onShare() {
    const emails = this.entries().value.filter(Boolean) as string[];
    const roles = this.roles().value as number[];
    if (!emails.length) { this.snack.open('Add at least one email', undefined, { duration: 1800 }); return; }
    const pid = this.data?.projectId;
    if (!pid) { this.snack.open('Missing project id', undefined, { duration: 1800 }); return; }

    // Fire and forget; simple UX
    emails.forEach((email, i) => {
      const role = roles[i] ?? 2;
      if (role === 1) this.proj.addWriteUser(email, pid).subscribe();
      else this.proj.addReadUser(email, pid).subscribe();
    });
    this.snack.open('Access updated', undefined, { duration: 1500 });
    this.dialogRef.close(true);
  }
}
