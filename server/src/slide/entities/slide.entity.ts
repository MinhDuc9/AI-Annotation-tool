import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    Index,
    JoinColumn,
} from "typeorm";
import { Project } from "src/project/entities/project.entity";

@Entity()
export class Slide {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    projectId: string;

    @ManyToOne(() => Project, (project) => project.slides, {
        onDelete: "CASCADE",
    })
    @JoinColumn({ name: "projectId" })
    project: Project;

    @Column({ type: "varchar" })
    imageRoute: string;
}
