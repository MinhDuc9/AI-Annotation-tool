import {
    IsAlphanumeric,
    IsEmail,
    IsNotEmpty,
    Matches,
    MinLength,
} from "class-validator";

const passwordRegEx =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*d)(?=.*[@$!%*?&])[A-Za-zd@$!%*?&]{8,20}$/;

export class CreateUserDto {
    @IsNotEmpty()
    @MinLength(3, { message: "Username must have at least 3 characters." })
    @IsAlphanumeric("en-US", {
        message: "Username may only contain letters and numbers.",
    })
    username: string;

    @IsNotEmpty()
    @IsEmail({}, { message: "Please provide a valid email address." })
    email: string;

    @IsNotEmpty()
    @Matches(passwordRegEx, {
        message: `Password must be 8-20 characters, include uppercase, lowercase, a number and a special character.`,
    })
    password: string;
}
