import { Exclude } from "class-transformer";
import { Project } from "src/project/entities/project.entity";
import { User } from "src/user/entities/user.entity";
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    Index,
    ManyToOne,
} from "typeorm";

@Entity("project_user_roles")
@Index(["projectId", "userId"], { unique: true })
export class ProjectUserRole {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    projectId: string;

    @Column({ type: "uuid" })
    userId: string;

    /**
     * The role of the user in the project. Only one role per user per project.
     * Admin > Write > Read in terms of permissions hierarchy.
     */
    @Column({
        type: "enum",
        enum: ["admin", "write", "read"],
    })
    role: "admin" | "write" | "read";

    /**
     * Many ProjectUserRole records belong to one Project
     */
    @Exclude({ toPlainOnly: true })
    @ManyToOne(() => Project, (project) => project.userRoles)
    project: Project;

    @Exclude({ toPlainOnly: true })
    @ManyToOne(() => User, (user) => user.projectRoles)
    user: User;
}
