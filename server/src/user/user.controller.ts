import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
} from "@nestjs/common";
import { UserService } from "./user.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { Public } from "src/auth/public.decorator";

@Controller("user")
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Post("register")
    @Public()
    create(@Body() createUserDto: CreateUserDto) {
        return this.userService.create(createUserDto);
    }

    @Get()
    findAll() {
        return this.userService.findAll();
    }

    @Get("login/:email")
    @Public()
    findOne(@Param("email") email: string) {
        return this.userService.findOne(email);
    }

    @Patch()
    update(@Body() updateUserDto: UpdateUserDto) {
        return this.userService.update(updateUserDto);
    }

    @Delete()
    remove() {
        return this.userService.remove();
    }
}
