import { Module } from "@nestjs/common";
import { ProjectService } from "./project.service";
import { ProjectController } from "./project.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "src/user/entities/user.entity";
import { Project } from "./entities/project.entity";
import { AdminsGuard } from "src/roles/admins.guard";

@Module({
    imports: [TypeOrmModule.forFeature([Project, User])],
    controllers: [ProjectController],
    providers: [ProjectService, AdminsGuard],
})
export class ProjectModule {}
