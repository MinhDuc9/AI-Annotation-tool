import { Test, TestingModule } from "@nestjs/testing";
import { ProjectUserRoleService } from "./project-user-role.service";

describe("ProjectUserRoleService", () => {
    let service: ProjectUserRoleService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [ProjectUserRoleService],
        }).compile();

        service = module.get<ProjectUserRoleService>(ProjectUserRoleService);
    });

    it("should be defined", () => {
        expect(service).toBeDefined();
    });
});
