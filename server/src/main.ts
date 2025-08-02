import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
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

    const configService = app.get(ConfigService);
    const port = configService.get<number>("PORT") ?? 3000;
    await app.listen(port);
}

bootstrap().catch((err) => {
    console.error("Fatal error starting server:", err);
    process.exit(1);
});
