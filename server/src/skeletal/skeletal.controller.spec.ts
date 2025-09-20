import { Test, TestingModule } from '@nestjs/testing';
import { SkeletalController } from './skeletal.controller';
import { SkeletalService } from './skeletal.service';

describe('SkeletalController', () => {
  let controller: SkeletalController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkeletalController],
      providers: [SkeletalService],
    }).compile();

    controller = module.get<SkeletalController>(SkeletalController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
