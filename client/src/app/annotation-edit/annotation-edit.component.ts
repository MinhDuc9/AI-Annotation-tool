import { NgIf } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild } from '@angular/core';

@Component({
  selector: 'app-annotation-edit',
  imports: [NgIf],
  templateUrl: './annotation-edit.component.html',
  styleUrl: './annotation-edit.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnnotationEditComponent implements AfterViewInit{ 
  @ViewChild('editorCanvas', { static: true })
  private canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private img = new Image();

  /** ===== View transforms for canvas ===== */
  private scale = 1;
  private originX = 0;
  private originY = 0;

  /** Drag state for canvas panning */
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private activePointerId: number | null = null;

  /** ===== Sidebar state ===== */
  sidebarWidth = 280;           // px
  sidebarCollapsed = false;
  private resizing = false;

  /** Track if we've already centered once (so resize won't recenter after user pans) */
  private hasCenteredInitially = false;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');
    this.ctx = ctx;

    // Initialize sidebar width CSS var
    this.applySidebarWidth();

    // Initial canvas size & draw
    this.resizeCanvas();
    this.img.src = 'S1_CS_10.jpg';
    this.img.onload = () => {
      // Center the image once on first load
      this.centerImage();
      this.draw();
    };
  }

  /** Center image within the visible canvas (in CSS px) for the current scale */
  private centerImage(): void {
    const canvas = this.canvasRef.nativeElement;

    // visible CSS size (we mapped DPR via setTransform already)
    const cssW = canvas.width / (window.devicePixelRatio || 1);
    const cssH = canvas.height / (window.devicePixelRatio || 1);

    const imgW = this.img.naturalWidth;
    const imgH = this.img.naturalHeight;

    // Centering: origin is the translation BEFORE scaling
    // We want the image's (0,0) to be placed so the image bounds are centered
    this.originX = (cssW - imgW * this.scale) / 2;
    this.originY = (cssH - imgH * this.scale) / 2;

    this.hasCenteredInitially = true;
  }

  /** Keep canvas crisp on HiDPI and in sync with container */
  /** Keep canvas crisp on HiDPI and in sync with container */
  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const parent = canvas.parentElement!;
    const cssWidth = parent.clientWidth;
    const cssHeight = parent.clientHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const newWidth = Math.floor(cssWidth * dpr);
    const newHeight = Math.floor(cssHeight * dpr);

    if (canvas.width !== newWidth || canvas.height !== newHeight) {
      canvas.width = newWidth;
      canvas.height = newHeight;

      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // If we haven't centered yet (first render), center on resize too.
      if (!this.hasCenteredInitially && this.img.complete && this.img.naturalWidth > 0) {
        this.centerImage();
      }

      this.draw();
    }
  }

  /** Window resize -> resize both canvas & keep layout consistent */
  @HostListener('window:resize')
  onWindowResize(): void {
    this.resizeCanvas();
  }

  /** ===== Canvas rendering ===== */
  private draw(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.save();

    const cssW = canvas.width / (window.devicePixelRatio || 1);
    const cssH = canvas.height / (window.devicePixelRatio || 1);
    this.ctx.clearRect(0, 0, cssW, cssH);

    // Pan & zoom
    this.ctx.translate(this.originX, this.originY);
    this.ctx.scale(this.scale, this.scale);

    if (this.img.complete && this.img.naturalWidth > 0) {
      this.ctx.drawImage(this.img, 0, 0);
    }

    this.ctx.restore();
  }

  /** Mouse wheel zoom centered at pointer */
  handleWheel(ev: WheelEvent): void {
    ev.preventDefault();

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = ev.clientX - rect.left;
    const mouseY = ev.clientY - rect.top;

    const zoomFactor = 1.1;
    const direction = ev.deltaY < 0 ? 1 : -1;
    const zoom = Math.pow(zoomFactor, direction);

    this.originX = mouseX - zoom * (mouseX - this.originX);
    this.originY = mouseY - zoom * (mouseY - this.originY);

    const next = this.scale * zoom;
    this.scale = Math.min(Math.max(next, 0.05), 20);

    this.draw();
  }

  /** Pan with pointer (mouse/pen/touch) */
  onPointerDown(ev: PointerEvent): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.setPointerCapture(ev.pointerId);
    this.activePointerId = ev.pointerId;
    this.isDragging = true;
    canvas.classList.add('grabbing');

    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

    this.dragStartX = x - this.originX;
    this.dragStartY = y - this.originY;
  }

  onPointerMove(ev: PointerEvent): void {
    if (!this.isDragging || this.activePointerId !== ev.pointerId) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

    this.originX = x - this.dragStartX;
    this.originY = y - this.dragStartY;

    this.draw();
  }

  onPointerUp(ev: PointerEvent): void {
    const canvas = this.canvasRef.nativeElement;
    if (this.activePointerId === ev.pointerId) {
      this.isDragging = false;
      this.activePointerId = null;
      canvas.releasePointerCapture(ev.pointerId);
      canvas.classList.remove('grabbing');
    }
  }

  /** ===== Sidebar: width + collapse ===== */

  /** Apply the current width to the CSS variable used in the grid */
  private applySidebarWidth(): void {
    document.documentElement.style.setProperty('--sidebar-width', `${this.sidebarWidth}px`);
  }

  resetSidebarWidth(): void {
    this.sidebarCollapsed = false;
    this.sidebarWidth = 280;
    this.applySidebarWidth();
  }

  toggleCollapse(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    // When expanding from collapsed, restore a sensible width
    if (!this.sidebarCollapsed && this.sidebarWidth < 120) {
      this.sidebarWidth = 280;
      this.applySidebarWidth();
    }
    // No need to touch CSS var when collapsed, width is forced via class
  }

  /** Start dragging the sash to resize (sidebar is on the RIGHT) */
  startResize(ev: PointerEvent): void {
    // Avoid text selection while resizing
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this.resizing = true;

    // Attach move/up listeners on window to keep resize even if pointer leaves sash
    window.addEventListener('pointermove', this.onResizeMove);
    window.addEventListener('pointerup', this.onResizeEnd, { once: true });
    window.addEventListener('pointercancel', this.onResizeEnd, { once: true });
  }

  /** Handle pointermove during resize */
  private onResizeMove = (ev: PointerEvent): void => {
    if (!this.resizing) return;

    // Sidebar is right column. Compute width as distance from pointer to right edge.
    const contentEl = (document.querySelector('.content') as HTMLElement);
    const rect = contentEl.getBoundingClientRect();
    const rightEdge = rect.right;
    let newWidth = Math.round(rightEdge - ev.clientX);

    // Clamp width
    const min = 200;
    const max = 560;
    newWidth = Math.max(min, Math.min(max, newWidth));

    this.sidebarWidth = newWidth;
    this.applySidebarWidth();
  };

  /** Finish resizing and clean up listeners */
  private onResizeEnd = (_ev: PointerEvent): void => {
    this.resizing = false;
    window.removeEventListener('pointermove', this.onResizeMove);
    window.removeEventListener('pointerup', this.onResizeEnd);
    window.removeEventListener('pointercancel', this.onResizeEnd);
  };
}
