import { Test, TestingModule } from "@nestjs/testing";
import { CommentGateway } from "./comment.gateway";

describe("CommentGateway", () => {
    let gateway: CommentGateway;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [CommentGateway],
        }).compile();

        gateway = module.get<CommentGateway>(CommentGateway);
    });

    it("should be defined", () => {
        expect(gateway).toBeDefined();
    });
});
