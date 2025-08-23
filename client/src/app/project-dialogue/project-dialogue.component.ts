import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormBuilder, FormControl, FormGroupDirective, NgForm, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FileInputComponent } from '../components/file-input/file-input.component';
import { ErrorStateMatcher } from '@angular/material/core';


export class ProjectCreationErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const isSubmitted = form && form.submitted;
    return !!(control && control.invalid && (control.dirty || control.touched || isSubmitted));
  }
}
@Component({
  selector: 'app-project-dialogue',
  imports: [MatFormFieldModule, MatInputModule, MatButtonModule, ReactiveFormsModule, MatIconModule, FileInputComponent],
  templateUrl: './project-dialogue.component.html',
  styleUrl: './project-dialogue.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDialogueComponent {
  private _snackBar = inject(MatSnackBar);
  private _formBuilder = inject(FormBuilder);

  matcher = new ProjectCreationErrorStateMatcher();


  access = ['read-only', 'admin'];
  username = input('');
  files: File[] = [];

  projectForm = this._formBuilder.group({
    projectName: ['', Validators.required],
    authorization: this._formBuilder.group({
      emails: this._formBuilder.array([this._formBuilder.control('', Validators.email)]),
      roles: this._formBuilder.array([this._formBuilder.control('')]),
    }),
  });

  removeFile(index: number) {
    if (this.files.length > 0){
      this.files.splice(index, 1);
    }
  }

  uploadFile(files: FileList) {
    this.files.push(...Array.from(files));
  }

  projectName(){
    return this.projectForm.get('projectName');
  }

  emails(){
    return this.projectForm.get('authorization.emails');
  }

  roles(){
    return this.projectForm.get('authorization.roles');
  }

  onSubmit() {
    if (this.projectForm.valid) {
      this._snackBar.open('Project created successfully', 'Close', {
        duration: 3000,
      });
    }
  }
}
