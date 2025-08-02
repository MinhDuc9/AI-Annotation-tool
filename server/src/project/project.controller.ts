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
import { AdminsGuard } from "src/roles/admins.guard";
import { Roles } from "src/roles/roles.decorator";

@Controller("project")
@UseGuards(AdminsGuard)
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
        @Param("user_email") user_email: string,
        @Param("project_id") project_id: string,
    ) {
        return this.projectService.addWriteUser(project_id, user_email);
    }

    @Get(":project_id")
    findOneWithAdmins(@Param("project_id") project_id: string) {
        return this.projectService.findOneWithAdmins(project_id);
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
