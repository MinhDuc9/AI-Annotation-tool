import { Test, TestingModule } from '@nestjs/testing';
import { AiMicroserviceService } from './ai-microservice.service';

describe('AiMicroserviceService', () => {
  let service: AiMicroserviceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiMicroserviceService],
    }).compile();

    service = module.get<AiMicroserviceService>(AiMicroserviceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
