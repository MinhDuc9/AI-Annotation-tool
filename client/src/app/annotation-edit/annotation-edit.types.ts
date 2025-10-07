/**
 * Shared type definitions for the annotation edit feature.
 * Extracted from the main component to make the codebase easier to navigate.
 */

export type Id = number;

export interface LabelDef {
    id: string;
    name: string;
}

export type SlideMeta = { id: string; index: number };

export type LabelChip = {
    id: Id;
    labelId: string;
    labelName: string;
    color: string;
    left: number;
    top: number;
    maxWidth: number;
};

export interface BoxAnn {
    id: Id;
    x: number;
    y: number;
    w: number;
    h: number;
    labelId: string;
    color: string;
    isLocked?: boolean;
    isPending?: boolean;
}

export type Vis = 0 | 1 | 2;

export interface Keypoint {
    id: string;
    x: number;
    y: number;
    v: Vis;
    labelId: string;
    isPending?: boolean;
}

export interface SkeletonAnn {
    id: Id;
    points: Record<string, Keypoint>;
    edges: [string, string][];
    labelId: string;
    color: string;
}

export type PendingBoxSnapshot = {
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    labelId: string;
    createdAt: number;
};

export type PendingPointSnapshot = {
    skId: number;
    pid: string;
    x: number;
    y: number;
    color: string;
    labelId: string;
    createdAt: number;
};

export type ToolKind = 'select' | 'box' | 'skeleton' | 'stagePan';

export type Selection =
    | { type: null; id: null }
    | { type: 'box'; id: Id }
    | { type: 'skeleton'; id: Id }
    | { type: 'point'; id: Id; pid: string };

export interface ToolCtx {
    boxes: BoxAnn[];
    skeletons: SkeletonAnn[];
    selection: Selection;
    screenToImage(x: number, y: number): { x: number; y: number };
    clampToImage(pt: { x: number; y: number }): { x: number; y: number };
    activeLabelId: string;
    activeColor: string;
    requestPaint(): void;
}

export interface Tool {
    kind: ToolKind;
    onDown(e: PointerEvent, ctx: ToolCtx): void;
    onMove(e: PointerEvent, ctx: ToolCtx): void;
    onUp(e: PointerEvent, ctx: ToolCtx): void;
    drawOverlay?(g: CanvasRenderingContext2D, ctx: ToolCtx): void;
}
