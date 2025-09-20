import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { SkeletalService } from "./skeletal.service";
import { Skeletal } from "./entities/skeletal.entity";
import { Slide } from "src/slide/entities/slide.entity";

describe("SkeletalService", () => {
    let service: SkeletalService;

    const createSkeletalRepositoryMock = () => ({
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        remove: jest.fn(),
    });

    const createSlideRepositoryMock = () => ({
        findOne: jest.fn(),
    });

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SkeletalService,
                {
                    provide: getRepositoryToken(Skeletal),
                    useFactory: createSkeletalRepositoryMock,
                },
                {
                    provide: getRepositoryToken(Slide),
                    useFactory: createSlideRepositoryMock,
                },
            ],
        }).compile();

        service = module.get<SkeletalService>(SkeletalService);
    });

    it("should be defined", () => {
        expect(service).toBeDefined();
    });
});
