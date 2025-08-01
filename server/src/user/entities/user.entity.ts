import { Project } from "src/project/entities/project.entity";
import { Entity, Column, PrimaryGeneratedColumn, ManyToMany } from "typeorm";

@Entity()
export class User {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 30 })
    username: string;

    @Column({ type: "varchar", length: 40, unique: true })
    email: string;

    @Column({ type: "varchar" })
    password: string;

    @ManyToMany(() => Project, (project) => project.readUsers)
    readProjects: Project[];

    @ManyToMany(() => Project, (project) => project.writeUsers)
    writeProjects: Project[];
}
