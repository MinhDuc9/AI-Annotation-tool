import { Module } from '@nestjs/common';
import { AiMicroserviceService } from './ai-microservice.service';
import { AiMicroserviceController } from './ai-microservice.controller';

@Module({
  controllers: [AiMicroserviceController],
  providers: [AiMicroserviceService],
})
export class AiMicroserviceModule {}
