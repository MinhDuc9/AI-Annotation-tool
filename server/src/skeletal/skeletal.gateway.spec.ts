import { Test, TestingModule } from "@nestjs/testing";
import { SkeletalGateway } from "./skeletal.gateway";
import { getQueueToken } from "@nestjs/bullmq";

describe("SkeletalGateway", () => {
    let gateway: SkeletalGateway;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SkeletalGateway,
                {
                    provide: getQueueToken("skeletals"),
                    useValue: { add: jest.fn() },
                },
            ],
        }).compile();

        gateway = module.get<SkeletalGateway>(SkeletalGateway);
    });

    it("should be defined", () => {
        expect(gateway).toBeDefined();
    });
});
