import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User } from "./entities/user.entity";
import { AuthService } from "src/auth/auth.service";

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly authService: AuthService,
    ) {}

    async create(
        createUserDto: CreateUserDto,
    ): Promise<{ user: User; token: string }> {
        return this.authService.register(createUserDto);
    }

    async findAll(): Promise<User[]> {
        return await this.userRepository.find();
    }

    async findOne(email: string): Promise<string> {
        return this.authService.login(email);
    }

    async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
        const user = await this.userRepository.findOneBy({ id });

        if (!user) {
            throw new NotFoundException(`User with id ${id} not found`);
        }

        if (updateUserDto.email !== undefined) {
            user.email = updateUserDto.email;
        }

        if (updateUserDto.password !== undefined) {
            user.password = updateUserDto.password;
        }

        if (updateUserDto.username !== undefined) {
            user.username = updateUserDto.username;
        }

        return this.userRepository.save(user);
    }

    async remove(id: string) {
        const check = await this.userRepository.findOneBy({ id });

        if (!check) {
            throw new NotFoundException(`User with id ${id} not found`);
        }

        return this.userRepository.delete({ id });
    }
}
