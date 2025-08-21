import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    UseInterceptors,
    UploadedFile,
} from "@nestjs/common";
import { SlideService } from "./slide.service";
import { UpdateSlideDto } from "./dto/update-slide.dto";
import { RolesGuard } from "src/roles/roles.guard";
import { Roles } from "src/roles/roles.decorator";
import { FileInterceptor } from "@nestjs/platform-express";

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

    @Get(":slide_id")
    findOne(@Param("slide_id") slideId: string) {
        return this.slideService.findOne(slideId);
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
}
