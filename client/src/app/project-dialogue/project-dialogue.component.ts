import {
    ChangeDetectionStrategy,
    Component,
    inject,
    input,
    model,
    signal,
} from '@angular/core';
import {
    FormArray,
    FormBuilder,
    FormControl,
    FormGroupDirective,
    NgForm,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FileInputComponent } from '../components/file-input/file-input.component';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { MatSelectModule } from '@angular/material/select';
import {
    MAT_DIALOG_DATA,
    MatDialogModule,
    MatDialogRef,
} from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SlideService } from '../services/slide.service';
import { ProjectService } from '../services/project.service';
import {
    catchError,
    finalize,
    forkJoin,
    map,
    of,
    switchMap,
    throwError,
} from 'rxjs';
import { DecimalPipe } from '@angular/common';

interface Role {
    roleName: string;
    value: number;
}

export class ProjectCreationErrorStateMatcher implements ErrorStateMatcher {
    isErrorState(
        control: FormControl | null,
        form: FormGroupDirective | NgForm | null
    ): boolean {
        const isSubmitted = form && form.submitted;
        return !!(
            control &&
            control.invalid &&
            (control.dirty || control.touched || isSubmitted)
        );
    }
}
@Component({
    selector: 'app-project-dialogue',
    imports: [
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        ReactiveFormsModule,
        MatIconModule,
        FileInputComponent,
        MatStepperModule,
        MatSelectModule,
        MatDialogModule,
        MatCheckboxModule,
        MatProgressBarModule,
        DecimalPipe,
    ],
    templateUrl: './project-dialogue.component.html',
    styleUrl: './project-dialogue.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDialogueComponent {
    private _snackBar = inject(MatSnackBar);
    private _formBuilder = inject(FormBuilder);
    private _projectService = inject(ProjectService);
    private _slideService = inject(SlideService);
    readonly dialogRef = inject(MatDialogRef<ProjectDialogueComponent>);
    readonly data = inject<String>(MAT_DIALOG_DATA);

    onNoClick(): void {
        this.dialogRef.close();
    }

    matcher = new ProjectCreationErrorStateMatcher();

    roleChoices: Role[] = [
        { roleName: 'Write', value: 1 },
        { roleName: 'Read', value: 2 },
    ];

    username = input('');
    files: File[] = [];
    fileError = signal(false);
    nameEmpty = signal(false);
    autoChoices = signal<boolean[]>([]); // selection per file
    autoAnnotating = signal(false);

    projectForm = this._formBuilder.group({
        projectName: ['', Validators.required],
        authorization: this._formBuilder.group({
            emails: this._formBuilder.array([
                this._formBuilder.control('', Validators.email),
            ]),
            roles: this._formBuilder.array([this._formBuilder.control(2)]),
        }),
    });

    // keep selection array in sync with file list
    removeFile(index: number) {
        if (this.files.length > 0) {
            this.files.splice(index, 1);
            const next = this.autoChoices().slice();
            next.splice(index, 1);
            this.autoChoices.set(next);
        }
    }

    uploadFile(files: FileList) {
        const added = Array.from(files);
        this.files.push(...added);
        const next = this.autoChoices().slice();
        for (let i = 0; i < added.length; i++) next.push(true); // default: selected
        this.autoChoices.set(next);
    }

    projectName() {
        return this.projectForm.get('projectName');
    }

    emails() {
        return this.projectForm.get('authorization.emails') as FormArray<
            FormControl<string | null>
        >;
    }

    roles() {
        return this.projectForm.get('authorization.roles') as FormArray<
            FormControl<number | null>
        >;
    }
    // helpers for Step 4 UI
    selectAllAuto() {
        this.autoChoices.set(this.files.map(() => true));
    }
    deselectAllAuto() {
        this.autoChoices.set(this.files.map(() => false));
    }
    toggleAutoChoice(i: number, checked: boolean) {
        const next = this.autoChoices().slice();
        next[i] = checked;
        this.autoChoices.set(next);
    }

    addEntry() {
        this.emails().push(this._formBuilder.control('', Validators.email));
        this.roles().push(this._formBuilder.control(2));
    }

    goStep2(stepper: MatStepper) {
        this.projectName()?.markAsTouched();
        if (this.projectName()?.valid) {
            stepper.next();
        }
    }

    goStep3(stepper: MatStepper) {
        this.emails().markAllAsTouched();
        if (this.emails().valid) {
            stepper.next();
        }
    }

    onSubmit(skipAuto: boolean) {
  if (this.projectForm.invalid || this.files.length === 0) {
    this.projectForm.markAllAsTouched();
    this.fileError.set(this.files.length === 0);
    this._snackBar.open('Please complete all required steps', 'Close', { duration: 3000 });
    return;
  }

  const projectName = this.projectName()?.value as string;

  this._projectService.createProject(projectName).pipe(
    catchError((err) => {
      this._snackBar.open('Failed to create project. Please try again.', 'Close', { duration: 3000 });
      return throwError(() => err);
    }),
    switchMap((proj) => {
      const projectId = proj.id;

      // roles (unchanged)
      const emails = this.emails().value.filter(Boolean);
      const roles = this.roles().value;
      emails.forEach((email, idx) => {
        const role = roles[idx];
        if (role === 1) this._projectService.addWriteUser(email!, projectId).subscribe();
        else if (role === 2) this._projectService.addReadUser(email!, projectId).subscribe();
      });

      // slides create + upload -> collect ids
      const perFile$ = this.files.map(file =>
        this._slideService.createSlide(projectId).pipe(
          switchMap(slide => {
            const fd = new FormData();
            fd.append('image', file);
            return this._slideService.updateSlide(projectId, slide.id, fd).pipe(map(() => slide.id));
          }),
          catchError(() => of(undefined as unknown as string))
        )
      );

      return forkJoin(perFile$).pipe(map(slideIds => ({ projectId, slideIds })));
    })
  ).subscribe(({ projectId, slideIds }) => {
    const selectedIds = this.autoChoices()
      .map((sel, i) => (sel ? slideIds[i] : null))
      .filter((v): v is string => !!v);

    const shouldAuto = !skipAuto && selectedIds.length > 0;

    if (shouldAuto) {
      // show ONE combined snackbar; do NOT close the dialog yet
      this.autoAnnotating.set(true);
      this._snackBar.open(
        `Project created. Auto-annotating ${selectedIds.length} slide(s)...`,
        'Hide',
        { duration: 3500 }
      );

      this._slideService.autoAnnotate(projectId, selectedIds as any).pipe(
        finalize(() => {
          this.autoAnnotating.set(false);
          // now it's done (success or error): close dialog
          this.dialogRef.close(true);
        })
      ).subscribe({
        next: () => {
          this._snackBar.open(
            `Auto-annotation complete for ${selectedIds.length} slide(s).`,
            'Close',
            { duration: 3000 }
          );
        },
        error: () => {
          this._snackBar.open(
            'Auto-annotation failed. You can retry from the project later.',
            'Close',
            { duration: 4000 }
          );
        }
      });

      return; // important: don't fall through to immediate close
    }

    // No auto-annotate path: close immediately
    this.dialogRef.close(true);
    this._snackBar.open('Project created successfully', 'Close', { duration: 3000 });
  });
}
}
