import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    Index,
    JoinColumn,
    OneToMany,
} from "typeorm";
import { Project } from "src/project/entities/project.entity";
import { Comment } from "src/comment/entities/comment.entity";

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

    @OneToMany(() => Comment, (comment) => comment.slide, {
        cascade: true,
    })
    comments: Comment[];
}
