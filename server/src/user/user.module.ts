import { Module } from "@nestjs/common";
import { UserService } from "./user.service";
import { UserController } from "./user.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./entities/user.entity";
import { Project } from "src/project/entities/project.entity";
import { JwtService } from "src/jwt/jwt.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

@Module({
    imports: [
        ConfigModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>("JWT_SECRET"),
                signOptions: {
                    expiresIn:
                        configService.get<string>("JWT_EXPIRES_IN") ?? "1h",
                },
            }),
        }),
        TypeOrmModule.forFeature([User, Project]),
    ],
    controllers: [UserController],
    providers: [UserService, JwtService],
})
export class UserModule {}
