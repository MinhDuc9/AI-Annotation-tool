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
import { ProjectService } from "./project.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { RolesGuard } from "src/roles/roles.guard";
import { Roles } from "src/roles/roles.decorator";

@Controller("project")
@UseGuards(RolesGuard)
export class ProjectController {
    constructor(private readonly projectService: ProjectService) {}

    @Post()
    create(@Body() createProjectDto: CreateProjectDto) {
        return this.projectService.create(createProjectDto);
    }

    @Get("all")
    findAll() {
        return this.projectService.findAll();
    }

    @Patch("add_write_user/:user_email/:project_id")
    @Roles("admin")
    addWriteUser(
        @Param("user_email") userEmail: string,
        @Param("project_id") project_id: string,
    ) {
        return this.projectService.addWriteUser(project_id, userEmail);
    }

    @Patch("add_read_user/:user_email/:project_id")
    @Roles("admin", "write")
    addReadUser(
        @Param("user_email") user_email: string,
        @Param("project_id") project_id: string,
    ) {
        return this.projectService.addReadUser(project_id, user_email);
    }

    @Patch(":project_id")
    @Roles("admin", "write")
    update(
        @Param("project_id") project_id: string,
        @Body() updateProjectDto: UpdateProjectDto,
    ) {
        return this.projectService.update(project_id, updateProjectDto);
    }

    @Delete(":project_id")
    @Roles("admin")
    remove(@Param("project_id") project_id: string) {
        return this.projectService.remove(project_id);
    }
}
