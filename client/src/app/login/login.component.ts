import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, FormGroupDirective, NgForm, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/Auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import {catchError, throwError} from 'rxjs';


export class LoginErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const isSubmitted = form && form.submitted;
    return !!(control && control.invalid && (control.dirty || control.touched || isSubmitted));
  }
}

@Component({
  selector: 'app-login',
  imports: [MatFormFieldModule, MatInputModule, MatButtonModule, ReactiveFormsModule, MatIconModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent { 
  private _snackBar = inject(MatSnackBar);
  router = inject(Router)
  authService = inject(AuthService)
  loginError = signal(false)

  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required])
  })

  matcher = new LoginErrorStateMatcher();

  hide = signal(true);
  clickEvent(event: MouseEvent) {
    this.hide.set(!this.hide());
    event.stopPropagation();
  }

  email(){
    return this.loginForm.get('email');
  }

  password(){
    return this.loginForm.get('password');
  }

  onSubmit() {
    if(this.loginForm.invalid){
      return;
    }
    this.authService
        .login(this.email()?.value!, this.password()?.value!)
        .pipe(catchError((err) => {
          if (err.status === 401 || err.status === 404) {
            this.loginError.set(true);
            this._snackBar.open('Wrong Password or Email', 'Close', {
                duration: 2000,
            });
            return throwError(() => new Error('Invalid Login'));
          }
          return throwError(() => new Error('Something went wrong. Please try again later.'));
        }))
        .subscribe((token) => {
            console.log(token);
            sessionStorage.setItem('email', this.email()?.value!);
            sessionStorage.setItem('token', token);
            this.router.navigate(['/']);
            this._snackBar.open('Logged in successfully', 'Close', {
                duration: 2000,
            });
        });
  }

  
}
