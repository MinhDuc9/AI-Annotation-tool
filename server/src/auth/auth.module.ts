import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtModule } from "@nestjs/jwt";
import { User } from "../user/entities/user.entity";
import { Project } from "../project/entities/project.entity";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtService } from "../jwt/jwt.service";

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
                        configService.get<string>("JWT_EXPIRES_IN") ?? "24h",
                },
            }),
        }),
        TypeOrmModule.forFeature([User, Project]),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtService],
    exports: [AuthService, JwtService],
})
export class AuthModule {}
