import { Module } from "@nestjs/common";
import { UserService } from "./user.service";
import { UserController } from "./user.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./entities/user.entity";
import { Project } from "src/project/entities/project.entity";

@Module({
    imports: [TypeOrmModule.forFeature([User, Project])],
    controllers: [UserController],
    providers: [UserService],
})
export class UserModule {}
