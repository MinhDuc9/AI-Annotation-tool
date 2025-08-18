import { AbstractControl, ValidationErrors } from "@angular/forms";

/*
    Taken from: https://www.youtube.com/watch?v=QImCFfPBJdA
*/
function passwordStrength(control: AbstractControl): ValidationErrors | null {
    const password = control.value;

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumericChar = /[0-9]/.test(password);
    const aSpecialChar = /[!@#$^&*(),.?":{}|<>]/.test(password);

    const isPasswordValid = hasLowerCase && hasUpperCase && hasNumericChar && aSpecialChar;

    const validationErrors = {
        hasUpperCase: !hasUpperCase,
        hasLowerCase: !hasLowerCase,
        hasNumericChar: !hasNumericChar,
        aSpecialChar: !aSpecialChar
    }

    return isPasswordValid ? null : validationErrors;
}

const PasswordValidator = {
    passwordStrength
}

export default PasswordValidator;