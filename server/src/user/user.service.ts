import { Injectable, NotFoundException, Inject, Scope } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { LoginUserDto } from "./dto/login-user.dto";
import { User } from "./entities/user.entity";
import { AuthService } from "../auth/auth.service";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { JwtPayload } from "../jwt/jwt-payload.interface";

@Injectable({ scope: Scope.REQUEST })
export class UserService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,

        private readonly authService: AuthService,

        @Inject(REQUEST)
        private readonly request: Request,
    ) {}

    async create(
        createUserDto: CreateUserDto,
    ): Promise<{ user: User; token: string }> {
        return this.authService.register(createUserDto);
    }

    async findAll(): Promise<User[]> {
        return await this.userRepository.find({
            select: ["email", "userName"],
        });
    }

    async login(loginUserDto: LoginUserDto): Promise<string> {
        return this.authService.login(loginUserDto);
    }

    async update(updateUserDto: UpdateUserDto): Promise<User> {
        const id: string = (this.request.user as JwtPayload).id;
        const user = await this.userRepository.findOneBy({ id });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        if (updateUserDto.email !== undefined) {
            user.email = updateUserDto.email;
        }

        if (updateUserDto.password !== undefined) {
            user.password = updateUserDto.password;
        }

        if (updateUserDto.userName !== undefined) {
            user.userName = updateUserDto.userName;
        }

        return this.userRepository.save(user);
    }

    async remove(): Promise<void> {
        const id: string = (this.request.user as JwtPayload).id;
        const check = await this.userRepository.findOneBy({ id });

        if (!check) {
            throw new NotFoundException("User not found");
        }

        await this.userRepository.delete({ id });
    }
}
