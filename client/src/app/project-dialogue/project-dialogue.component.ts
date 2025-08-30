import { ChangeDetectionStrategy, Component, inject, input, model, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroupDirective, NgForm, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FileInputComponent } from '../components/file-input/file-input.component';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { MatSelectModule } from '@angular/material/select';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { SlideService } from '../services/slide.service';
import { ProjectService } from '../services/project.service';
import { catchError, throwError } from 'rxjs';

interface Role {
    roleName: string;
    value: number;
}

export class ProjectCreationErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const isSubmitted = form && form.submitted;
    return !!(control && control.invalid && (control.dirty || control.touched || isSubmitted));
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
        // MatDialogModule
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
    // readonly dialogRef = inject(MatDialogRef<ProjectDialogueComponent>);
    // readonly data = inject<String>(MAT_DIALOG_DATA);
    // readonly user_token = model(this.data);


    // onNoClick(): void {
    //     this.dialogRef.close();
    // }


    matcher = new ProjectCreationErrorStateMatcher();

    roleChoices: Role[] = [
        { roleName: 'Write', value: 1 },
        { roleName: 'Read', value: 2 },
    ];

    username = input('');
    files: File[] = [];
    fileError = signal(false);
    nameEmpty = signal(false);

    projectForm = this._formBuilder.group({
        projectName: ['', Validators.required],
        authorization: this._formBuilder.group({
            emails: this._formBuilder.array([
                this._formBuilder.control('', Validators.email),
            ]),
            roles: this._formBuilder.array([this._formBuilder.control(2)]),
        }),
    });

    removeFile(index: number) {
        if (this.files.length > 0) {
            this.files.splice(index, 1);
        }
    }

    uploadFile(files: FileList) {
        this.files.push(...Array.from(files));
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
            FormControl<string | null>
        >;
    }

    addEntry() {
        this.emails().push(this._formBuilder.control('', Validators.email));
        this.roles().push(this._formBuilder.control(''));
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

    onSubmit() {
        var projectId = '';
        var slideIds: string[] = [];
        if (this.projectForm.valid) {

            this._projectService
                .createProject(this.projectName()?.value as string).pipe(
                    catchError((err) => {
                        this._snackBar.open('Something went wrong. Please try again later.', 'Close', {
                            duration: 3000,
                        });
                        return throwError(() => new Error('Something went wrong. Please try again later.'));
                }))
                .subscribe((res) => {
                    console.log(res);
                    projectId = res.id;
                    console.log(projectId);
                });

            if (projectId != '') {
                this.files.forEach((file) => {
                this._slideService
                    .createSlide(projectId).pipe(
                        catchError((err) => {
                            this._snackBar.open('Something went wrong. Please try again later.', 'Close', {
                                duration: 3000,
                            });
                            return throwError(() => new Error('Something went wrong. Please try again later.'));
                    }))
                    .subscribe((res) => {
                        slideIds.push(res.id)
                    });
            });

            slideIds.forEach((slideId, i) => {
                var formData = new FormData();
                formData.append('file', this.files[i]);
                this._slideService
                    .updateSlide(projectId, slideId, formData).pipe(
                        catchError((err) => {
                            this._snackBar.open('Something went wrong. Please try again later.', 'Close', {
                                duration: 3000,
                            });
                            return throwError(() => new Error('Something went wrong. Please try again later.'));
                    }))
                    .subscribe();
            })
            this._snackBar.open('Project created successfully', 'Close', {
                duration: 3000,
            });

            }

            
            
        }
    }
}
