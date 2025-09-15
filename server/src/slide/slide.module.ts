import { Module } from "@nestjs/common";
import { SlideService } from "./slide.service";
import { SlideController } from "./slide.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Slide } from "./entities/slide.entity";
import { ProjectModule } from "src/project/project.module";
import { Project } from "src/project/entities/project.entity";
import { RolesGuard } from "src/roles/roles.guard";
import { ProjectUserRoleModule } from "src/project-user-role/project-user-role.module";
import { CommentModule } from "src/comment/comment.module";
import { Comment } from "src/comment/entities/comment.entity";

@Module({
    imports: [
        TypeOrmModule.forFeature([Slide, Project, Comment]),
        ProjectModule,
        CommentModule,
        ProjectUserRoleModule,
    ],
    controllers: [SlideController],
    providers: [SlideService, RolesGuard],
})
export class SlideModule {}
