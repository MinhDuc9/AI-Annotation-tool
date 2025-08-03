import { IsEnum, IsUUID } from "class-validator";

export class CreateProjectUserRoleDto {
    @IsUUID("4", { message: "Project ID must be a valid UUID" })
    projectId: string;

    @IsUUID("4", { message: "User ID must be a valid UUID" })
    userId: string;

    @IsEnum(["admin", "write", "read"], {
        message: "Role must be one of admin, write, or read",
    })
    role: "admin" | "write" | "read";
}
