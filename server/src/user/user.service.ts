import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, QueryFailedError } from "typeorm";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User } from "./entities/user.entity";

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    async create(createUserDto: CreateUserDto) {
        const user: User = new User();
        user.email = createUserDto.email;
        user.username = createUserDto.username;
        user.password = createUserDto.password;

        try {
            return await this.userRepository.save(user);
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

    findAll(): Promise<User[]> {
        return this.userRepository.find();
    }

    async findOne(id: string): Promise<User> {
        const user = await this.userRepository.findOneBy({ id });
        if (!user) {
            throw new NotFoundException(`User with id ${id} not found`);
        }
        return user;
    }

    async findOneEmail(email: string): Promise<User> {
        const user = await this.userRepository.findOneBy({ email });
        if (!user) {
            throw new NotFoundException(`User with email ${email} not found`);
        }
        return user;
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
