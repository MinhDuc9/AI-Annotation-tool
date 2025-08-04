import "reflect-metadata";
import { ValidationPipe, ClassSerializerInterceptor } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true, // strip unknown props
            forbidNonWhitelisted: true, // throw on unknown props
            transform: true, // auto-transform payloads to DTO instances
        }),
    );

    // Enable serialization interceptor to handle @Exclude and prevent circular JSON
    const reflector = app.get(Reflector);
    app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector));

    const configService = app.get(ConfigService);
    app.enableCors({
        origin:
            configService.get<string>("CLIENT_PORT") ?? "http://localhost:4200",
        methods: ["GET", "POST", "PATCH", "DELETE"],
        credentials: true,
    });
    const port = configService.get<number>("PORT") ?? 8080;
    await app.listen(port);
}

bootstrap().catch((err) => {
    console.error("Fatal error starting server:", err);
    process.exit(1);
});
