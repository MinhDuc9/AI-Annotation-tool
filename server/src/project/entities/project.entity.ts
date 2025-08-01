import { User } from "src/user/entities/user.entity";
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToMany,
    JoinTable,
} from "typeorm";

@Entity()
export class Project {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar" })
    project_name: string;

    @ManyToMany(() => User, (user) => user.readProjects)
    @JoinTable({ name: "project_read_users" })
    readUsers: User[];

    @ManyToMany(() => User, (user) => user.writeProjects)
    @JoinTable({ name: "project_write_users" })
    writeUsers: User[];
}
