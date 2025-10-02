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
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import { CommentModel, slideCommentDTO, SlideService } from '../services/slide.service';
import { SocketCommentDTO, SocketCommentDeletedDTO, SocketService } from '../services/socket.service';
import { AuthService } from '../services/Auth.service';
import { Observable } from 'rxjs';
import { AnnotationTopbarComponent } from '../annotation-topbar/annotation-topbar.component';

/* ---------------- Data models (image space) ---------------- */
export type Id = number;
export interface LabelDef { id: string; name: string; }

// NEW: label chip models (screen-space)
  type LabelChip = {
    id: Id;
    labelId: string;
    labelName: string;
    color: string;   // border color
    left: number;
    top: number;
    maxWidth: number;
  };

export interface BoxAnn {
  id: Id;
  x: number; y: number; w: number; h: number;   // image pixels
  labelId: string;
  color: string;
  isLocked?: boolean;
}

export type Vis = 0 | 1 | 2;

export interface Keypoint {
  id: string;           // unique within its skeleton
  x: number; y: number; // image px
  v: Vis;
  labelId: string;      // per-point label (independent from skeleton)
}

export interface SkeletonAnn {
  id: Id;
  points: Record<string, Keypoint>;
  edges: [string, string][];  // undirected
  labelId: string;            // optional "type", not used for color
  color: string;              // universal color for all bones in this skeleton
}

/* ---------------- Tools contract ---------------- */
type ToolKind = 'select' | 'box' | 'skeleton' | 'stagePan';
type Selection =
  | { type: null; id: null }
  | { type: 'box'; id: Id }
  | { type: 'skeleton'; id: Id }
  | { type: 'point'; id: Id; pid: string }; // skeleton id + point id

interface ToolCtx {
  boxes: BoxAnn[];
  skeletons: SkeletonAnn[];
  selection: Selection;
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
    MatSlideToggleModule,
    AnnotationTopbarComponent
  ],
  templateUrl: './annotation-edit.component.html',
  styleUrls: ['./annotation-edit.component.scss'],
})
export class AnnotationEditComponent implements AfterViewInit, OnDestroy {
  private snack = inject(MatSnackBar);
  private injector = inject(Injector);

  onTopbarUndo() {
    // forward to your annotation history or use service:
    // this.annotationHistoryService.undo();
  }
  onTopbarRedo() {
    // this.annotationHistoryService.redo();
  }

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
  
  isPanMode() { return this.currentTool().kind === 'stagePan' || this.spaceHeld; }
  isPanning() { return this.stageDragging; }

  // NEW: label visibility toggles
  showBoxLabels   = signal<boolean>(true);
  showPointLabels = signal<boolean>(true);

  // Active defaults for creating NEW skeleton annotations
  activeSkelLabelId = signal<string>('bird');     // default label for NEW points
  activeSkelColor   = signal<string>('#00e676');  // default color for NEW skeleton bones


