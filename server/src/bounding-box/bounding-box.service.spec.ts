import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BoundingBoxService } from "./bounding-box.service";
import { BoundingBox } from "./entities/bounding-box.entity";
import { Slide } from "src/slide/entities/slide.entity";

describe("BoundingBoxService", () => {
    let service: BoundingBoxService;

    const createBoundingBoxRepositoryMock = () => ({
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
                BoundingBoxService,
                {
                    provide: getRepositoryToken(BoundingBox),
                    useFactory: createBoundingBoxRepositoryMock,
                },
                {
                    provide: getRepositoryToken(Slide),
                    useFactory: createSlideRepositoryMock,
                },
            ],
        }).compile();

        service = module.get<BoundingBoxService>(BoundingBoxService);
    });

    it("should be defined", () => {
        expect(service).toBeDefined();
    });
});
