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

    @Get()
    findAll() {
        return this.slideService.findAll();
    }

    @Get(":id")
    findOne(@Param("id") id: string) {
        return this.slideService.findOne(+id);
    }

    @Patch(":project_id/:slide_id")
    @UseInterceptors(FileInterceptor("image"))
    @Roles("admin", "write")
    update(
        @Param("project_id") _,
        @Param("slide_id")
        id: string,
        @UploadedFile() file: unknown,
        @Body() dto: UpdateSlideDto,
    ) {
        return this.slideService.update(id, dto, file);
    }

    @Delete(":id")
    remove(@Param("id") id: string) {
        return this.slideService.remove(+id);
    }
}
