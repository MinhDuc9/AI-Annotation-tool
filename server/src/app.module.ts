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
import { Slide } from "./slide/entities/slide.entity";
import { CommentModule } from "./comment/comment.module";
import { Comment } from "./comment/entities/comment.entity";
import { BullModule } from "@nestjs/bullmq";
import type { BullRootModuleOptions } from "@nestjs/bullmq";
import type { DynamicModule } from "@nestjs/common";
import type { RegisterQueueOptions } from "@nestjs/bullmq";
import { BoundingBoxModule } from "./bounding-box/bounding-box.module";
import { BoundingBox } from "./bounding-box/entities/bounding-box.entity";
import { SkeletalModule } from "./skeletal/skeletal.module";
import { Skeletal } from "./skeletal/entities/skeletal.entity";
import { AiMicroserviceModule } from './ai-microservice/ai-microservice.module';

type BullModuleStatics = {
    forRoot: (options: BullRootModuleOptions) => DynamicModule;
    forRootAsync: (options: {
        imports?: any[];
        inject?: any[];
        useFactory: (...args: any[]) => BullRootModuleOptions;
    }) => DynamicModule;
    registerQueue: (...options: RegisterQueueOptions[]) => DynamicModule;
};
const TypedBullModule = BullModule as unknown as BullModuleStatics;

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
                entities: [
                    User,
                    Project,
                    ProjectUserRole,
                    Slide,
                    Comment,
                    BoundingBox,
                    Skeletal,
                ],
                synchronize: true,
                logging: true,
            }),
        }),
        TypedBullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService): BullRootModuleOptions => ({
                connection: {
                    host: config.get<string>("REDIS_HOST") ?? "127.0.0.1",
                    port: Number(config.get<string>("REDIS_PORT") ?? 6379),
                    // password: config.get<string>("REDIS_PASSWORD"),
                },
            }),
        }),
        TypedBullModule.registerQueue({ name: "comments" }),
        UserModule,
        ProjectModule,
        ProjectUserRoleModule,
        AuthModule,
        SlideModule,
        CommentModule,
        BoundingBoxModule,
        SkeletalModule,
        AiMicroserviceModule,
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