  onStagePointerDown(e: PointerEvent) {
  // start pan if: middle mouse OR spacebar held OR pan tool is active
  const panRequested = e.button === 1 || this.spaceHeld || this.currentTool().kind === 'stagePan';
  if (!panRequested) return;

  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  this.stageDragging = true;
  this.stageLast = { x: e.clientX, y: e.clientY };
  e.preventDefault();
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

    // hotkeys
    if (k === 'h') this.selectTool('stagePan');
    if (k === 'v') this.selectTool('select');
    if (k === 'b') this.selectTool('box');
    if (k === 'k') this.selectTool('skeleton');

    // deletion
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteCurrentSelection();
      e.preventDefault();
    }
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
    { id: 'bird', name: 'Bird' },
    { id: 'wing', name: 'Wing' },
    { id: 'head', name: 'Head' },
  ]);
  activeLabelId = signal<string>('bird');     // new boxes
  activeColor   = signal<string>('#ff8c00');  // new boxes

  boxes = signal<BoxAnn[]>([]);

  skeletons = signal<SkeletonAnn[]>([]);
  private idSeq = 1;
  private pointSeq = 1;

  selection = signal<Selection>({ type: null, id: null });
  sidenavOpen = true;

  /* ---------- Screen-space label chips for BOXES only ---------- */
  boxLabelChips   = signal<LabelChip[]>([]);
  pointLabelChips = signal<LabelChip[]>([]);

  /* ---------- Tools ---------- */
  private boxTool: Tool        = this.makeBoxTool();
  private selectToolObj: Tool  = this.makeSelectTool();     // now supports skeleton + point select/move/delete
  private skeletonTool: Tool   = this.makeSkeletonTool();   // custom behavior per spec
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
  void this.showBoxLabels(); void this.showPointLabels(); // NEW
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

  /* ---------- Selected helpers ---------- */
  selectedBox(): BoxAnn | null {
    const s = this.selection();
    if (s.type !== 'box' || s.id == null) return null;
    return this.boxes().find(b => b.id === s.id) ?? null;
  }

  selectedSkeleton(): SkeletonAnn | null {
    const s = this.selection();
    if (s.type === 'skeleton' && s.id != null) {
      return this.skeletons().find(sk => sk.id === s.id) ?? null;
    }
    if (s.type === 'point' && s.id != null) {
      return this.skeletons().find(sk => sk.id === s.id) ?? null;
    }
    return null;
  }

  selectedPoint(): { sk: SkeletonAnn; kp: Keypoint } | null {
    const s = this.selection();
    if (s.type !== 'point' || s.id == null) return null;
    const sk = this.skeletons().find(x => x.id === s.id);
    if (!sk) return null;
    const kp = sk.points[s.pid];
    return kp ? { sk, kp } : null;
  }

  /* ---------- Sidebar bindings for BOX ---------- */
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

  /* ---------- Sidebar bindings for SKELETON/POINT ---------- */
  skeletonColor(): string {
    return this.selectedSkeleton()?.color ?? '#00e676';
  }
  onSkeletonColorInput(e: Event) {
    const value = (e.target as HTMLInputElement)?.value;
    const s = this.selection();
    if (!value) return;
    if (s.type === 'skeleton' && s.id != null) {
      this.skeletons.update(arr => arr.map(sk => sk.id === s.id ? { ...sk, color: value } : sk));
      this.requestPaint();
    } else if (s.type === 'point' && s.id != null) {
      this.skeletons.update(arr => arr.map(sk => sk.id === s.id ? { ...sk, color: value } : sk));
      this.requestPaint();
    }
  }

  onActiveBoxColorInput(e: Event) {
  this.activeColor.set((e.target as HTMLInputElement)?.value ?? this.activeColor());
}
onActiveBoxLabelChange(newId: string) { this.activeLabelId.set(newId); }

