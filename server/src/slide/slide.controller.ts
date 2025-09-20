import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CreateBoundingBoxDto } from "src/bounding-box/dto/create-bounding-box.dto";
import { UpdateBoundingBoxDto } from "src/bounding-box/dto/update-bounding-box.dto";
import { CreateSkeletalDto } from "src/skeletal/dto/create-skeletal.dto";
import { UpdateSkeletalDto } from "src/skeletal/dto/update-skeletal.dto";
import { Roles } from "src/roles/roles.decorator";
import { RolesGuard } from "src/roles/roles.guard";
import { SlideService } from "./slide.service";
import { UpdateSlideDto } from "./dto/update-slide.dto";

@Controller("slide")
@UseGuards(RolesGuard)
export class SlideController {
    constructor(private readonly slideService: SlideService) {}

    @Post(":project_id")
    @Roles("admin", "write")
    create(@Param("project_id") projectId: string) {
        return this.slideService.create(projectId);
    }

    @Get("get_all/:project_id")
    findAll(@Param("project_id") projectId: string) {
        return this.slideService.findAll(projectId);
    }

    @Get("image/:slide_id")
    findOne(@Param("slide_id") slideId: string) {
        return this.slideService.findOneWithImage(slideId);
    }

    @Get("comments/:slide_id")
    findOneComments(@Param("slide_id") slideId: string) {
        return this.slideService.findOneWithComments(slideId);
    }

    @Patch(":project_id/:slide_id")
    @UseInterceptors(FileInterceptor("image"))
    @Roles("admin", "write")
    update(
        @Param("project_id") _: string,
        @Param("slide_id") slideId: string,
        @UploadedFile() file: unknown,
        @Body() dto: UpdateSlideDto,
    ) {
        return this.slideService.update(slideId, dto, file);
    }

    @Delete(":slide_id")
    remove(@Param("slide_id") slideId: string) {
        return this.slideService.remove(slideId);
    }

    @Get(":project_id/:slide_id/bounding_box")
    getAllBoundingBoxes(
        @Param("project_id")
        projectId: string,
        @Param("slide_id") slideId: string,
    ) {
        return this.slideService.getAllBoundingBoxes(projectId, slideId);
    }

    @Post(":project_id/:slide_id/bounding_box")
    createBoundingBox(
        @Param("project_id")
        projectId: string,
        @Param("slide_id") slideId: string,
        @Body() dto: CreateBoundingBoxDto,
    ) {
        return this.slideService.createBoundingBox(projectId, slideId, dto);
    }

    @Patch(":project_id/:slide_id/bounding_box/:bounding_box_id")
    updateBoundingBox(
        @Param("project_id")
        projectId: string,
        @Param("slide_id") slideId: string,
        @Param("bounding_box_id")
        boundingBoxId: string,
        @Body() dto: UpdateBoundingBoxDto,
    ) {
        return this.slideService.updateBoundingBox(
            projectId,
            slideId,
            boundingBoxId,
            dto,
        );
    }

    @Delete(":project_id/:slide_id/bounding_box/:bounding_box_id")
    deleteBoundingBox(
        @Param("project_id")
        projectId: string,
        @Param("slide_id") slideId: string,
        @Param("bounding_box_id")
        boundingBoxId: string,
    ) {
        return this.slideService.deleteBoundingBox(
            projectId,
            slideId,
            boundingBoxId,
        );
    }

    @Post(":project_id/:slide_id/skeletal")
    createSkeletal(
        @Param("project_id")
        projectId: string,
        @Param("slide_id") slideId: string,
        @Body() dto: CreateSkeletalDto,
    ) {
        return this.slideService.createSkeletal(projectId, slideId, dto);
    }

    @Patch(":project_id/:slide_id/skeletal/:skeletal_id")
    updateSkeletal(
        @Param("project_id")
        projectId: string,
        @Param("slide_id") slideId: string,
        @Param("skeletal_id")
        skeletalId: string,
        @Body() dto: UpdateSkeletalDto,
    ) {
        return this.slideService.updateSkeletal(
            projectId,
            slideId,
            skeletalId,
            dto,
        );
    }

    @Get(":project_id/:slide_id/skeletal")
    getAllSkeletals(
        @Param("project_id")
        projectId: string,
        @Param("slide_id") slideId: string,
    ) {
        return this.slideService.getAllSkeletals(projectId, slideId);
    }

    @Delete(":project_id/:slide_id/skeletal/:skeletal_id")
    deleteSkeletal(
        @Param("project_id")
        projectId: string,
        @Param("slide_id") slideId: string,
        @Param("skeletal_id")
        skeletalId: string,
    ) {
        return this.slideService.deleteSkeletal(projectId, slideId, skeletalId);
    }
}
