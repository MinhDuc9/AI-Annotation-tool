import { Module } from "@nestjs/common";
import { ProjectService } from "./project.service";
import { ProjectController } from "./project.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "src/user/entities/user.entity";
import { Project } from "./entities/project.entity";
import { ProjectUserRole } from "src/project-user-role/entities/project-user-role.entity";
import { RolesGuard } from "src/roles/roles.guard";
import { ProjectUserRoleModule } from "src/project-user-role/project-user-role.module";
import { Slide } from "src/slide/entities/slide.entity";

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
