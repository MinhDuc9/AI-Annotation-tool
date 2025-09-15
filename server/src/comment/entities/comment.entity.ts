import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    Index,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from "typeorm";
import { Slide } from "src/slide/entities/slide.entity";

@Entity()
export class Comment {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    slideId: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "text" })
    content: string;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt: Date;

    @ManyToOne(() => Slide, (slide) => slide.comments, {
        onDelete: "CASCADE",
    })
    @JoinColumn({ name: "slideId" })
    slide: Slide;
}