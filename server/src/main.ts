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
    const originsValue =
        configService.get<string>("CLIENT_ORIGINS") ??
        configService.get<string>("CLIENT_PORT");

    const corsOrigin =
        !originsValue || originsValue.trim() === "*"
            ? true
            : originsValue
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean);

    app.enableCors({
        origin: corsOrigin,
        methods: ["GET", "POST", "PATCH", "DELETE"],
        credentials: true,
    });

    const portRaw = configService.get<string>("PORT");
    const port = portRaw ? Number(portRaw) : 8080;
    if (Number.isNaN(port)) {
        throw new Error(`Invalid PORT value "${portRaw}"`);
    }

    const host = configService.get<string>("SERVER_HOST") ?? "0.0.0.0";
    await app.listen(port, host);
}

bootstrap().catch((err) => {
    console.error("Fatal error starting server:", err);
    process.exit(1);
});
