import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
} from "@nestjs/common";
import { ProjectService } from "./project.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";

@Controller("project")
export class ProjectController {
    constructor(private readonly projectService: ProjectService) {}

    @Post(":id")
    create(
        @Param("id") user_id: string,
        @Body() createProjectDto: CreateProjectDto,
    ) {
        return this.projectService.create(createProjectDto, user_id);
    }

    @Get("all/:user_id")
    findAll(@Param("user_id") user_id: string) {
        return this.projectService.findAll(user_id);
    }

    @Get(":id")
    findOne(@Param("id") id: string) {
        return this.projectService.findOne(+id);
    }

    @Patch(":id")
    update(
        @Param("id") id: string,
        @Body() updateProjectDto: UpdateProjectDto,
    ) {
        return this.projectService.update(+id, updateProjectDto);
    }

    @Delete(":id")
    remove(@Param("id") id: string) {
        return this.projectService.remove(+id);
    }
}
