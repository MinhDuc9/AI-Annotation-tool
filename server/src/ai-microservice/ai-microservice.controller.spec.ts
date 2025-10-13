import { Test, TestingModule } from '@nestjs/testing';
import { AiMicroserviceController } from './ai-microservice.controller';
import { AiMicroserviceService } from './ai-microservice.service';

describe('AiMicroserviceController', () => {
  let controller: AiMicroserviceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiMicroserviceController],
      providers: [AiMicroserviceService],
    }).compile();

    controller = module.get<AiMicroserviceController>(AiMicroserviceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
