import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { UserModule } from "./user/user.module";
import { User } from "./user/entities/user.entity";
import { ProjectModule } from "./project/project.module";
import { Project } from "./project/entities/project.entity";
import { AuthModule } from "./auth/auth.module";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt/jwt-auth.guard";
import { ProjectUserRole } from "./project-user-role/entities/project-user-role.entity";
import { ProjectUserRoleModule } from "./project-user-role/project-user-role.module";
import { SlideModule } from "./slide/slide.module";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                type: "postgres",
                host: config.get<string>("HOST"),
                port: config.get<number>("SQL_PORT"),
                username: config.get<string>("USER_NAME"),
                password: config.get<string>("DATABASE_PASS"),
                database: config.get<string>("DATABASE"),
                entities: [User, Project, ProjectUserRole],
                synchronize: true,
                logging: true,
            }),
        }),
        UserModule,
        ProjectModule,
        ProjectUserRoleModule,
        AuthModule,
        SlideModule,
    ],
    controllers: [AppController],
    providers: [
        AppService,
        {
            provide: APP_GUARD,
            useClass: JwtAuthGuard,
        },
    ],
})
export class AppModule {}
