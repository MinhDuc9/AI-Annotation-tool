import { Test, TestingModule } from '@nestjs/testing';
import { BoundingBoxGateway } from './bounding-box.gateway';

describe('BoundingBoxGateway', () => {
  let gateway: BoundingBoxGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BoundingBoxGateway],
    }).compile();

    gateway = module.get<BoundingBoxGateway>(BoundingBoxGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
