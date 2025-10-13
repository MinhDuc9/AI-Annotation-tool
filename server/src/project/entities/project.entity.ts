import { ProjectUserRole } from "../../project-user-role/entities/project-user-role.entity";
import { Slide } from "../../slide/entities/slide.entity";
import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from "typeorm";

@Entity()
export class Project {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar" })
    projectName: string;

    @OneToMany(() => ProjectUserRole, (userRole) => userRole.project, {
        cascade: true, // When saving project, automatically save related user roles
    })
    userRoles: ProjectUserRole[];

    @OneToMany(() => Slide, (slide) => slide.project, {
        cascade: true,
    })
    slides: Slide[];
}
