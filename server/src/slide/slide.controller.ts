import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
} from "@nestjs/common";
import { SlideService } from "./slide.service";
import { UpdateSlideDto } from "./dto/update-slide.dto";
import { RolesGuard } from "src/roles/roles.guard";
import { Roles } from "src/roles/roles.decorator";

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

    @Patch(":id")
    update(@Param("id") id: string, @Body() updateSlideDto: UpdateSlideDto) {
        return this.slideService.update(+id, updateSlideDto);
    }

    @Delete(":id")
    remove(@Param("id") id: string) {
        return this.slideService.remove(+id);
    }
}
