import { ChangeDetectionStrategy, Component, inject, signal, WritableSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/Auth.service';
import { FormControl, FormGroup, FormGroupDirective, NgForm, ReactiveFormsModule, Validators } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatIconModule } from "@angular/material/icon";
import { catchError, throwError } from 'rxjs';

export class RegisterErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const isSubmitted = form && form.submitted;
    return !!(control && control.invalid && (control.dirty || control.touched || isSubmitted));
  }
}

@Component({
  selector: 'app-register',
  imports: [MatFormFieldModule, MatInputModule, MatButtonModule, ReactiveFormsModule, RouterLink, MatIconModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  private _snackBar = inject(MatSnackBar);
  router = inject(Router);
  authService = inject(AuthService);
  registerError = signal(false);

  registerForm = new FormGroup({
    username: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required]),
    confirmPassword: new FormControl('', [Validators.required])
  });

  matcher = new RegisterErrorStateMatcher();

  hidePassword = signal(true);
  hideConfirmPassword = signal(true);
  clickEvent(event: MouseEvent, signal: WritableSignal<boolean>) {
    signal.set(!signal());
    event.stopPropagation();
  };

  username(){
    return this.registerForm.get('username')
  }

  email(){
    return this.registerForm.get('email');
  };

  password(){
    return this.registerForm.get('password');
  };

  confirmPassword(){
    return this.registerForm.get('confirmPassword');
  };

  onSubmit(){
    if(this.registerForm.invalid){
      return;
    }
    this.authService
        .register(this.username()?.value!, this.email()?.value!, this.password()?.value!)
        .pipe(catchError((err) => {
          if (err.status === 401 || err.status === 404) {
            this.registerError.set(true);
            this._snackBar.open('Email already used', 'Close', {
                duration: 2000,
            });
            return throwError(() => new Error('Invalid Login'));
          }
          return throwError(() => new Error('Something went wrong. Please try again later.'));
        }))
        .subscribe(() => {
            this.router.navigate(['/register']);
        });
  };
}