onActiveSkelColorInput(e: Event) {
  this.activeSkelColor.set((e.target as HTMLInputElement)?.value ?? this.activeSkelColor());
}
onActiveSkelLabelChange(newId: string) { this.activeSkelLabelId.set(newId); }


  pointLabelId(): string {
    const sp = this.selectedPoint();
    return sp?.kp.labelId ?? this.activeLabelId();
  }
  onPointLabelChange(newId: string) {
    const s = this.selection();
    if (s.type !== 'point') return;
    this.skeletons.update(arr => arr.map(sk => {
      if (sk.id !== s.id) return sk;
      const kp = sk.points[s.pid];
      if (!kp) return sk;
      return { ...sk, points: { ...sk.points, [s.pid]: { ...kp, labelId: newId } } };
    }));
    this.requestPaint();
  }

  isSelected(type: 'box' | 'skeleton', id: Id) {
    const s = this.selection();
    if (type === 'box') return s.type === 'box' && s.id === id;
    if (type === 'skeleton') return (s.type === 'skeleton' || s.type === 'point') && s.id === id;
    return false;
  }
  selectEntity(type: 'box' | 'skeleton', id: Id) {
    if (type === 'box') this.selection.set({ type: 'box', id });
    else this.selection.set({ type: 'skeleton', id });
    this.currentTool.set(this.selectToolObj);
    this.requestPaint();
  }

  /* ---------- Canvas pointer handlers ---------- */
  onPointerDown(e: PointerEvent) {
    const el = (e.currentTarget as HTMLElement);

    // If pan tool is active (or middle/space), let the stage handler do it
  if (this.currentTool().kind === 'stagePan' || e.button === 1 || this.spaceHeld) {
    // Do nothing here; onStagePointerDown handles the drag
    return;;
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

    // boxes
    for (const b of this.boxes()) {
      g.lineWidth = lw;
      g.strokeStyle = b.color;
      g.strokeRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy);
    }
    // selected box handles
    const selBox = this.selectedBox();
    if (selBox) {
      const corners = this.getBoxCornerCanvasPoints(selBox, sx, sy);
      g.fillStyle = '#fff';
      g.strokeStyle = selBox.color;
      for (const c of corners) {
        g.beginPath(); g.arc(c.x, c.y, handleR, 0, Math.PI * 2); g.fill();
        g.stroke();
      }
    }

    // skeletons: draw bones (lines) then points (circles)
    for (const sk of this.skeletons()) {
      g.lineWidth = lw;
      g.strokeStyle = sk.color;

      // bones
      for (const [a, b] of sk.edges) {
        const pa = sk.points[a], pb = sk.points[b];
        if (!pa || !pb) continue;
        g.beginPath();
        g.moveTo(pa.x * sx, pa.y * sy);
        g.lineTo(pb.x * sx, pb.y * sy);
        g.stroke();
      }

      // points
      for (const kp of Object.values(sk.points)) {
        // point outline in skeleton color; white fill for contrast
        g.beginPath();
        g.fillStyle = '#ffffff';
        g.strokeStyle = sk.color;
        g.arc(kp.x * sx, kp.y * sy, handleR, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }

    // highlight for selected point
    const sp = this.selectedPoint();
    if (sp) {
      g.beginPath();
      g.strokeStyle = '#fff';
      g.lineWidth = Math.max(2, lw + 1);
      g.arc(sp.kp.x * sx, sp.kp.y * sy, handleR + 3, 0, Math.PI * 2);
      g.stroke();

      g.beginPath();
      g.strokeStyle = sp.sk.color;
      g.lineWidth = Math.max(2, lw + 1);
      g.arc(sp.kp.x * sx, sp.kp.y * sy, handleR + 6, 0, Math.PI * 2);
      g.stroke();
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

  /** Client -> IMAGE px */
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
  if (!stageEl || !this.imgLoaded()) { this.boxLabelChips.set([]); this.pointLabelChips.set([]); return; }

  const stageRect  = stageEl.getBoundingClientRect();
  const canvasRect = this.fgCanvasRef.nativeElement.getBoundingClientRect();
  const layerRect  = this.labelLayerRef.nativeElement.getBoundingClientRect();
  const iw = this.imageWidth(), ih = this.imageHeight();
  const sx = canvasRect.width  / Math.max(1, iw);
  const sy = canvasRect.height / Math.max(1, ih);

  const chipH = 20;
  const chipW = 200;
  const margin = 6;

  /* ---- BOX LABELS ---- */
  const boxesOut: LabelChip[] = this.showBoxLabels() ? this.boxes().map(b => {
    const bx = canvasRect.left + b.x * sx;
    const by = canvasRect.top  + b.y * sy;
    const bw = b.w * sx, bh = b.h * sy;

    let L = bx, T = by - chipH - margin;              // above top-left
    if (T < stageRect.top + 4) T = by + bh + margin;  // flip below
    if (L < stageRect.left + 4) L = stageRect.left + 4;
    const maxLeft = stageRect.right - 4 - chipW;
    if (L > maxLeft) L = maxLeft;

    const left = L - layerRect.left, top = T - layerRect.top;

    return {
      id: b.id,
      labelId: b.labelId,
      labelName: this.labelName(b.labelId),
      color: b.color,
      left, top, maxWidth: chipW
    } as LabelChip;
  }) : [];

  /* ---- POINT LABELS ---- */
  const ptsOut: LabelChip[] = [];
  if (this.showPointLabels()) {
    for (const sk of this.skeletons()) {
      for (const kp of Object.values(sk.points)) {
        const px = canvasRect.left + kp.x * sx;
        const py = canvasRect.top  + kp.y * sy;

        let L = px - 4, T = py - chipH - margin;         // above point, slight left
        if (T < stageRect.top + 4) T = py + margin + 8;  // flip below if clipped
        if (L < stageRect.left + 4) L = stageRect.left + 4;
        const maxLeft = stageRect.right - 4 - chipW;
        if (L > maxLeft) L = maxLeft;

        const left = L - layerRect.left, top = T - layerRect.top;

        // border uses skeleton color; swatch uses the point label's color
        ptsOut.push({
          id: sk.id, // use skeleton id for grouping; still unique with position
          labelId: kp.labelId,
          labelName: this.labelName(kp.labelId),
          color: sk.color,
          left, top, maxWidth: chipW
        });
      }
    }
  }

  this.boxLabelChips.set(boxesOut);
  this.pointLabelChips.set(ptsOut);
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

  /* ---------- Skeleton math & hit-tests ---------- */
  private hitRadiusPx = 10;

  private forEachSkeletonPoint<T>(fn: (sk: SkeletonAnn, pid: string, kp: Keypoint) => T | void): void {
    for (const sk of this.skeletons()) {
      for (const [pid, kp] of Object.entries(sk.points)) {
        const r = fn(sk, pid, kp);
        if (r !== undefined) return;
      }
    }
  }

  private hitTestPoint(clientX: number, clientY: number): { skId: Id; pid: string } | null {
    const rect = this.viewportRect();
    const sx = rect.width  / Math.max(1, this.imageWidth());
    const sy = rect.height / Math.max(1, this.imageHeight());
    const cx = clientX - rect.left, cy = clientY - rect.top;

    let found: { skId: Id; pid: string } | null = null;
    this.forEachSkeletonPoint((sk, pid, kp) => {
      const px = kp.x * sx, py = kp.y * sy;
      const dx = cx - px, dy = cy - py;
      if (dx*dx + dy*dy <= this.hitRadiusPx*this.hitRadiusPx) {
        found = { skId: sk.id, pid };
      }
    });
    return found;
  }

  private segmentHit(clientX: number, clientY: number, ax: number, ay: number, bx: number, by: number, tol = 6): boolean {
    // distance from point to segment in screen px
    const px = clientX, py = clientY;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx*dx + dy*dy;
    if (len2 === 0) return Math.hypot(px - ax, py - ay) <= tol;
    let t = ((px - ax)*dx + (py - ay)*dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const mx = ax + t*dx, my = ay + t*dy;
    return Math.hypot(px - mx, py - my) <= tol;
  }

  private hitTestBone(clientX: number, clientY: number): { skId: Id } | null {
    const rect = this.viewportRect();
    const sx = rect.width  / Math.max(1, this.imageWidth());
    const sy = rect.height / Math.max(1, this.imageHeight());
    const cx = clientX - rect.left, cy = clientY - rect.top;

    for (const sk of this.skeletons()) {
      for (const [a, b] of sk.edges) {
        const pa = sk.points[a], pb = sk.points[b];
        if (!pa || !pb) continue;
        const ax = pa.x * sx, ay = pa.y * sy, bx = pb.x * sx, by = pb.y * sy;
        if (this.segmentHit(cx, cy, ax, ay, bx, by, 6)) return { skId: sk.id };
      }
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

  /** Select tool with skeleton support:
   * - Click bone -> select skeleton (Skeleton Select)
   * - Click point -> select point (Point Select)
   * - Drag skeleton -> moves all points
   * - Drag point -> moves only that point (bones update automatically)
   */
  private makeSelectTool(): Tool {
    type Corner = 'nw'|'ne'|'sw'|'se';
    let draggingBoxId: Id | null = null;
    let resizingId: Id | null = null;
    let corner: Corner | null = null;

    let draggingPoint: { skId: Id; pid: string } | null = null;
    let draggingSkeletonId: Id | null = null;

    let lastImg = { x: 0, y: 0 };

    return {
      kind: 'select',
      onDown: (e, ctx) => {
        const pImg = ctx.screenToImage(e.clientX, e.clientY);
        const boxes = ctx.boxes;

        // Skeleton: test points first (Point Select)
        const ptHit = this.hitTestPoint(e.clientX, e.clientY);
        if (ptHit) {
          this.selection.set({ type: 'point', id: ptHit.skId, pid: ptHit.pid });
          draggingPoint = ptHit;
          lastImg = pImg;
          ctx.requestPaint();
          return;
        }

        // Skeleton: test bones (Skeleton Select)
        const boneHit = this.hitTestBone(e.clientX, e.clientY);
        if (boneHit) {
          this.selection.set({ type: 'skeleton', id: boneHit.skId });
          draggingSkeletonId = boneHit.skId;
          lastImg = pImg;
          ctx.requestPaint();
          return;
        }

        // ----- Boxes (keep previous behavior) -----
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
          draggingBoxId = sel.id;
          lastImg = pImg;
          ctx.requestPaint(); return;
        }

        // Otherwise clear selection
        this.selection.set({ type: null, id: null });
        ctx.requestPaint();
      },

      onMove: (e, ctx) => {
        const cur = ctx.screenToImage(e.clientX, e.clientY);

        // Move point
        if (draggingPoint) {
          const dx = cur.x - lastImg.x, dy = cur.y - lastImg.y;
          lastImg = cur;

          this.skeletons.update(arr => arr.map(sk => {
            if (sk.id !== draggingPoint!.skId) return sk;
            const kp = sk.points[draggingPoint!.pid];
            if (!kp) return sk;
            let nx = kp.x + dx, ny = kp.y + dy;
            const clamped = this.clampToImage({ x: nx, y: ny });
            nx = clamped.x; ny = clamped.y;
            return { ...sk, points: { ...sk.points, [draggingPoint!.pid]: { ...kp, x: nx, y: ny } } };
          }));
          ctx.requestPaint();
          return;
        }

        // Move skeleton (all points)
        if (draggingSkeletonId != null) {
          const dx = cur.x - lastImg.x, dy = cur.y - lastImg.y;
          lastImg = cur;

          this.skeletons.update(arr => arr.map(sk => {
            if (sk.id !== draggingSkeletonId) return sk;
            const moved: Record<string, Keypoint> = {};
            for (const [pid, kp] of Object.entries(sk.points)) {
              const clamped = this.clampToImage({ x: kp.x + dx, y: kp.y + dy });
              moved[pid] = { ...kp, x: clamped.x, y: clamped.y };
            }
            return { ...sk, points: moved };
          }));
          ctx.requestPaint();
          return;
        }

        // ----- Boxes -----
        if (draggingBoxId != null) {
          const dx = cur.x - lastImg.x, dy = cur.y - lastImg.y;
          lastImg = cur;

          this.boxes.update(list => list.map(b => {
            if (b.id !== draggingBoxId) return b;
            let x = b.x + dx, y = b.y + dy;
            x = Math.max(0, Math.min(x, this.imageWidth()  - b.w));
            y = Math.max(0, Math.min(y, this.imageHeight() - b.h));
            return { ...b, x, y };
          }));
          ctx.requestPaint(); this.updateScreenLabels();
          return;
        }

        if (resizingId != null && corner) {
          const curClamp = ctx.clampToImage(cur);
          this.boxes.update(list => list.map(b => {
            if (b.id !== resizingId) return b;
            let { x, y, w, h } = b;
            const minW = 4, minH = 4;

            if (corner === 'nw') { const nx = Math.min(x + w - minW, curClamp.x); const ny = Math.min(y + h - minH, curClamp.y); w = (x + w) - nx; h = (y + h) - ny; x = nx; y = ny; }
            if (corner === 'ne') { const nx = Math.max(x + minW, curClamp.x); const ny = Math.min(y + h - minH, curClamp.y); w = nx - x; y = ny; h = (y + h) - ny; }
            if (corner === 'sw') { const nx = Math.min(x + w - minW, curClamp.x); const ny = Math.max(y + minH, curClamp.y); w = (x + w) - nx; x = nx; h = ny - y; }
            if (corner === 'se') { const nx = Math.max(x + minW, curClamp.x); const ny = Math.max(y + minH, curClamp.y); w = nx - x; h = ny - y; }

            // Clamp to image
            x = Math.max(0, Math.min(x, this.imageWidth()  - w));
            y = Math.max(0, Math.min(y, this.imageHeight() - h));

            return { ...b, x, y, w, h };
          }));
          ctx.requestPaint(); this.updateScreenLabels();
        }
      },

      onUp: (_e, ctx) => {
        draggingPoint = null;
        draggingSkeletonId = null;
        draggingBoxId = null; resizingId = null; corner = null;
        ctx.requestPaint(); this.updateScreenLabels();
      },

      drawOverlay: () => {}
    };
  }

  /** Skeleton tool behavior (per spec):
   * - Click empty space: create a new skeleton with a single point, select the point.
   *   If Ctrl held, stay in skeleton tool for chaining; else switch to select tool.
   * - If a point is already selected in skeleton tool:
   *   - Click empty: add new point to same skeleton and connect to previous point.
   *   - Click existing point:
   *       - If same skeleton: connect if not already connected.
   *       - If different skeletons: connect and MERGE into selected point's skeleton color.
   *   Ctrl keeps chaining with the new point; otherwise switch to select tool.
   * - Clicking an existing point (without prior selection): select that point (visual feedback).
   */
  private makeSkeletonTool(): Tool {
    let localSelecting = false; // track whether we keep chaining

    const addSkeletonWithPoint = (p: {x:number;y:number}): { sk: SkeletonAnn; pid: string } => {
      const id = this.idSeq++;
      const pid = 'p' + (this.pointSeq++);
      const sk: SkeletonAnn = {
        id,
        points: { [pid]: { id: pid, x: p.x, y: p.y, v: 2, labelId: this.activeSkelLabelId() } },
        edges: [] as [string, string][],
        labelId: this.activeSkelLabelId(),
        color: this.activeSkelColor(), // default; user can change in sidebar
      };
      this.skeletons.update(arr => [...arr, sk]);
      return { sk, pid };
    };

    const addPointToSkeleton = (sk: SkeletonAnn, p: {x:number;y:number}): { pid: string } => {
      const pid = 'p' + (this.pointSeq++);
      const next: SkeletonAnn = {
        ...sk,
        points: { ...sk.points, [pid]: { id: pid, x: p.x, y: p.y, v: 2, labelId: this.activeSkelLabelId() } }
      };
      this.skeletons.update(arr => arr.map(s => s.id === sk.id ? next : s));
      return { pid };
    };

    const ensureEdge = (sk: SkeletonAnn, a: string, b: string) => {
      const exists = sk.edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (exists) return;

  // force tuple type for the appended value
  const next: SkeletonAnn = {
    ...sk,
    edges: [...sk.edges, [a, b] as [string, string]],
  };
  this.skeletons.update(arr => arr.map(s => (s.id === sk.id ? next : s)));
    };

    const mergeSkeletons = (keepId: Id, dropId: Id) => {
      let keep = this.skeletons().find(s => s.id === keepId)!;
      let drop = this.skeletons().find(s => s.id === dropId)!;
      // move points
      const movedPts: Record<string, Keypoint> = { ...keep.points };
      for (const [pid, kp] of Object.entries(drop.points)) {
        const npid = movedPts[pid] ? ('m' + pid) : pid;
        movedPts[npid] = { ...kp, id: npid };
      }
      // move edges (remap pids if we ever renamed)
      const movedEdges: [string, string][] = [...keep.edges];
  for (const [a, b] of drop.edges) {
    // if you remap pids, do that first
    const aa = movedPts[a] ? a : ('m' + a in movedPts ? ('m' + a) : a);
    const bb = movedPts[b] ? b : ('m' + b in movedPts ? ('m' + b) : b);
    if (!movedEdges.some(([x, y]) => (x === aa && y === bb) || (x === bb && y === aa))) {
      movedEdges.push([aa, bb]); // <- OK: movedEdges is a tuple array
    }
  }
      // adopt keep's color (per spec: prioritize selected point's skeleton color)
      const merged: SkeletonAnn = { ...keep, points: movedPts, edges: movedEdges };
      this.skeletons.update(arr => {
        const filtered = arr.filter(s => s.id !== dropId);
        return filtered.map(s => (s.id === keepId ? merged : s));
      });
    };

    const clickExistingPoint = (hit: { skId: Id; pid: string }, ctrl: boolean) => {
  const sel = this.selection();

  if (sel.type === 'point') {
    if (sel.id === hit.skId) {
      // Same skeleton: connect
      const sk = this.skeletons().find(s => s.id === sel.id)!;
      ensureEdge(sk, sel.pid, hit.pid);
      this.selection.set({ type: 'point', id: hit.skId, pid: hit.pid });
    } else {
      // Different skeletons: merge into the selected point's skeleton, then connect
      const keepId = sel.id;                 // keep selected point's skeleton/color
      const dropId = hit.skId;
      mergeSkeletons(keepId, dropId);
      const merged = this.skeletons().find(s => s.id === keepId)!;
      ensureEdge(merged, sel.pid, hit.pid);
      this.selection.set({ type: 'point', id: keepId, pid: hit.pid });
    }

    // Ctrl toggles chaining vs. exit to Select
    if (!ctrl) this.currentTool.set(this.selectToolObj);

  } else {
    // No prior point selected: just select the clicked point; stay in Skeleton tool.
    this.selection.set({ type: 'point', id: hit.skId, pid: hit.pid });
  }

  this.requestPaint();
};


    const clickEmpty = (pImg: {x:number;y:number}, ctrl: boolean) => {
      const sel = this.selection();
      if (sel.type === 'point') {
        // add new point, connect to previous
        const sk = this.skeletons().find(s => s.id === sel.id)!;
        const { pid: newPid } = addPointToSkeleton(sk, pImg);
        ensureEdge(this.skeletons().find(s => s.id === sel.id)!, sel.pid, newPid);
        this.selection.set({ type: 'point', id: sel.id, pid: newPid });
      } else {
        // start a brand new skeleton with one point
        const { sk, pid } = addSkeletonWithPoint(pImg);
        this.selection.set({ type: 'point', id: sk.id, pid });
      }

      if (!ctrl) {
        // one point then leave
        this.currentTool.set(this.selectToolObj);
      }
      this.requestPaint();
    };

    return {
      kind: 'skeleton',
      onDown: (e, ctx) => {
        if (!this.imgLoaded()) return;
        const ctrl = e.ctrlKey || e.metaKey; // allow Cmd on macs
        const hit = this.hitTestPoint(e.clientX, e.clientY);
        if (hit) {
          clickExistingPoint(hit, ctrl);
          return;
        }
        const p = ctx.clampToImage(ctx.screenToImage(e.clientX, e.clientY));
        clickEmpty(p, ctrl);
      },
      onMove: (_e, _ctx) => {},
      onUp:   (_e, _ctx) => {},
      drawOverlay: (_g, _ctx) => {},
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

  /* ---------- Delete behavior ---------- */
  private deleteCurrentSelection() {
    const s = this.selection();
    if (s.type === 'skeleton' && s.id != null) {
      this.skeletons.update(arr => arr.filter(sk => sk.id !== s.id));
      this.selection.set({ type: null, id: null });
      this.requestPaint();
      return;
    }
    if (s.type === 'point' && s.id != null) {
      this.skeletons.update(arr => arr.map(sk => {
        if (sk.id !== s.id) return sk;
        const nextPts = { ...sk.points };
        if (!nextPts[s.pid]) return sk;
        delete nextPts[s.pid];
        const nextEdges = sk.edges.filter(([a,b]) => a !== s.pid && b !== s.pid);
        return { ...sk, points: nextPts, edges: nextEdges };
      }).filter(sk => Object.keys(sk.points).length > 0));
      this.selection.set({ type: 'skeleton', id: s.id }); // fallback to skeleton if it still exists
      this.requestPaint();
      return;
    }
    if (s.type === 'box' && s.id != null) {
      this.boxes.update(list => list.filter(b => b.id !== s.id));
      this.selection.set({ type: null, id: null });
      this.requestPaint(); this.updateScreenLabels();
    }
  }

  /* ---------- Comments tab state (unchanged, with handlers) ---------- */
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
      const idx = arr.findIndex(x => (x as any).isPending && x.userId === incoming.userId && x.content === incoming.content);
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

    const optimistic: CommentModel = {
      id: crypto.randomUUID(),
      slideId,
      userId: uid,
      content,
      createdAt: new Date(),
      updatedAt: new Date(),
      isPending: true as any,
    };
    this.comments.update(arr => {
      const next = arr.slice();
      next.push(optimistic);
      next.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return next;
    });
    this.pendingOptimistic.push({ userId: uid, content });

    this.socket.createComment(slideId, uid, content);
    this.newComment.set('');
  }

  avatarUrl(userId: string): string {
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
    return `rgb(${128 + (r>>1)}, ${128 + (g>>1)}, ${128 + (b>>1)})`;
  }
}
