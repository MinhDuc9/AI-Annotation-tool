import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { UserModule } from "./user/user.module";
import { User } from "./user/entities/user.entity";
import { ProjectModule } from "./project/project.module";
import { Project } from "./project/entities/project.entity";
import { AuthModule } from "./auth/auth.module";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt/jwt-auth.guard";
import { ProjectUserRole } from "./project-user-role/entities/project-user-role.entity";
import { ProjectUserRoleModule } from "./project-user-role/project-user-role.module";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
            type: "postgres",
            host: process.env.HOST,
            port: Number(process.env.SQL_PORT),
            username: process.env.USERNAME,
            entities: [User, Project, ProjectUserRole],
            database: process.env.DATABASE,
            synchronize: true,
            logging: true,
        }),
        UserModule,
        ProjectModule,
        ProjectUserRoleModule,
        AuthModule,
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
