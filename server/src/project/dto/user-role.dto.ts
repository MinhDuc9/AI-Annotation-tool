import { IsEmail, IsEnum } from "class-validator";

export class UserRoleDto {
    @IsEmail()
    userEmail: string;

    @IsEnum(["admin", "write", "read"], {
        message: "Role must be one of admin, write, or read",
    })
    role: "admin" | "write" | "read";
}
