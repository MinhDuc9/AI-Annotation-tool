import { Test, TestingModule } from '@nestjs/testing';
import { BoundingBoxController } from './bounding-box.controller';
import { BoundingBoxService } from './bounding-box.service';

describe('BoundingBoxController', () => {
  let controller: BoundingBoxController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BoundingBoxController],
      providers: [BoundingBoxService],
    }).compile();

    controller = module.get<BoundingBoxController>(BoundingBoxController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
