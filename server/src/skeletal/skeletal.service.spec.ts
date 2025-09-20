import { Test, TestingModule } from '@nestjs/testing';
import { SkeletalService } from './skeletal.service';

describe('SkeletalService', () => {
  let service: SkeletalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SkeletalService],
    }).compile();

    service = module.get<SkeletalService>(SkeletalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
