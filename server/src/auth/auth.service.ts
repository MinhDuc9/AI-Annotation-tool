import {
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { JwtService } from "src/jwt/jwt.service";
import { User } from "src/user/entities/user.entity";
import { Repository } from "typeorm/repository/Repository";
import { CreateUserDto } from "src/user/dto/create-user.dto";
import { BadRequestException } from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { LoginUserDto } from "src/user/dto/login-user.dto";

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly jwtService: JwtService,
    ) {}

    async register(
        createUserDto: CreateUserDto,
    ): Promise<{ user: User; token: string }> {
        const user: User = new User();
        user.email = createUserDto.email;
        user.username = createUserDto.username;
        user.password = createUserDto.password;

        try {
            const savedUser = await this.userRepository.save(user);
            const token = this.jwtService.createJWT({
                id: savedUser.id,
                email: savedUser.email,
            });

            return { user: savedUser, token };
        } catch (error: unknown) {
            if (error instanceof QueryFailedError) {
                const driverError = error.driverError as {
                    code: string;
                    detail?: string;
                };
                if (
                    driverError.code === "23505" &&
                    driverError.detail?.includes("email")
                ) {
                    throw new BadRequestException("Email already in use");
                }
            }

            throw error;
        }
    }

    async login(loginUserDto: LoginUserDto): Promise<string> {
        const { email, password } = loginUserDto;
        const user = await this.userRepository.findOneBy({ email });

        if (!user) {
            throw new NotFoundException(`User with email ${email} not found`);
        }

        if (user.password !== password) {
            throw new UnauthorizedException("Wrong password!");
        }

        const token = this.jwtService.createJWT({
            id: user.id,
            email: user.email,
        });

        return token;
    }
}
