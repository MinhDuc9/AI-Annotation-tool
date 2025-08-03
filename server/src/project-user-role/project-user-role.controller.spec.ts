import { Test, TestingModule } from '@nestjs/testing';
import { ProjectUserRoleController } from './project-user-role.controller';
import { ProjectUserRoleService } from './project-user-role.service';

describe('ProjectUserRoleController', () => {
  let controller: ProjectUserRoleController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectUserRoleController],
      providers: [ProjectUserRoleService],
    }).compile();

    controller = module.get<ProjectUserRoleController>(ProjectUserRoleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
