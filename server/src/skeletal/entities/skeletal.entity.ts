import { Slide } from "src/slide/entities/slide.entity";
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    Index,
    JoinColumn,
} from "typeorm";

@Entity()
export class Skeletal {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    slideId: string;

    @ManyToOne(() => Slide, (slide) => slide.skeletals, {
        onDelete: "CASCADE",
    })
    @JoinColumn({ name: "slideId" })
    slide: Slide;

    @Column({ type: "float" })
    x_pos: number;

    @Column({ type: "float" })
    y_pos: number;

    @Column({
        type: "uuid",
        array: true,
        nullable: true,
        default: null,
    })
    key_points: string[] | null;

    @Column({ type: "varchar" })
    color: string;

    @Column({ type: "varchar" })
    category: string;
}
