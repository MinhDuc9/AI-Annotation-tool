import { DecimalPipe } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, Injector, ViewChild, effect, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';

/* ------------ Data models (image space) ------------ */
export type Id = number;
export interface LabelDef { id: string; name: string; color?: string; }

export interface BoxAnn {
  id: Id;
  x: number; y: number; w: number; h: number;
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

/* ------------ View transform ------------ */
interface ViewState {
  scale: number;
  panX: number;
  panY: number;
  mat: DOMMatrix;
  inv: DOMMatrix;
}

/* ------------ Tools ------------ */
type ToolKind = 'select' | 'pan' | 'box' | 'skeleton';
interface ToolCtx {
  view: ViewState;
  boxes: BoxAnn[];
  skeletons: SkeletonAnn[];
  selection: { type: 'box' | 'skeleton' | null; id: Id | null; };
  activeLabelId: string;
  activeColor: string;
  requestPaint(): void;
  screenToImage(x: number, y: number): {x: number; y: number};
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
  standalone: true,
  templateUrl: './annotation-edit.component.html',
  styleUrls: ['./annotation-edit.component.scss'],
  imports: [MatSidenavModule, MatIconModule, MatSelectModule, DecimalPipe, ],
})
export class AnnotationEditComponent implements AfterViewInit {
  private snack = inject(MatSnackBar);
  private injector = inject(Injector);

  sidenavOpen = true;

  @ViewChild('bgCanvas', { static: true }) bgCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fgCanvas', { static: true }) fgCanvasRef!: ElementRef<HTMLCanvasElement>;

  private img = new Image();
  private imgLoaded = signal(false);
  imageWidth = signal(0);
  imageHeight = signal(0);

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

  private view = signal<ViewState>({
    scale: 1, panX: 0, panY: 0, mat: new DOMMatrix(), inv: new DOMMatrix(),
  });

  // Tools
  private panTool: Tool = this.makePanTool();
  private boxTool: Tool = this.makeBoxTool();
  private selectToolObj: Tool = this.makeSelectTool();
  private skeletonTool: Tool = this.makeSkeletonTool();

  currentTool = signal<Tool>(this.panTool);
  selectTool(kind: ToolKind) {
    switch (kind) {
      case 'pan': this.currentTool.set(this.panTool); break;
      case 'box': this.currentTool.set(this.boxTool); break;
      case 'select': this.currentTool.set(this.selectToolObj); break;
      case 'skeleton': this.currentTool.set(this.skeletonTool); break;
    }
    this.requestPaint();
  }

  labelName = (id: string) => this.labels().find(l => l.id === id)?.name ?? id;
  pointCount = (s: SkeletonAnn) => Object.keys(s.points).length;

  private needsPaint = false;
  requestPaint = () => {
    if (this.needsPaint) return;
    this.needsPaint = true;
    requestAnimationFrame(() => { this.needsPaint = false; this.paint(); });
  };

