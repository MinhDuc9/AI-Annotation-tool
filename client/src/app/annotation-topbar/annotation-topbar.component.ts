// src/app/annotation-edit/topbar/annotation-topbar.component.ts
import {
    ChangeDetectionStrategy,
    Component,
    HostListener,
    Input,
    Output,
    EventEmitter,
    inject,
    signal,
    WritableSignal,
    computed,
    OnChanges,
    SimpleChanges,
    DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { ShareDialogComponent } from './share-dialog.component';
import {
    SocketService,
    SlideJoinedEvent,
    SlideLeftEvent,
    SlideParticipantPublic,
} from '../services/socket.service';
import { AnnotationHistoryService } from '../services/annotation-history.service';

@Component({
    selector: 'app-annotation-topbar',
    standalone: true,
    imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    MatDialogModule,
    RouterLink
],
    templateUrl: './annotation-topbar.component.html',
    styleUrls: ['./annotation-topbar.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnnotationTopbarComponent implements OnChanges {
    private router = inject(Router);
    private dialog = inject(MatDialog);
    private socket = inject(SocketService);
    private destroyRef = inject(DestroyRef);
    private historyService = inject(AnnotationHistoryService);

    // Inputs from parent
    @Input({ required: true }) projectId!: string;
    @Input() projectName: string = 'Project';
    @Input({ required: true }) slideId!: string;

    // Current user (to render separately)
    @Input() currentUserId: string = '';
    @Input() currentUserName: string = '';

    // Undo/redo from history service
    canUndo = computed(
        () => !!this.historyService && this.historyService.canUndo()
    );
    canRedo = computed(
        () => !!this.historyService && this.historyService.canRedo()
    );

    // Actions emitted to parent
    @Output() undo = new EventEmitter<void>();
    @Output() redo = new EventEmitter<void>();
    @Output() exportSlideCoco = new EventEmitter<void>();
    @Output() exportAllCoco = new EventEmitter<void>();

    // Presence
    participants: WritableSignal<SlideParticipantPublic[]> = signal<
        SlideParticipantPublic[]
    >([]);
    // Everyone except me
    others = computed(() => {
        const meId = (this.currentUserId || '').trim();
        const meName = (this.currentUserName || '').trim();

        return this.participants().filter((p) => {
            const pid = (p as any).userId?.toString().trim?.() || '';
            const pname = (p as any).userName?.toString().trim?.() || '';

            // Exclude "me" by id if available, else by email, else by exact name match.
            if (meId && pid && pid === meId) return false;
            if (meName && pname && pname === meName) return false;

            return true;
        });
    });

    visibleOthers = computed(() => this.others().slice(0, 4));
    extraCount = computed(() => Math.max(0, this.others().length - 4));

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['slideId']?.currentValue) {
            this.participants.set([]);
        }
    }

    ngAfterViewInit() {
        const subJoin = this.socket
            .onJoined()
            .subscribe((evt: SlideJoinedEvent) => {
                if (!evt?.slideId || evt.slideId !== this.slideId) return;
                if (
                    Array.isArray(evt.participants) &&
                    evt.participants.length
                ) {
                    this.participants.set(
                        this.uniqueBySocket(evt.participants)
                    );
                } else if (evt.user) {
                    const list = this.uniqueBySocket([
                        ...this.participants(),
                        evt.user,
                    ]);
                    this.participants.set(list);
                }
            });

        const subLeft = this.socket
            .onLeft()
            .subscribe((evt: SlideLeftEvent) => {
                if (!evt?.slideId || evt.slideId !== this.slideId) return;
                const leftId = evt.user?.socketId;
                if (!leftId) return;
                this.participants.set(
                    this.participants().filter((p) => p.socketId !== leftId)
                );
            });

        this.destroyRef.onDestroy(() => {
            try {
                subJoin.unsubscribe();
            } catch {}
            try {
                subLeft.unsubscribe();
            } catch {}
        });
    }

    // Topbar actions
    goBack() {
        this.router.navigateByUrl('/');
    }
    onUndo() {
        this.undo.emit();
    }
    onRedo() {
        this.redo.emit();
    }
    onExportSlideCOCO() {
        this.exportSlideCoco.emit();
    }
    onExportAllCOCO() {
        this.exportAllCoco.emit();
    }

    // Share next to participants (bigger dialog)
    onOpenShare() {
        this.dialog.open(ShareDialogComponent, {
            width: '720px',
            maxWidth: '92vw',
            data: { projectId: this.projectId, projectName: this.projectName },
        });
    }

    // Avatar utilities (same as comments)
    avatarUrlFromName(name: string): string {
        const initial = (name?.trim()?.[0] || '?').toUpperCase();
        const bg = this.hashColor(name || 'unknown');
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
      <rect width='100%' height='100%' fill='${bg}'/>
      <text x='50%' y='54%' font-family='Inter,Arial' font-size='120' dominant-baseline='middle' text-anchor='middle' fill='white'>${initial}</text>
    </svg>`;
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }
    initials(name = '') {
        return (name || '')
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
    }

    // Keyboard: Undo/Redo
    @HostListener('window:keydown', ['$event'])
    onKeydown(e: KeyboardEvent) {
        const active = document.activeElement as HTMLElement | null;
        const tag = active?.tagName?.toLowerCase();
        const typing =
            tag === 'input' ||
            tag === 'textarea' ||
            tag === 'select' ||
            active?.isContentEditable;
        if (typing) return;

        const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
        const meta = isMac ? e.metaKey : e.ctrlKey;

        if (meta && !e.shiftKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (this.canUndo()) this.onUndo();
        } else if (
            (meta && e.shiftKey && e.key.toLowerCase() === 'z') ||
            (meta && !isMac && e.key.toLowerCase() === 'y')
        ) {
            e.preventDefault();
            if (this.canRedo()) this.onRedo();
        }
    }

    // helpers
    private uniqueBySocket(arr: SlideParticipantPublic[]) {
        const seen = new Set<string>();
        const out: SlideParticipantPublic[] = [];
        for (const p of arr) {
            if (!p?.socketId || seen.has(p.socketId)) continue;
            seen.add(p.socketId);
            out.push(p);
        }
        return out;
    }
    private hashColor(s: string): string {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        const r = (h >>> 16) & 0xff,
            g = (h >>> 8) & 0xff,
            b = h & 0xff;
        return `rgb(${128 + (r >> 1)}, ${128 + (g >> 1)}, ${128 + (b >> 1)})`;
    }
}
