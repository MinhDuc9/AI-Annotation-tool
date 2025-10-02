import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    Index,
    JoinColumn,
    OneToMany,
} from "typeorm";
import { Project } from "../../project/entities/project.entity";
import { Comment } from "../../comment/entities/comment.entity";
import { Skeletal } from "../../skeletal/entities/skeletal.entity";
import { BoundingBox } from "../../bounding-box/entities/bounding-box.entity";

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

    @OneToMany(() => BoundingBox, (boundingBox) => boundingBox.slide, {
        cascade: true,
    })
    boundingBoxes: BoundingBox[];

    @OneToMany(() => Skeletal, (skeletal) => skeletal.slide, {
        cascade: true,
    })
    skeletals: Skeletal[];
}
