import { Module } from "@nestjs/common";
import { ProjectService } from "./project.service";
import { ProjectController } from "./project.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../user/entities/user.entity";
import { Project } from "./entities/project.entity";
import { ProjectUserRole } from "../project-user-role/entities/project-user-role.entity";
import { RolesGuard } from "../roles/roles.guard";
import { ProjectUserRoleModule } from "../project-user-role/project-user-role.module";
import { Slide } from "../slide/entities/slide.entity";

@Module({
    imports: [
        TypeOrmModule.forFeature([Project, User, ProjectUserRole, Slide]),
        ProjectUserRoleModule,
    ],
    controllers: [ProjectController],
    providers: [ProjectService, RolesGuard],
    exports: [ProjectService],
})
export class ProjectModule {}
