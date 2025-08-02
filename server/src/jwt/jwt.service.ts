import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService as NestJwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { JwtPayload } from "./jwt-payload.interface";

@Injectable()
export class JwtService {
    constructor(
        private readonly jwtService: NestJwtService,
        private readonly config: ConfigService,
    ) {}

    /**
     * Creates a signed JWT for the given payload,
     * using secret and expiration from process.env.
     */
    createJWT(payload: JwtPayload): string {
        const secret = this.config.get<string>("JWT_SECRET");
        // optional: read an expiresIn too (you could add JWT_EXPIRES_IN to .env)
        const expiresIn = this.config.get<string>("JWT_EXPIRES_IN") ?? "1h";
        return this.jwtService.sign(payload, { secret, expiresIn });
    }

    /**
     * Verifies and decodes a JWT, throwing if invalid or expired.
     */
    validateJWT(token: string): JwtPayload {
        try {
            const secret = this.config.get<string>("JWT_SECRET");
            return this.jwtService.verify(token, { secret });
        } catch {
            throw new UnauthorizedException("Invalid or expired token");
        }
    }
}
