import { DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild,
  effect,
  inject,
  signal,
  Injector,
  OnDestroy,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';

/* ---------------- Data models (image space) ---------------- */
export type Id = number;
export interface LabelDef { id: string; name: string; color?: string; }

export interface BoxAnn {
  id: Id;
  x: number; y: number; w: number; h: number;   // image pixels
  labelId: string;
  color: string;
  isLocked?: boolean;
}

export type Vis = 0 | 1 | 2;
export interface Keypoint { id: string; x: number; y: number; v: Vis; }
export interface SkeletonAnn {
  id: Id;
  points: Record<string, Keypoint>;
  edges: [string, string][];
  labelId: string;
  color: string;
}

/* ---------------- Tools contract ---------------- */
type ToolKind = 'select' | 'box' | 'skeleton' | 'stagePan';
interface ToolCtx {
  boxes: BoxAnn[];
  skeletons: SkeletonAnn[];
  selection: { type: 'box' | 'skeleton' | null; id: Id | null; };
  activeLabelId: string;
  activeColor: string;
  requestPaint(): void;
  screenToImage(clientX: number, clientY: number): {x: number; y: number};
  clampToImage(p: {x:number; y:number}): {x:number; y:number};
}
interface Tool {
  kind: ToolKind;
  onDown(e: PointerEvent, ctx: ToolCtx): void;
  onMove(e: PointerEvent, ctx: ToolCtx): void;
  onUp(e: PointerEvent, ctx: ToolCtx): void;
  drawOverlay?(g: CanvasRenderingContext2D, ctx: ToolCtx): void;
}

@Component({
  selector: 'app-annotation-edit',
  imports: [MatSidenavModule, MatSelectModule, MatIconModule, DecimalPipe],
  templateUrl: './annotation-edit.component.html',
  styleUrls: ['./annotation-edit.component.scss'],
})
export class AnnotationEditComponent implements AfterViewInit, OnDestroy {
  private snack = inject(MatSnackBar);
  private injector = inject(Injector);

  /* ---------- View refs ---------- */
  @ViewChild('bgCanvas',   { static: true }) bgCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fgCanvas',   { static: true }) fgCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('viewport',   { static: true }) viewportRef!: ElementRef<HTMLDivElement>;
  @ViewChild('desk',     { static: true }) deskRef!: ElementRef<HTMLDivElement>;
  @ViewChild('stage',    { static: false, read: ElementRef }) stageRef?: ElementRef<HTMLDivElement>;

  /* ---------- Stage (desk) pan + zoom (SCREEN space) ---------- */
  stagePan   = signal<{x:number;y:number}>({ x: 0, y: 0 });
  stageScale = signal<number>(1);

  private stageDragging = false;
  private stageLast = { x: 0, y: 0 };
  private spaceHeld = false;

  // Stage pointer handlers (wired on the .stage element in HTML)
  onStagePointerDown(e: PointerEvent) {
    // Middle mouse OR Space+drag to pan the whole desk
    if (e.button === 1 || this.spaceHeld) {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      this.stageDragging = true;
      this.stageLast = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  }
  onStagePointerMove(e: PointerEvent) {
    if (!this.stageDragging) return;
    const dx = e.clientX - this.stageLast.x;
    const dy = e.clientY - this.stageLast.y;
    this.stageLast = { x: e.clientX, y: e.clientY };
    const p = this.stagePan();
    this.stagePan.set({ x: p.x + dx, y: p.y + dy });
  }
  onStagePointerUp(e: PointerEvent) {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    this.stageDragging = false;
  }

  // Stage wheel zoom (cursor-anchored)
  onStageWheel(e: WheelEvent) {
    e.preventDefault();
    const stageEl = this.viewportRef.nativeElement.closest('.stage') as HTMLElement;
    if (!stageEl) return;

    const rect = stageEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const s = this.stageScale();
    const factor = Math.exp((e.deltaY > 0 ? -1 : 1) * 0.15); // zoom speed
    const newS = Math.min(20, Math.max(0.05, s * factor));

    // Keep (cx,cy) anchored while scaling: pan' = c - (c - pan) * (s'/s)
    const pan = this.stagePan();
    const k = newS / s;
    const newPanX = cx - (cx - pan.x) * k;
    const newPanY = cy - (cy - pan.y) * k;

    this.stageScale.set(newS);
    this.stagePan.set({ x: newPanX, y: newPanY });
  }

  // Allow Space to pan the desk even when starting on the canvas
  private onKeyDown = (e: KeyboardEvent) => { if (e.code === 'Space') { this.spaceHeld = true; e.preventDefault(); return; } 
  if (e.key.toLowerCase() === 'h') { this.selectTool('stagePan'); }};
  private onKeyUp   = (e: KeyboardEvent) => { if (e.code === 'Space') { this.spaceHeld = false; } };
  

  // Helpers to initiate/continue stage pan from the canvas handlers
  private beginStagePan(fromEl: EventTarget, e: PointerEvent) {
    (fromEl as HTMLElement).setPointerCapture?.(e.pointerId);
    this.stageDragging = true;
    this.stageLast = { x: e.clientX, y: e.clientY };
  }
  private moveStagePan(e: PointerEvent) {
    const dx = e.clientX - this.stageLast.x;
    const dy = e.clientY - this.stageLast.y;
    this.stageLast = { x: e.clientX, y: e.clientY };
    const p = this.stagePan();
    this.stagePan.set({ x: p.x + dx, y: p.y + dy });
  }

  /* ---------- Image & canvas (IMAGE fixed inside CANVAS) ---------- */
  private img = new Image();
  private imgLoaded = signal(false);
  imageWidth  = signal(0);
  imageHeight = signal(0);

  // Canvas viewport size equals image size if image < cap; otherwise capped (Photopea-like)
  canvasSize = signal<{ w: number; h: number }>({ w: 960, h: 600 });

  private ro?: ResizeObserver;

  /* ---------- Data ---------- */
  labels = signal<LabelDef[]>([
    { id: 'bird', name: 'Bird', color: '#ff8c00' },
    { id: 'wing', name: 'Wing', color: '#00d7ff' },
    { id: 'head', name: 'Head', color: '#8bc34a' },
  ]);
  activeLabelId = signal<string>('bird');
  activeColor   = signal<string>('#ff8c00');

  boxes = signal<BoxAnn[]>([]);
  skeletons = signal<SkeletonAnn[]>([]);
  private idSeq = 1;

  selection = signal<{ type: 'box' | 'skeleton' | null; id: Id | null }>({ type: null, id: null });

  sidenavOpen = true;

  /* ---------- Tools ---------- */
  private boxTool: Tool      = this.makeBoxTool();
  private selectToolObj: Tool = this.makeSelectTool();
  private skeletonTool: Tool  = this.makeSkeletonTool();
  private stagePanTool: Tool   = this.makeStagePanTool();


  currentTool = signal<Tool>(this.selectToolObj);
selectTool(kind: ToolKind) {
  this.currentTool.set(
    kind === 'box'       ? this.boxTool :
    kind === 'skeleton'  ? this.skeletonTool :
    kind === 'stagePan'  ? this.stagePanTool :
                           this.selectToolObj
  );
  this.requestPaint();
}


  labelName = (id: string) => this.labels().find(l => l.id === id)?.name ?? id;
  pointCount = (s: SkeletonAnn) => Object.keys(s.points).length;

  /* ---------- Paint scheduling ---------- */
  private needsPaint = false;
  requestPaint = () => {
    if (this.needsPaint) return;
    this.needsPaint = true;
    requestAnimationFrame(() => { this.needsPaint = false; this.paint(); });
  };

  /* ---------- Lifecycle ---------- */
  ngAfterViewInit() {
    this.resizeToContainer();

    // ResizeObserver: if the viewport box resizes (its CSS size changes),
    // update canvas pixels and refit the desk so the canvas stays nicely visible.
    this.ro = new ResizeObserver(() => {
  this.resizeToContainer(); // keep canvas pixels crisp
  this.fitDeskToView();     // recenter desk with current gutters
});

const stageEl = this.stageRef?.nativeElement ??
                this.viewportRef.nativeElement.closest('.stage') as HTMLElement;
if (stageEl) this.ro.observe(stageEl);
this.ro.observe(this.viewportRef.nativeElement);


    // Repaint when state changes
    effect(() => {
      void this.boxes(); void this.skeletons();
      void this.canvasSize(); void this.imgLoaded();
      this.requestPaint();
    }, { allowSignalWrites: true, injector: this.injector });

    // Load image
    this.img.addEventListener('load', () => {
      this.imageWidth.set(this.img.naturalWidth);
      this.imageHeight.set(this.img.naturalHeight);
      this.imgLoaded.set(true);

      // Decide the canvas viewport size (image size if below cap; otherwise cap)
      this.fitCanvasToImageOrMax();
      this.resizeToContainer();

      // Fit the whole canvas on screen (stage) - scale & center desk
      requestAnimationFrame(() => this.fitDeskToView());
    });

    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup',   this.onKeyUp,   { passive: true  });
  }

  ngOnDestroy() {
    this.ro?.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup',   this.onKeyUp);
  }

  /* ---------- UI actions ---------- */
  onChooseImage(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    this.img.src = url;
  }

  onClear() {
    this.boxes.set([]); this.skeletons.set([]); this.selection.set({ type: null, id: null });
    this.requestPaint();
  }

  onExport() {
    const payload = {
      image: { width: this.imageWidth(), height: this.imageHeight(), file: this.img.src },
      labels: this.labels(),
      boxes: this.boxes(),
      skeletons: this.skeletons(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = 'annotations.json'; a.href = url; a.click();
    URL.revokeObjectURL(url);
    this.snack.open('Exported annotations.json', undefined, { duration: 1600 });
  }

  isSelected(type: 'box' | 'skeleton', id: Id) {
    const s = this.selection(); return s.type === type && s.id === id;
  }
  selectEntity(type: 'box' | 'skeleton', id: Id) {
    this.selection.set({ type, id }); this.currentTool.set(this.selectToolObj); this.requestPaint();
  }

  onColorInput(e: Event) {
  this.activeColor.set((e.target as HTMLInputElement).value);
}

  /* ---------- Canvas pointer handlers (tools) ---------- */
  onPointerDown(e: PointerEvent) {
    const el = (e.currentTarget as HTMLElement);

    // If middle button OR Space is held -> STAGE PAN even when starting on canvas
    if (e.button === 1 || this.spaceHeld) {
      this.beginStagePan(el, e);
      e.preventDefault();
      return;
    }

    // If Pan tool is active, left-drag pans the desk
  if (this.currentTool().kind === 'stagePan') {
    this.beginStagePan(el, e);
    e.preventDefault();
    return;
  }

    el.setPointerCapture?.(e.pointerId);
    this.currentTool().onDown(e, this.toolCtx());
  }
  onPointerMove(e: PointerEvent) {
    if (this.stageDragging) { this.moveStagePan(e); return; }
    this.currentTool().onMove(e, this.toolCtx());
  }
  onPointerUp(e: PointerEvent) {
    const el = (e.currentTarget as HTMLElement);
    if (this.stageDragging) {
      el.releasePointerCapture?.(e.pointerId);
      this.stageDragging = false;
      return;
    }
    el.releasePointerCapture?.(e.pointerId);
    this.currentTool().onUp(e, this.toolCtx());
  }
  onPointerCancel(_: PointerEvent) {}

  /* ---------- Stage fit (scale+center desk) ---------- */
  /** Make the whole canvas visible on screen by scaling + centering the desk */
  /** Get numeric paddings of the stage element */
private getStagePadding(stageEl: HTMLElement) {
  const cs = getComputedStyle(stageEl);
  const pTop = parseFloat(cs.paddingTop) || 0;
  const pRight = parseFloat(cs.paddingRight) || 0;
  const pBottom = parseFloat(cs.paddingBottom) || 0;
  const pLeft = parseFloat(cs.paddingLeft) || 0;
  return { pTop, pRight, pBottom, pLeft };
}

/** Fit the whole canvas into the stage's inner box (centered, with gutters) */
private fitDeskToView() {
  const stageEl = (this.stageRef?.nativeElement ??
                   this.viewportRef.nativeElement.closest('.stage')) as HTMLElement | null;
  if (!stageEl) return;

  const rect = stageEl.getBoundingClientRect();
  const { pTop, pRight, pBottom, pLeft } = this.getStagePadding(stageEl);

  // Inner content size (usable space inside the gutters)
  const innerW = Math.max(0, rect.width  - pLeft - pRight);
  const innerH = Math.max(0, rect.height - pTop  - pBottom);

  const cw = this.canvasSize().w;
  const ch = this.canvasSize().h;
  if (!cw || !ch || !innerW || !innerH) return;

  // Scale so the canvas fits in the inner box (with a small margin)
  const s = Math.min(innerW / cw, innerH / ch) * 0.95;
  this.stageScale.set(s);

  // Center inside the inner box (pad offsets included)
  const panX = pLeft + (innerW - cw * s) / 2;
  const panY = pTop  + (innerH - ch * s) / 2;

  this.stagePan.set({ x: panX, y: panY });
}

  /* ---------- Canvas size policy (image or capped) ---------- */
  /** Set canvas size to the image if smaller than cap; else use cap box. */
  private fitCanvasToImageOrMax() {
    const MAX_W = 1400;
    const MAX_H = 900;

    const iw = this.imageWidth();
    const ih = this.imageHeight();

    if (!iw || !ih) {
      this.canvasSize.set({ w: MAX_W, h: MAX_H });
      return;
    }

    if (iw <= MAX_W && ih <= MAX_H) {
      this.canvasSize.set({ w: iw, h: ih });
    } else {
      this.canvasSize.set({ w: MAX_W, h: MAX_H });
    }
  }

  /* ---------- Painting (image fixed inside canvas) ---------- */
  private paint() {
    const bg = this.bgCanvasRef.nativeElement;
    const fg = this.fgCanvasRef.nativeElement;
    const gBg = bg.getContext('2d')!;
    const g   = fg.getContext('2d')!;

    // Ensure crisp pixels (using layout size, independent of stage scale)
    this.ensureDevicePixels(bg);
    this.ensureDevicePixels(fg);

    // BACKGROUND: draw image scaled to the canvas pixel size (fixed in the box)
    gBg.setTransform(1,0,0,1,0,0);
    gBg.clearRect(0,0,bg.width,bg.height);

    if (this.imgLoaded()) {
      gBg.imageSmoothingEnabled = true;
      gBg.drawImage(this.img, 0, 0, bg.width, bg.height);
    } else {
      // simple checker
      const size = 16;
      for (let y=0; y<bg.height; y+=size) {
        for (let x=0; x<bg.width; x+=size) {
          gBg.fillStyle = ((x/size + y/size) % 2 === 0) ? '#111' : '#161616';
          gBg.fillRect(x,y,size,size);
        }
      }
    }

    // OVERLAY: draw annotations in image space mapped to canvas pixels
    g.setTransform(1,0,0,1,0,0);
    g.clearRect(0,0,fg.width,fg.height);

    const iw = Math.max(1, this.imageWidth());
    const ih = Math.max(1, this.imageHeight());
    const sx = fg.width  / iw;
    const sy = fg.height / ih;

    // Boxes
    for (const b of this.boxes()) {
      this.strokeRectPx(g, b.x * sx, b.y * sy, b.w * sx, b.h * sy, b.color, 2);
      this.fillLabelPx(g, b.x * sx, b.y * sy - 6, this.labelName(b.labelId), b.color);
    }

    // Skeletons
    for (const s of this.skeletons()) {
      g.strokeStyle = s.color; g.lineWidth = 2; g.lineJoin = 'round'; g.lineCap = 'round';
      for (const [a,b] of s.edges) {
        const pa = s.points[a], pb = s.points[b];
        if (pa && pb) { g.beginPath(); g.moveTo(pa.x * sx, pa.y * sy); g.lineTo(pb.x * sx, pb.y * sy); g.stroke(); }
      }
      for (const k of Object.values(s.points)) {
        g.fillStyle = s.color;
        g.beginPath(); g.arc(k.x * sx, k.y * sy, 3, 0, Math.PI*2); g.fill();
      }
    }

    // Tool overlays (e.g., selection highlight)
    this.currentTool().drawOverlay?.(g, this.toolCtx());
  }

  /* ---------- Helpers ---------- */
  /** Use LAYOUT size (offsetWidth/offsetHeight), not getBoundingClientRect (which includes stage scale) */
  private ensureDevicePixels(c: HTMLCanvasElement) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const wCss = c.offsetWidth;
    const hCss = c.offsetHeight;
    const w = Math.round(wCss * dpr);
    const h = Math.round(hCss * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }

  /** Current viewport (canvas box) rect in client coords (after stage transforms) */
  private viewportRect() {
    return this.fgCanvasRef.nativeElement.getBoundingClientRect();
  }

  /** Keep canvases' CSS size in sync with the viewport box & update pixels */
  private resizeToContainer() {
    const fg = this.fgCanvasRef.nativeElement;
    const bg = this.bgCanvasRef.nativeElement;

    // CSS size controlled by [style.width/height.px] bound to canvasSize()
    // Just ensure device pixels & repaint
    this.ensureDevicePixels(bg);
    this.ensureDevicePixels(fg);
    this.requestPaint();
  }

  /** Map client coordinates to IMAGE pixels (robust against stage scale & pan) */
  private screenToImage(clientX: number, clientY: number) {
    const rect = this.viewportRect(); // transformed canvas rect on screen
    const lx = clientX - rect.left;   // local X inside the canvas box
    const ly = clientY - rect.top;    // local Y inside the canvas box

    // Map local canvas px -> image px
    const iw = this.imageWidth(), ih = this.imageHeight();
    const sx = iw / Math.max(1, rect.width);
    const sy = ih / Math.max(1, rect.height);

    return { x: lx * sx, y: ly * sy };
  }

  private clampToImage(p: {x:number; y:number}) {
    const iw = this.imageWidth(), ih = this.imageHeight();
    return {
      x: Math.min(Math.max(0, p.x), Math.max(0, iw)),
      y: Math.min(Math.max(0, p.y), Math.max(0, ih)),
    };
  }

  private strokeRectPx(
    g: CanvasRenderingContext2D,
    x:number, y:number, w:number, h:number,
    color:string, lw=2, dash?:number[]
  ) {
    g.save();
    g.lineWidth = lw; g.strokeStyle = color;
    if (dash) g.setLineDash(dash);
    g.strokeRect(x, y, w, h);
    g.restore();
  }
  private fillLabelPx(
    g: CanvasRenderingContext2D,
    x:number, y:number, text:string, color:string
  ) {
    g.save();
    g.font = '12px Inter, system-ui, sans-serif';
    const padX = 4, h = 16;
    const m = g.measureText(text); const w = m.width + padX*2;
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y - h, w, h);
    g.strokeStyle = color; g.lineWidth = 1; g.strokeRect(x + .5, y - h + .5, w - 1, h - 1);
    g.fillStyle = '#fff'; g.fillText(text, x + padX, y - 4);
    g.restore();
  }

  /* ---------- Tools ---------- */
  private makeBoxTool(): Tool {
    let creating = false;
    let startImg = { x: 0, y: 0 };
    let tempId: Id | null = null;

    return {
      kind: 'box',
      onDown: (e, ctx) => {
        if (!this.imgLoaded()) return;
        creating = true;
        startImg = ctx.clampToImage(ctx.screenToImage(e.clientX, e.clientY));
        const id = this.idSeq++; tempId = id;
        const newBox: BoxAnn = {
          id,
          x: startImg.x, y: startImg.y, w: 1, h: 1,
          labelId: ctx.activeLabelId, color: ctx.activeColor,
        };
        this.boxes.update(list => [...list, newBox]);
        this.selection.set({ type: 'box', id });
        ctx.requestPaint();
      },
      onMove: (e, ctx) => {
        if (!creating || tempId == null) return;
        const cur = ctx.clampToImage(ctx.screenToImage(e.clientX, e.clientY));
        const x = Math.min(startImg.x, cur.x);
        const y = Math.min(startImg.y, cur.y);
        const w = Math.max(1, Math.abs(cur.x - startImg.x));
        const h = Math.max(1, Math.abs(cur.y - startImg.y));
        this.boxes.update(list => list.map(bb => bb.id === tempId ? { ...bb, x, y, w, h } : bb));
        ctx.requestPaint();
      },
      onUp: (_e, ctx) => { creating = false; tempId = null; ctx.requestPaint(); },
    };
  }

  private makeSelectTool(): Tool {
    return {
      kind: 'select',
      onDown: (e, ctx) => {
        const p = ctx.screenToImage(e.clientX, e.clientY);
        const hitBox = [...ctx.boxes].reverse().find(b =>
          p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
        );
        if (hitBox) { this.selection.set({ type: 'box', id: hitBox.id }); ctx.requestPaint(); return; }
        this.selection.set({ type: null, id: null }); ctx.requestPaint();
      },
      onMove: () => {},
      onUp: () => {},
      drawOverlay: (g, ctx) => {
        const s = this.selection();
        if (s.type === 'box' && s.id != null) {
          const b = ctx.boxes.find(bb => bb.id === s.id);
          if (b) this.strokeRectPx(g, b.x * (g.canvas.width/this.imageWidth()), b.y * (g.canvas.height/this.imageHeight()), b.w * (g.canvas.width/this.imageWidth()), b.h * (g.canvas.height/this.imageHeight()), '#ffeb3b', 2, [6,4]);
        }
      }
    };
  }

  private makeSkeletonTool(): Tool {
    // Placeholder: behaves like select for now. Extend with keypoints later.
    return {
      kind: 'skeleton',
      onDown: (e, ctx) => { this.currentTool.set(this.selectToolObj); this.currentTool().onDown(e, ctx); },
      onMove: (e, ctx) => this.selectToolObj.onMove(e, ctx),
      onUp:   (e, ctx) => this.selectToolObj.onUp(e, ctx),
      drawOverlay: (g, ctx) => this.selectToolObj.drawOverlay?.(g, ctx),
    };
  }

  private makeStagePanTool(): Tool {
  return {
    kind: 'stagePan',
    onDown: (e) => {
      // Left-drag pans the desk
      this.beginStagePan(e.currentTarget as HTMLElement, e);
    },
    onMove: (e) => {
      if (this.stageDragging) this.moveStagePan(e);
    },
    onUp:   (e) => {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      this.stageDragging = false;
    },
  };
}

  stageZoomBy(dir: 1 | -1) {
  const stageEl = this.viewportRef.nativeElement.closest('.stage') as HTMLElement;
  if (!stageEl) return;
  const rect = stageEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top  + rect.height / 2;

  const s = this.stageScale();
  const factor = Math.exp((dir > 0 ? 1 : -1) * 0.15);
  const newS = Math.min(20, Math.max(0.05, s * factor));

  const pan = this.stagePan();
  const k = newS / s;
  this.stageScale.set(newS);
  this.stagePan.set({ x: (cx - (cx - pan.x) * k), y: (cy - (cy - pan.y) * k) });
}

  /* ---------- Tool context ---------- */
  private toolCtx(): ToolCtx {
    return {
      boxes: this.boxes(),
      skeletons: this.skeletons(),
      selection: this.selection(),
      activeLabelId: this.activeLabelId(),
      activeColor: this.activeColor(),
      requestPaint: this.requestPaint,
      screenToImage: (x, y) => this.screenToImage(x, y),
      clampToImage: (p) => this.clampToImage(p),
    };
  }
}
