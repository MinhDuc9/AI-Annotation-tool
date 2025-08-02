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

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
            type: "postgres",
            host: process.env.HOST,
            port: Number(process.env.SQL_PORT),
            username: process.env.USERNAME,
            entities: [User, Project],
            database: process.env.DATABASE,
            synchronize: true,
            logging: true,
        }),
        UserModule,
        ProjectModule,
        AuthModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