  ngAfterViewInit() {
    this.resizeToContainer();

    effect(() => {
      void this.boxes(); void this.skeletons(); void this.view(); void this.imgLoaded();
      this.requestPaint();
    }, { allowSignalWrites: true, injector: this.injector });

    this.img.addEventListener('load', () => {
      this.imageWidth.set(this.img.naturalWidth);
      this.imageHeight.set(this.img.naturalHeight);
      this.imgLoaded.set(true);
      this.onFit();
    });

    // Simple hotkeys (optional, feel free to extend)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'v') this.selectTool('select');
      else if (e.key === 'b') this.selectTool('box');
      else if (e.key === 'k') this.selectTool('skeleton');
      else if (e.key === 'h' || e.code === 'Space') this.selectTool('pan');
      else if (e.key === '+') this.zoomBy(1);
      else if (e.key === '-') this.zoomBy(-1);
      else if (e.key.toLowerCase() === 'f') this.onFit();
    }, { passive: true });
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

  /* ---------- Pointer & wheel ---------- */
  onPointerDown(e: PointerEvent) {
    const wrap = (e.currentTarget as HTMLElement);
    wrap.setPointerCapture?.(e.pointerId);
    this.currentTool().onDown(e, this.toolCtx());
  }
  onPointerMove(e: PointerEvent) { this.currentTool().onMove(e, this.toolCtx()); }
  onPointerUp(e: PointerEvent) {
    const wrap = (e.currentTarget as HTMLElement);
    wrap.releasePointerCapture?.(e.pointerId);
    this.currentTool().onUp(e, this.toolCtx());
  }
  onPointerCancel(_: PointerEvent) { /* optional reset */ }

  onWheel(e: WheelEvent) {
    e.preventDefault();
    if (!this.imgLoaded()) return;
    const fg = this.fgCanvasRef.nativeElement;
    const rect = fg.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;

    const v = this.view();
    const sign = e.deltaY > 0 ? -1 : 1;
    const factor = Math.exp(sign * 0.15);

    const before = this.screenToImage(cx, cy);
    const scale = Math.min(40, Math.max(0.05, v.scale * factor));
    const afterMat = new DOMMatrix().translate(v.panX, v.panY).scale(scale);
    const inv = afterMat.inverse();
    const after = this.applyDOMMatrix(inv, cx, cy);

    const panX = v.panX + (after.x - before.x) * scale;
    const panY = v.panY + (after.y - before.y) * scale;

    this.setView({ scale, panX, panY });
  }

  /* ---------- Quick zoom control for rail ---------- */
  zoomBy(dir: 1 | -1) {
    const fg = this.fgCanvasRef.nativeElement;
    const rect = fg.getBoundingClientRect();
    // zoom around center of canvas
    const cx = rect.width / 2, cy = rect.height / 2;
    const fakeEvent = new WheelEvent('wheel', { deltaY: dir < 0 ? 100 : -100, clientX: rect.left + cx, clientY: rect.top + cy });
    this.onWheel(fakeEvent);
  }

  /* ---------- Tools ---------- */
  private makePanTool(): Tool {
    let dragging = false;
    let lastX = 0, lastY = 0;
    return {
      kind: 'pan',
      onDown: (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; },
      onMove: (e) => {
        if (!dragging) return;
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        const v = this.view(); this.setView({ scale: v.scale, panX: v.panX + dx, panY: v.panY + dy });
      },
      onUp: () => { dragging = false; },
    };
  }

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
        const id = this.idSeq++;
        tempId = id;
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
        const x = Math.min(startImg.x, cur.x), y = Math.min(startImg.y, cur.y);
        const w = Math.max(1, Math.abs(cur.x - startImg.x)), h = Math.max(1, Math.abs(cur.y - startImg.y));
        this.boxes.update(list =>
          list.map(bb => bb.id === tempId ? { ...bb, x, y, w, h } : bb)
        );
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
          if (b) this.strokeRect(g, b, '#ffeb3b', 2, [6,4]);
        }
      }
    };
  }

  private makeSkeletonTool(): Tool {
    // Placeholder behavior-extend with keypoints/edges next
    return {
      kind: 'skeleton',
      onDown: (e, ctx) => { this.selectTool('select'); this.currentTool().onDown(e, ctx); },
      onMove: (e, ctx) => this.selectToolObj.onMove(e, ctx),
      onUp: (e, ctx) => this.selectToolObj.onUp(e, ctx),
      drawOverlay: (g, ctx) => this.selectToolObj.drawOverlay?.(g, ctx),
    };
  }

  /* ---------- Painting ---------- */
  private paint() {
    const bg = this.bgCanvasRef.nativeElement;
    const fg = this.fgCanvasRef.nativeElement;
    const gBg = bg.getContext('2d')!;
    const g = fg.getContext('2d')!;
    const v = this.view();

    this.ensureDevicePixels(bg);
    this.ensureDevicePixels(fg);

    // Background
    gBg.setTransform(1,0,0,1,0,0);
    gBg.clearRect(0,0,bg.width,bg.height);
    if (this.imgLoaded()) {
      gBg.setTransform(v.mat);
      gBg.imageSmoothingEnabled = true;
      gBg.drawImage(this.img, 0, 0);
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

    // Overlay
    g.setTransform(1,0,0,1,0,0);
    g.clearRect(0,0,fg.width,fg.height);
    g.setTransform(v.mat);
    g.lineJoin = 'round'; g.lineCap = 'round';

    // Boxes
    for (const b of this.boxes()) {
      this.strokeRect(g, b, b.color, 2);
      this.fillLabel(g, b.x, b.y - 6, this.labelName(b.labelId), b.color);
    }

    // Skeletons (stub)
    for (const s of this.skeletons()) {
      g.strokeStyle = s.color; g.lineWidth = 2;
      for (const [a,b] of s.edges) {
        const pa = s.points[a], pb = s.points[b];
        if (pa && pb) { g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke(); }
      }
      for (const k of Object.values(s.points)) {
        g.fillStyle = s.color;
        g.beginPath(); g.arc(k.x, k.y, 3, 0, Math.PI*2); g.fill();
      }
    }

    this.currentTool().drawOverlay?.(g, this.toolCtx());
  }

  /* ---------- Helpers ---------- */
  private resizeToContainer() {
    const fg = this.fgCanvasRef.nativeElement;
    const bg = this.bgCanvasRef.nativeElement;
    const parent = fg.parentElement!;
    const rect = parent.getBoundingClientRect();
    bg.style.width = fg.style.width = `${rect.width}px`;
    bg.style.height = fg.style.height = `${rect.height}px`;
  }

  private ensureDevicePixels(c: HTMLCanvasElement) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = c.getBoundingClientRect();
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }

  private setView(next: { scale: number; panX: number; panY: number }) {
    const mat = new DOMMatrix().translate(next.panX, next.panY).scale(next.scale);
    const inv = mat.inverse();
    this.view.set({ ...next, mat, inv });
    this.requestPaint();
  }

  onFit() {
    const fg = this.fgCanvasRef.nativeElement;
    const rect = fg.getBoundingClientRect();
    const iw = this.imageWidth(), ih = this.imageHeight();
    if (!iw || !ih) return;
    const scale = Math.min(rect.width / iw, rect.height / ih) * 0.95;
    const panX = (rect.width - iw * scale) / 2;
    const panY = (rect.height - ih * scale) / 2;
    this.setView({ scale, panX, panY });
  }

  private applyDOMMatrix(inv: DOMMatrix, x: number, y: number) {
    const pt = new DOMPoint(x, y).matrixTransform(inv);
    return { x: pt.x, y: pt.y };
  }

  private screenToImage(x: number, y: number) {
    const fg = this.fgCanvasRef.nativeElement;
    const rect = fg.getBoundingClientRect();
    const vx = x - rect.left, vy = y - rect.top;
    const inv = this.view().inv;
    return this.applyDOMMatrix(inv, vx, vy);
  }

  private clampToImage(p: {x:number; y:number}) {
    const iw = this.imageWidth(), ih = this.imageHeight();
    return { x: Math.min(Math.max(0, p.x), Math.max(0, iw)),
             y: Math.min(Math.max(0, p.y), Math.max(0, ih)) };
  }

  private strokeRect(g: CanvasRenderingContext2D, b: BoxAnn, color: string, lw = 2, dash?: number[]) {
    g.save();
    g.lineWidth = lw; g.strokeStyle = color;
    if (dash) g.setLineDash(dash);
    g.strokeRect(b.x, b.y, b.w, b.h);
    g.restore();
  }

  private fillLabel(g: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
    g.save();
    const padX = 4, padY = 2;
    g.font = '12px Inter, system-ui, sans-serif';
    const m = g.measureText(text);
    const w = m.width + padX*2, h = 16;
    g.fillStyle = 'rgba(0,0,0,.6)';
    g.fillRect(x, y - h, w, h);
    g.strokeStyle = color; g.lineWidth = 1;
    g.strokeRect(x + .5, y - h + .5, w - 1, h - 1);
    g.fillStyle = '#fff';
    g.fillText(text, x + padX, y - 4);
    g.restore();
  }

  private toolCtx(): ToolCtx {
    const v = this.view();
    return {
      view: v,
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
