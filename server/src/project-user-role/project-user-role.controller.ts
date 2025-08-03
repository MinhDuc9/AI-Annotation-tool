import { Controller, Get, Post, Body, Param } from "@nestjs/common";
import { ProjectUserRoleService } from "./project-user-role.service";
import { CreateProjectUserRoleDto } from "./dto/create-project-user-role.dto";

@Controller("project-user-role")
export class ProjectUserRoleController {
    constructor(
        private readonly projectUserRoleService: ProjectUserRoleService,
    ) {}

    @Post()
    create(@Body() createProjectUserRoleDto: CreateProjectUserRoleDto) {
        return this.projectUserRoleService.create(createProjectUserRoleDto);
    }

    @Get()
    findAll() {
        return this.projectUserRoleService.findAll();
    }

    @Get(":id")
    findOne(@Param("id") id: string) {
        return this.projectUserRoleService.findOne(id);
    }
}
