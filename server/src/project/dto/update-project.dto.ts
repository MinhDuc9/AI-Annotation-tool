import { PartialType } from "@nestjs/mapped-types";
import { CreateProjectDto } from "./create-project.dto";
import { Type } from "class-transformer";
import { IsArray, IsOptional, ValidateNested } from "class-validator";
import { UserRoleDto } from "./user-role.dto";

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UserRoleDto)
    userRoles?: UserRoleDto[];
}
