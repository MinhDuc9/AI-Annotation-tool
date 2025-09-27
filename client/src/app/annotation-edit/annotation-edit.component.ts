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
import { CommonModule } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { CommentModel, slideCommentDTO, SlideService } from '../services/slide.service';
import { SocketCommentDTO, SocketCommentDeletedDTO, SocketService } from '../services/socket.service';
import { AuthService } from '../services/Auth.service';
import { Observable } from 'rxjs';

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
  standalone: true,
  imports: [
    CommonModule,
    MatSidenavModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatOptionModule,
    MatTooltipModule,
    MatTabsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
  ],
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
  @ViewChild('stage',      { static: false }) stageRef?: ElementRef<HTMLDivElement>;
  @ViewChild('labelLayer', { static: true }) labelLayerRef!: ElementRef<HTMLDivElement>;

  /* ---------- Stage (desk) pan + zoom (SCREEN space) ---------- */
  stagePan   = signal<{x:number;y:number}>({ x: 0, y: 0 });
  stageScale = signal<number>(1);

  private stageDragging = false;
  private stageLast = { x: 0, y: 0 };
  private spaceHeld = false;

  onStagePointerDown(e: PointerEvent) {
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
    this.updateScreenLabels();
  }
  onStagePointerUp(e: PointerEvent) {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    this.stageDragging = false;
  }

  onStageWheel(e: WheelEvent) {
    e.preventDefault();
    const stageEl = this.stageRef?.nativeElement ?? this.viewportRef.nativeElement.closest('.stage') as HTMLElement;
    if (!stageEl) return;

    const rect = stageEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const s = this.stageScale();
    const factor = Math.exp((e.deltaY > 0 ? -1 : 1) * 0.15);
    const newS = Math.min(20, Math.max(0.05, s * factor));

    const pan = this.stagePan();
    const k = newS / s;
    const newPanX = cx - (cx - pan.x) * k;
    const newPanY = cy - (cy - pan.y) * k;

    this.stageScale.set(newS);
    this.stagePan.set({ x: newPanX, y: newPanY });
    this.updateScreenLabels();
  }

  stageZoomBy(dir: 1 | -1) {
    const stageEl = this.stageRef?.nativeElement ?? this.viewportRef.nativeElement.closest('.stage') as HTMLElement;
    if (!stageEl) return;
    const rect = stageEl.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;

    const s = this.stageScale();
    const factor = Math.exp((dir > 0 ? 1 : -1) * 0.15);
    const newS = Math.min(20, Math.max(0.05, s * factor));

    const pan = this.stagePan();
    const k = newS / s;
    const newPanX = cx - (cx - pan.x) * k;
    const newPanY = cy - (cy - pan.y) * k;

    this.stageScale.set(newS);
    this.stagePan.set({ x: newPanX, y: newPanY });
    this.updateScreenLabels();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space') { this.spaceHeld = true; e.preventDefault(); return; }
    const k = e.key.toLowerCase();
    if (k === 'h') this.selectTool('stagePan');
    if (k === 'v') this.selectTool('select');
    if (k === 'b') this.selectTool('box');
    if (k === 'k') this.selectTool('skeleton');
  };
  private onKeyUp   = (e: KeyboardEvent) => { if (e.code === 'Space') this.spaceHeld = false; };

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

  /* ---------- Image & canvas ---------- */
  private img = new Image();
  private imgLoaded = signal(false);
  imageWidth  = signal(0);
  imageHeight = signal(0);

  canvasSize = signal<{ w: number; h: number }>({ w: 960, h: 600 });
  private ro?: ResizeObserver;

  /* ---------- Data ---------- */
  labels = signal<LabelDef[]>([
    { id: 'bird', name: 'Bird', color: '#ff8c00' },
    { id: 'wing', name: 'Wing', color: '#00d7ff' },
    { id: 'head', name: 'Head', color: '#8bc34a' },
  ]);
  activeLabelId = signal<string>('bird');     // new boxes
  activeColor   = signal<string>('#ff8c00');  // new boxes

  boxes = signal<BoxAnn[]>([]);
  skeletons = signal<SkeletonAnn[]>([]);
  private idSeq = 1;

  selection = signal<{ type: 'box' | 'skeleton' | null; id: Id | null }>({ type: null, id: null });
  sidenavOpen = true;

  /* ---------- Screen-space label chips ---------- */
  screenLabels = signal<Array<{
    id: Id; labelId: string; labelName: string; color: string;
    left: number; top: number; maxWidth: number;
  }>>([]);

  /* ---------- Tools ---------- */
  private boxTool: Tool        = this.makeBoxTool();
  private selectToolObj: Tool  = this.makeSelectTool();
  private skeletonTool: Tool   = this.makeSkeletonTool();
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

    this.ro = new ResizeObserver(() => {
      this.resizeToContainer();
      this.fitDeskToView();
      this.updateScreenLabels();
    });
    const stageEl = this.stageRef?.nativeElement ?? this.viewportRef.nativeElement.closest('.stage') as HTMLElement;
    if (stageEl) this.ro.observe(stageEl);
    this.ro.observe(this.viewportRef.nativeElement);

    effect(() => {
      void this.boxes(); void this.skeletons();
      void this.canvasSize(); void this.imgLoaded();
      void this.stagePan(); void this.stageScale();
      this.requestPaint();
      this.updateScreenLabels();
    }, { allowSignalWrites: true, injector: this.injector });

    this.img.addEventListener('load', () => {
      this.imageWidth.set(this.img.naturalWidth);
      this.imageHeight.set(this.img.naturalHeight);
      this.imgLoaded.set(true);

      this.fitCanvasToImageOrMax();
      this.resizeToContainer();
      requestAnimationFrame(() => { this.fitDeskToView(); this.updateScreenLabels(); });
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
    this.requestPaint(); this.updateScreenLabels();
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

  onActiveColorInput(e: Event) {
    const value = (e.target as HTMLInputElement)?.value ?? this.activeColor();
    this.activeColor.set(value);
  }

  /* ---------- Selected box sidebar bindings ---------- */
  selectedBox(): BoxAnn | null {
    const s = this.selection();
    if (s.type !== 'box' || s.id == null) return null;
    return this.boxes().find(b => b.id === s.id) ?? null;
  }
  selectedBoxLabelId() { return this.selectedBox()?.labelId ?? this.activeLabelId(); }
  selectedBoxColor()   { return this.selectedBox()?.color   ?? this.activeColor(); }

  onSelectedLabelChange(newId: string) {
    const s = this.selection();
    if (s.type !== 'box' || s.id == null) return;
    this.boxes.update(arr => arr.map(b => b.id === s.id ? { ...b, labelId: newId } : b));
    this.requestPaint(); this.updateScreenLabels();
  }
  onSelectedColorInput(e: Event) {
    const value = (e.target as HTMLInputElement)?.value;
    const s = this.selection();
    if (!value || s.type !== 'box' || s.id == null) return;
    this.boxes.update(arr => arr.map(b => b.id === s.id ? { ...b, color: value } : b));
    this.requestPaint(); this.updateScreenLabels();
  }

  isSelected(type: 'box' | 'skeleton', id: Id) {
    const s = this.selection(); return s.type === type && s.id === id;
  }
  selectEntity(type: 'box' | 'skeleton', id: Id) {
    this.selection.set({ type, id }); this.currentTool.set(this.selectToolObj); this.requestPaint();
  }

  /* ---------- Canvas pointer handlers ---------- */
  onPointerDown(e: PointerEvent) {
    const el = (e.currentTarget as HTMLElement);

    if (e.button === 1 || this.spaceHeld) {
      this.beginStagePan(el, e);
      e.preventDefault();
      return;
    }
    if (this.currentTool().kind === 'stagePan') {
      this.beginStagePan(el, e);
      e.preventDefault();
      return;
    }

    el.setPointerCapture?.(e.pointerId);
    this.currentTool().onDown(e, this.toolCtx());
  }
  onPointerMove(e: PointerEvent) {
    if (this.stageDragging) { this.moveStagePan(e); this.updateScreenLabels(); return; }
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

  /* ---------- Fit desk ---------- */
  private getStagePadding(stageEl: HTMLElement) {
    const cs = getComputedStyle(stageEl);
    const pTop = parseFloat(cs.paddingTop) || 0;
    const pRight = parseFloat(cs.paddingRight) || 0;
    const pBottom = parseFloat(cs.paddingBottom) || 0;
    const pLeft = parseFloat(cs.paddingLeft) || 0;
    return { pTop, pRight, pBottom, pLeft };
  }
  private fitDeskToView() {
    const stageEl = (this.stageRef?.nativeElement ??
      this.viewportRef.nativeElement.closest('.stage')) as HTMLElement | null;
    if (!stageEl) return;

    const rect = stageEl.getBoundingClientRect();
    const { pTop, pRight, pBottom, pLeft } = this.getStagePadding(stageEl);

    const innerW = Math.max(0, rect.width  - pLeft - pRight);
    const innerH = Math.max(0, rect.height - pTop  - pBottom);
    const cw = this.canvasSize().w, ch = this.canvasSize().h;
    if (!cw || !ch || !innerW || !innerH) return;

    const s = Math.min(innerW / cw, innerH / ch) * 0.95;
    this.stageScale.set(s);

    const panX = pLeft + (innerW - cw * s) / 2;
    const panY = pTop  + (innerH - ch * s) / 2;
    this.stagePan.set({ x: panX, y: panY });
  }

  /* ---------- Canvas sizing ---------- */
  private fitCanvasToImageOrMax() {
    const MAX_W = 1400;
    const MAX_H = 900;

    const iw = this.imageWidth();
    const ih = this.imageHeight();

    if (!iw || !ih) { this.canvasSize.set({ w: MAX_W, h: MAX_H }); return; }

    if (iw <= MAX_W && ih <= MAX_H) {
      this.canvasSize.set({ w: iw, h: ih });
    } else {
      this.canvasSize.set({ w: MAX_W, h: MAX_H });
    }
  }

  /* ---------- Painting ---------- */
  private paint() {
    const bg = this.bgCanvasRef.nativeElement;
    const fg = this.fgCanvasRef.nativeElement;
    const gBg = bg.getContext('2d')!;
    const g   = fg.getContext('2d')!;

    // Ensure crisp pixels
    this.ensureDevicePixels(bg);
    this.ensureDevicePixels(fg);

    // BACKGROUND image
    gBg.setTransform(1,0,0,1,0,0);
    gBg.clearRect(0,0,bg.width,bg.height);
    if (this.imgLoaded()) {
      gBg.imageSmoothingEnabled = true;
      gBg.drawImage(this.img, 0, 0, bg.width, bg.height);
    } else {
      const size = 16;
      for (let y=0; y<bg.height; y+=size) for (let x=0; x<bg.width; x+=size) {
        gBg.fillStyle = ((x/size + y/size) % 2 === 0) ? '#111' : '#161616';
        gBg.fillRect(x,y,size,size);
      }
    }

    // OVERLAY in image space
    g.setTransform(1,0,0,1,0,0);
    g.clearRect(0,0,fg.width,fg.height);

    const iw = Math.max(1, this.imageWidth());
    const ih = Math.max(1, this.imageHeight());
    const sx = fg.width  / iw;
    const sy = fg.height / ih;

    // Stable stroke & handle size (~2px stroke, ~6px handles on screen)
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const s   = this.stageScale();
    const cssStroke = 2, cssHandle = 6;
    const lw = Math.max(1, Math.round(cssStroke * dpr / Math.max(0.5, s)));
    const handleR = Math.max(3, Math.round(cssHandle * dpr / Math.max(0.5, s)));

    for (const b of this.boxes()) {
      g.lineWidth = lw;
      g.strokeStyle = b.color;
      g.strokeRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy);
    }

    // Draw resize handles for selected box
    const sel = this.selectedBox();
    if (sel) {
      const corners = this.getBoxCornerCanvasPoints(sel, sx, sy);
      g.fillStyle = '#fff';
      g.strokeStyle = sel.color;
      for (const c of corners) {
        g.beginPath(); g.arc(c.x, c.y, handleR, 0, Math.PI * 2); g.fill();
        g.stroke();
      }
    }

    this.currentTool().drawOverlay?.(g, this.toolCtx());
    this.updateScreenLabels();
  }

  /* ---------- Helpers ---------- */
  private ensureDevicePixels(c: HTMLCanvasElement) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const wCss = c.offsetWidth;
    const hCss = c.offsetHeight;
    const w = Math.round(wCss * dpr);
    const h = Math.round(hCss * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  private viewportRect() { return this.fgCanvasRef.nativeElement.getBoundingClientRect(); }
  private resizeToContainer() { this.ensureDevicePixels(this.bgCanvasRef.nativeElement); this.ensureDevicePixels(this.fgCanvasRef.nativeElement); this.requestPaint(); }

  /** Client → IMAGE px */
  private screenToImage(clientX: number, clientY: number) {
    const rect = this.viewportRect();
    const lx = clientX - rect.left;
    const ly = clientY - rect.top;
    const iw = this.imageWidth(), ih = this.imageHeight();
    const sx = iw / Math.max(1, rect.width);
    const sy = ih / Math.max(1, rect.height);
    return { x: lx * sx, y: ly * sy };
  }
  private clampToImage(p: {x:number; y:number}) {
    const iw = this.imageWidth(), ih = this.imageHeight();
    return { x: Math.min(Math.max(0, p.x), Math.max(0, iw)), y: Math.min(Math.max(0, p.y), Math.max(0, ih)) };
  }

  private updateScreenLabels() {
    const stageEl = this.stageRef?.nativeElement ?? this.viewportRef.nativeElement.closest('.stage') as HTMLElement;
    if (!stageEl || !this.imgLoaded()) { this.screenLabels.set([]); return; }

    const stageRect  = stageEl.getBoundingClientRect();
    const canvasRect = this.fgCanvasRef.nativeElement.getBoundingClientRect();
    const layerRect  = this.labelLayerRef.nativeElement.getBoundingClientRect();
    const iw = this.imageWidth(), ih = this.imageHeight();
    const sx = canvasRect.width  / Math.max(1, iw);
    const sy = canvasRect.height / Math.max(1, ih);

    const margin = 6, chipH = 20, chipW = 200;

    const result = this.boxes().map(b => {
      const bx = canvasRect.left + b.x * sx;
      const by = canvasRect.top  + b.y * sy;
      const bw = b.w * sx, bh = b.h * sy;

      let L = bx, T = by - chipH - margin;            // above top-left
      if (T < stageRect.top + 4) T = by + bh + margin; // flip below if hits top
      if (L < stageRect.left + 4) L = stageRect.left + 4;
      const maxLeft = stageRect.right - 4 - chipW;
      if (L > maxLeft) L = maxLeft;

      const left = L - layerRect.left, top = T - layerRect.top;

      return { id: b.id, labelId: b.labelId, labelName: this.labelName(b.labelId), color: b.color, left, top, maxWidth: chipW };
    });

    this.screenLabels.set(result);
  }

  /* ---------- Box math ---------- */
  private getBoxCornerCanvasPoints(b: BoxAnn, sx: number, sy: number) {
    return [
      { x: (b.x)      * sx, y: (b.y)      * sy, key: 'nw' },
      { x: (b.x+b.w)  * sx, y: (b.y)      * sy, key: 'ne' },
      { x: (b.x)      * sx, y: (b.y+b.h)  * sy, key: 'sw' },
      { x: (b.x+b.w)  * sx, y: (b.y+b.h)  * sy, key: 'se' },
    ] as const;
  }
  private hitTestBorder(box: BoxAnn, clientX: number, clientY: number, tolPx = 6): boolean {
    const rect = this.viewportRect();
    const sx = rect.width  / Math.max(1, this.imageWidth());
    const sy = rect.height / Math.max(1, this.imageHeight());
    const x = box.x * sx, y = box.y * sy, w = box.w * sx, h = box.h * sy;

    const cx = clientX - rect.left, cy = clientY - rect.top;
    const onLeft   = Math.abs(cx - x) <= tolPx && cy >= y - tolPx && cy <= y + h + tolPx;
    const onRight  = Math.abs(cx - (x + w)) <= tolPx && cy >= y - tolPx && cy <= y + h + tolPx;
    const onTop    = Math.abs(cy - y) <= tolPx && cx >= x - tolPx && cx <= x + w + tolPx;
    const onBottom = Math.abs(cy - (y + h)) <= tolPx && cx >= x - tolPx && cx <= x + w + tolPx;
    return onLeft || onRight || onTop || onBottom;
  }
  private hitTestCorner(box: BoxAnn, clientX: number, clientY: number, radiusPx = 8): 'nw'|'ne'|'sw'|'se'|null {
    const rect = this.viewportRect();
    const sx = rect.width  / Math.max(1, this.imageWidth());
    const sy = rect.height / Math.max(1, this.imageHeight());
    const corners = this.getBoxCornerCanvasPoints(box, sx, sy);
    const cx = clientX - rect.left, cy = clientY - rect.top;
    for (const c of corners) {
      const dx = cx - c.x, dy = cy - c.y;
      if (dx*dx + dy*dy <= radiusPx*radiusPx) return c.key;
    }
    return null;
  }

  /* ---------- Tools ---------- */
  private makeStagePanTool(): Tool {
    return {
      kind: 'stagePan',
      onDown: (e) => { this.beginStagePan(e.currentTarget as HTMLElement, e); },
      onMove: (e) => { if (this.stageDragging) { this.moveStagePan(e); this.updateScreenLabels(); } },
      onUp:   (e) => { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); this.stageDragging = false; },
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
        const id = this.idSeq++; tempId = id;
        const newBox: BoxAnn = {
          id,
          x: startImg.x, y: startImg.y, w: 1, h: 1,
          labelId: ctx.activeLabelId, color: ctx.activeColor,
        };
        this.boxes.update(list => [...list, newBox]);
        this.selection.set({ type: 'box', id });
        ctx.requestPaint(); this.updateScreenLabels();
      },
      onMove: (e, ctx) => {
        if (!creating || tempId == null) return;
        const cur = ctx.clampToImage(ctx.screenToImage(e.clientX, e.clientY));
        const x = Math.min(startImg.x, cur.x);
        const y = Math.min(startImg.y, cur.y);
        const w = Math.max(1, Math.abs(cur.x - startImg.x));
        const h = Math.max(1, Math.abs(cur.y - startImg.y));
        this.boxes.update(list => list.map(bb => bb.id === tempId ? { ...bb, x, y, w, h } : bb));
        ctx.requestPaint(); this.updateScreenLabels();
      },
      onUp: (_e, ctx) => { creating = false; tempId = null; ctx.requestPaint(); this.updateScreenLabels(); },
    };
  }

  private makeSelectTool(): Tool {
    type Corner = 'nw'|'ne'|'sw'|'se';
    let draggingId: Id | null = null;
    let resizingId: Id | null = null;
    let corner: Corner | null = null;
    let lastImg = { x: 0, y: 0 };

    return {
      kind: 'select',
      onDown: (e, ctx) => {
        const pImg = ctx.screenToImage(e.clientX, e.clientY);
        const boxes = ctx.boxes;

        // Corner handles (resize takes priority)
        const hitCorner = [...boxes].reverse().map(b => ({ b, c: this.hitTestCorner(b, e.clientX, e.clientY) }))
          .find(h => !!h.c);
        if (hitCorner) {
          this.selection.set({ type: 'box', id: hitCorner.b.id });
          resizingId = hitCorner.b.id as Id;
          corner = hitCorner.c as Corner;
          lastImg = pImg;
          ctx.requestPaint(); return;
        }

        // Border-only selection
        const hitBorder = [...boxes].reverse().find(b => this.hitTestBorder(b, e.clientX, e.clientY));
        if (hitBorder) {
          this.selection.set({ type: 'box', id: hitBorder.id });
          ctx.requestPaint(); return;
        }

        // Move only if clicked INSIDE the currently selected box
        const sel = this.selectedBox();
        if (sel && pImg.x>=sel.x && pImg.x<=sel.x+sel.w && pImg.y>=sel.y && pImg.y<=sel.y+sel.h) {
          draggingId = sel.id;
          lastImg = pImg;
          ctx.requestPaint(); return;
        }

        // Otherwise clear selection
        this.selection.set({ type: null, id: null });
        ctx.requestPaint();
      },
      onMove: (e, ctx) => {
        if (draggingId != null) {
          const cur = ctx.screenToImage(e.clientX, e.clientY);
          const dx = cur.x - lastImg.x, dy = cur.y - lastImg.y;
          lastImg = cur;

          this.boxes.update(list => list.map(b => {
            if (b.id !== draggingId) return b;
            let x = b.x + dx, y = b.y + dy;
            x = Math.max(0, Math.min(x, this.imageWidth()  - b.w));
            y = Math.max(0, Math.min(y, this.imageHeight() - b.h));
            return { ...b, x, y };
          }));
          ctx.requestPaint(); this.updateScreenLabels();
          return;
        }

        if (resizingId != null && corner) {
          const cur = ctx.clampToImage(ctx.screenToImage(e.clientX, e.clientY));
          this.boxes.update(list => list.map(b => {
            if (b.id !== resizingId) return b;
            let { x, y, w, h } = b;
            const minW = 4, minH = 4;

            if (corner === 'nw') { const nx = Math.min(x + w - minW, cur.x); const ny = Math.min(y + h - minH, cur.y); w = (x + w) - nx; h = (y + h) - ny; x = nx; y = ny; }
            if (corner === 'ne') { const nx = Math.max(x + minW, cur.x); const ny = Math.min(y + h - minH, cur.y); w = nx - x; y = ny; h = (y + h) - ny; }
            if (corner === 'sw') { const nx = Math.min(x + w - minW, cur.x); const ny = Math.max(y + minH, cur.y); w = (x + w) - nx; x = nx; h = ny - y; }
            if (corner === 'se') { const nx = Math.max(x + minW, cur.x); const ny = Math.max(y + minH, cur.y); w = nx - x; h = ny - y; }

            // Clamp to image
            x = Math.max(0, Math.min(x, this.imageWidth()  - w));
            y = Math.max(0, Math.min(y, this.imageHeight() - h));

            return { ...b, x, y, w, h };
          }));
          ctx.requestPaint(); this.updateScreenLabels();
        }
      },
      onUp: (_e, ctx) => {
        draggingId = null; resizingId = null; corner = null;
        ctx.requestPaint(); this.updateScreenLabels();
      },
      drawOverlay: () => {}
    };
  }

  private makeSkeletonTool(): Tool {
    return {
      kind: 'skeleton',
      onDown: (e, ctx) => { this.currentTool.set(this.selectToolObj); this.currentTool().onDown(e, ctx); },
      onMove: (e, ctx) => this.selectToolObj.onMove(e, ctx),
      onUp:   (e, ctx) => this.selectToolObj.onUp(e, ctx),
      drawOverlay: (g, ctx) => this.selectToolObj.drawOverlay?.(g, ctx),
    };
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

  /* ---------- Comments tab state ---------- */
  private slideSvc = inject(SlideService);
  private socket = inject(SocketService);
  private auth = inject(AuthService);

  currentSlideId = signal<string>('');    // user can paste/set it (project WIP)
  userId = signal<string>((this.auth.getUserId() ?? crypto.randomUUID()).trim());

  comments = signal<CommentModel[]>([]);
  newComment = signal<string>('');
  isConnected = signal<boolean>(false);

  private socketSubs: Array<() => void> = [];
  private pendingOptimistic: Array<{ userId: string; content: string }> = [];
  private uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  onSlideIdInput(e: Event)    { this.currentSlideId.set((e.target as HTMLInputElement).value.trim()); }
  onUserIdInput(e: Event)     { this.userId.set((e.target as HTMLInputElement).value.trim()); }
  onNewCommentInput(e: Event) { this.newComment.set((e.target as HTMLTextAreaElement).value); }

  connectToSlide() {
    const id = this.currentSlideId().trim();
    if (!id) { this.snack.open('Enter a Slide ID first', undefined, { duration: 1500 }); return; }

    this.currentSlideId.set(id);
    this.pendingOptimistic = [];
    this.comments.set([]);

    // Join room
    this.socket.joinSlide(id);
    this.isConnected.set(true);

    // Load existing comments from REST and map to domain model (Date)
    this.slideSvc.getComments(id).subscribe({
      next: (dto) => {
        const mapped = (dto?.comments ?? []).map(this.mapDtoToModel);
        this.comments.set(mapped.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
      },
      error: () => this.snack.open('Failed to load comments', undefined, { duration: 1600 }),
    });

    // Wire live events (dispose any old handlers)
    this.disposeSocketHandlers();
    this.socketSubs = [
      this.observe(this.socket.onCommentCreated(), (c) => this.applyIncomingCreate(c)),
      this.observe(this.socket.onCommentUpdated(), (c) => this.applyIncomingUpdate(c)),
      this.observe(this.socket.onCommentDeleted(), (c) => this.applyIncomingDelete(c)),
      this.observe(this.socket.onError(), (e) => this.snack.open(e.message ?? 'Socket error', undefined, { duration: 1800 })),
    ];
  }

  disconnectFromSlide() {
    this.disposeSocketHandlers();
    this.socket.disconnect();
    this.pendingOptimistic = [];
    this.isConnected.set(false);
  }

  private disposeSocketHandlers() {
    // Each observer returns an unsubscribe fn we stored
    for (const off of this.socketSubs) try { off(); } catch {}
    this.socketSubs = [];
  }

  private observe<T>(obs: Observable<T>, next: (v: T) => void): () => void {
    const sub = obs.subscribe(next);
    return () => sub.unsubscribe();
  }

  private mapDtoToModel = (c: slideCommentDTO): CommentModel => ({
    id: c.id,
    slideId: c.slideId,
    userId: c.userId,
    content: c.content,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
  });

  private mapSocketToModel(c: SocketCommentDTO): CommentModel {
    const created = c.createdAt ? new Date(c.createdAt) : new Date();
    const updated = c.updatedAt ? new Date(c.updatedAt) : created;
    return {
      id: c.id,
      slideId: c.slideId,
      userId: (c.userId ?? '').trim(),
      content: c.content,
      createdAt: Number.isNaN(created.getTime()) ? new Date() : created,
      updatedAt: Number.isNaN(updated.getTime()) ? created : updated,
    };
  }

  private applyIncomingCreate(c: SocketCommentDTO) {
    if (!this.isForCurrentSlide(c.slideId)) return;
    const incoming = this.mapSocketToModel(c);
    let matchedPending = false;
    this.comments.update(arr => {
      const idx = arr.findIndex(x => x.isPending && x.userId === incoming.userId && x.content === incoming.content);
      if (idx !== -1) {
        matchedPending = true;
        const copy = arr.slice();
        copy[idx] = incoming;
        copy.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return copy;
      }
      if (arr.some(x => x.id === incoming.id)) {
        return arr;
      }
      const next = arr.slice();
      next.push(incoming);
      next.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return next;
    });
    if (matchedPending) {
      this.removePendingEntry(incoming.userId, incoming.content);
    }
  }

  private applyIncomingUpdate(c: SocketCommentDTO) {
    if (!this.isForCurrentSlide(c.slideId)) return;
    const incoming = this.mapSocketToModel(c);
    this.comments.update(arr => {
      const idx = arr.findIndex(x => x.id === incoming.id);
      if (idx === -1) return arr;
      const copy = arr.slice();
      copy[idx] = { ...copy[idx], content: incoming.content, updatedAt: incoming.updatedAt, isPending: undefined };
      return copy;
    });
  }


  private applyIncomingDelete(c: SocketCommentDeletedDTO) {
    if (!this.isForCurrentSlide(c.slideId)) return;
    this.comments.update(arr => arr.filter(item => item.id !== c.id));
  }

  private isForCurrentSlide(slideId?: string | null): boolean {
    const current = this.currentSlideId();
    return !!slideId && !!current && slideId === current;
  }

  private removePendingEntry(userId: string, content: string) {
    const normalizedUser = userId.trim();
    const normalizedContent = content.trim();
    const idx = this.pendingOptimistic.findIndex((item) => item.userId === normalizedUser && item.content === normalizedContent);
    if (idx !== -1) {
      this.pendingOptimistic.splice(idx, 1);
    }
  }


  addComment() {
    const slideId = this.currentSlideId().trim();
    if (!slideId) { this.snack.open('Enter a Slide ID first', undefined, { duration: 1500 }); return; }
    this.currentSlideId.set(slideId);

    const content = this.newComment().trim();
    if (!content) return;

    const uid = this.userId().trim();
    if (!uid) { this.snack.open('Provide a user ID', undefined, { duration: 1500 }); return; }
    if (!this.uuidRegex.test(uid)) { this.snack.open('User ID must be a valid UUID', undefined, { duration: 1800 }); return; }
    this.userId.set(uid);

    // optimistic append (so UI feels instant)
    const optimistic: CommentModel = {
      id: crypto.randomUUID(),
      slideId,
      userId: uid,
      content,
      createdAt: new Date(),
      updatedAt: new Date(),
      isPending: true,
    };
    this.comments.update(arr => {
      const next = arr.slice();
      next.push(optimistic);
      next.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return next;
    });
    this.pendingOptimistic.push({ userId: uid, content });

    // emit over socket
    this.socket.createComment(slideId, uid, content);
    this.newComment.set('');
  }

  avatarUrl(userId: string): string {
    // SVG data-URL avatar (initials) so we can use mat-card-image without external calls
    const initial = (userId?.trim()?.[0] ?? '?').toUpperCase();
    const bg = this.hashColor(userId);
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='160'>
         <rect width='100%' height='100%' fill='${bg}'/>
         <text x='50%' y='55%' font-family='Inter,Arial' font-size='72' dominant-baseline='middle' text-anchor='middle' fill='white'>${initial}</text>
       </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  private hashColor(s: string): string {
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    const r = (h >>> 16) & 0xff, g = (h >>> 8) & 0xff, b = h & 0xff;
    // soften
    return `rgb(${128 + (r>>1)}, ${128 + (g>>1)}, ${128 + (b>>1)})`;
  }
}


