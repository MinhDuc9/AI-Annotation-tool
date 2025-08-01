import { User } from "src/user/entities/user.entity";
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToMany,
    JoinTable,
    BeforeInsert,
    BeforeUpdate,
} from "typeorm";

@Entity()
export class Project {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar" })
    project_name: string;

    @ManyToMany(() => User, (user) => user.adminProjects)
    @JoinTable({ name: "project_admin_users" })
    admins: User[];

    @ManyToMany(() => User, (user) => user.readProjects)
    @JoinTable({ name: "project_read_users" })
    readUsers: User[];

    @ManyToMany(() => User, (user) => user.writeProjects)
    @JoinTable({ name: "project_write_users" })
    writeUsers: User[];

    @BeforeInsert()
    @BeforeUpdate()
    enforceConstraints() {
        // Deduplicate each list by user ID
        const adminMap = new Map((this.admins ?? []).map((u) => [u.id, u]));
        const writeMap = new Map((this.writeUsers ?? []).map((u) => [u.id, u]));
        const readMap = new Map((this.readUsers ?? []).map((u) => [u.id, u]));

        // Exclude admins from write and read
        for (const id of adminMap.keys()) {
            writeMap.delete(id);
            readMap.delete(id);
        }
        // Exclude writers from read
        for (const id of writeMap.keys()) {
            readMap.delete(id);
        }

        // Assign back mutually exclusive arrays
        this.admins = Array.from(adminMap.values());
        this.writeUsers = Array.from(writeMap.values());
        this.readUsers = Array.from(readMap.values());
    }
}
