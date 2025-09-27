import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    Index,
    JoinColumn,
} from "typeorm";
import { Slide } from "src/slide/entities/slide.entity";

@Entity()
export class BoundingBox {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    slideId: string;

    @ManyToOne(() => Slide, (slide) => slide.boundingBoxes, {
        onDelete: "CASCADE",
    })
    @JoinColumn({ name: "slideId" })
    slide: Slide;

    @Column({ type: "float" })
    x_pos: number;

    @Column({ type: "float" })
    y_pos: number;

    @Column({ type: "float" })
    x_long: number;

    @Column({ type: "float" })
    y_long: number;

    @Column({ type: "varchar", default: "#000000" })
    color: string;

    @Column({ type: "varchar", default: "unknown" })
    category: string;
}
