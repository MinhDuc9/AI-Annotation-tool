import { Injectable } from "@nestjs/common";
import { CreateAiMicroserviceDto } from "./dto/create-ai-microservice.dto";
import { UpdateAiMicroserviceDto } from "./dto/update-ai-microservice.dto";

@Injectable()
export class AiMicroserviceService {
    create(createAiMicroserviceDto: CreateAiMicroserviceDto) {
        return "This action adds a new aiMicroservice";
    }

    findAll() {
        return `This action returns all aiMicroservice`;
    }

    findOne(id: number) {
        return `This action returns a #${id} aiMicroservice`;
    }

    update(id: number, updateAiMicroserviceDto: UpdateAiMicroserviceDto) {
        return `This action updates a #${id} aiMicroservice`;
    }

    remove(id: number) {
        return `This action removes a #${id} aiMicroservice`;
    }
}
