import { PartialType } from "@nestjs/mapped-types";
import { CreateProjectUserRoleDto } from "./create-project-user-role.dto";

export class UpdateProjectUserRoleDto extends PartialType(
    CreateProjectUserRoleDto,
) {}
