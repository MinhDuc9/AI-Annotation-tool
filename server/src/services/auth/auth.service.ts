import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AuthService {
    constructor(private readonly jwtService: JwtService) {}

    /**
     * Create a JWT token containing the given user ID.
     * @param userId The UUID of the user.
     * @returns A signed JWT.
     */
    createToken(userId: string): string {
        return this.jwtService.sign({ userId });
    }
}
