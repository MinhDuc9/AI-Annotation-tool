import { Test, TestingModule } from '@nestjs/testing';
import { BoundingBoxService } from './bounding-box.service';

describe('BoundingBoxService', () => {
  let service: BoundingBoxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BoundingBoxService],
    }).compile();

    service = module.get<BoundingBoxService>(BoundingBoxService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
