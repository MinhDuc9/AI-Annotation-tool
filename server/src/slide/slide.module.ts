import { Module } from "@nestjs/common";
import { SlideService } from "./slide.service";
import { SlideController } from "./slide.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Slide } from "./entities/slide.entity";
import { ProjectModule } from "../project/project.module";
import { Project } from "../project/entities/project.entity";
import { RolesGuard } from "../roles/roles.guard";
import { ProjectUserRoleModule } from "../project-user-role/project-user-role.module";
import { CommentModule } from "../comment/comment.module";
import { Comment } from "../comment/entities/comment.entity";
import { BoundingBox } from "../bounding-box/entities/bounding-box.entity";
import { BoundingBoxModule } from "../bounding-box/bounding-box.module";
import { Skeletal } from "../skeletal/entities/skeletal.entity";
import { SkeletalModule } from "../skeletal/skeletal.module";
import { SlideGateway } from "./slide.gateway";

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Slide,
            Project,
            Comment,
            BoundingBox,
            Skeletal,
        ]),
        ProjectModule,
        CommentModule,
        ProjectUserRoleModule,
        BoundingBoxModule,
        SkeletalModule,
    ],
    controllers: [SlideController],
    providers: [SlideService, RolesGuard, SlideGateway],
})
export class SlideModule {}
