import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { config } from "dotenv";

config();

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((err) => {
    console.error("Fatal error starting server:", err);
    process.exit(1);
});
