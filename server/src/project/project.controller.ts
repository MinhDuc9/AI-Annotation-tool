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
import { RolesGuard } from "../roles/roles.guard";
import { Roles } from "../roles/roles.decorator";

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

    @Get("all_user_project/:project_id")
    @Roles("admin", "write", "read")
    getAllUserProject(@Param("project_id") projectId: string) {
        return this.projectService.getAllUserProject(projectId);
    }

    @Patch("add_write_user/:user_email/:project_id")
    @Roles("admin")
    addWriteUser(
        @Param("user_email") userEmail: string,
        @Param("project_id") projectId: string,
    ) {
        return this.projectService.addWriteUser(projectId, userEmail);
    }

    @Patch("add_read_user/:user_email/:project_id")
    @Roles("admin", "write")
    addReadUser(
        @Param("user_email") userEmail: string,
        @Param("project_id") projectId: string,
    ) {
        return this.projectService.addReadUser(projectId, userEmail);
    }

    @Patch(":project_id")
    @Roles("admin")
    update(
        @Param("project_id") projectId: string,
        @Body() updateProjectDto: UpdateProjectDto,
    ) {
        return this.projectService.update(projectId, updateProjectDto);
    }

    @Delete(":project_id")
    @Roles("admin")
    remove(@Param("project_id") projectId: string) {
        return this.projectService.remove(projectId);
    }
}
