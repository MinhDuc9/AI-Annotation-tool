import { ProjectUserRole } from "../../project-user-role/entities/project-user-role.entity";
import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from "typeorm";

@Entity()
export class User {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 30 })
    userName: string;

    @Column({ type: "varchar", length: 40, unique: true })
    email: string;

    @Column({ type: "varchar" })
    password: string;

    @OneToMany(() => ProjectUserRole, (userRole) => userRole.user, {
        cascade: true, // When saving user, automatically save related project roles
    })
    projectRoles: ProjectUserRole[];
}
