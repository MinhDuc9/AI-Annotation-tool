import { Module } from "@nestjs/common";
import { ProjectUserRoleService } from "./project-user-role.service";
import { ProjectUserRoleController } from "./project-user-role.controller";
import { ProjectUserRole } from "./entities/project-user-role.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Project } from "src/project/entities/project.entity";
import { User } from "src/user/entities/user.entity";

@Module({
    imports: [TypeOrmModule.forFeature([Project, User, ProjectUserRole])],
    controllers: [ProjectUserRoleController],
    providers: [ProjectUserRoleService],
    exports: [ProjectUserRoleService],
})
export class ProjectUserRoleModule {}
