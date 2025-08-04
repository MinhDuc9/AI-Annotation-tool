// src/types/express.d.ts
import { JwtPayload } from "../jwt/jwt.service";

declare global {
    namespace Express {
        interface Request {
            /** Populated by JwtAuthGuard */
            user?: JwtPayload;
        }
    }
}
