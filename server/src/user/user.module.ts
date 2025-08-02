import { Module } from "@nestjs/common";
import { UserService } from "./user.service";
import { UserController } from "./user.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./entities/user.entity";
import { Project } from "src/project/entities/project.entity";
import { AuthModule } from "src/auth/auth.module";

@Module({
    imports: [TypeOrmModule.forFeature([User, Project]), AuthModule],
    controllers: [UserController],
    providers: [UserService],
})
export class UserModule {}
