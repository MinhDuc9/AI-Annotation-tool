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
    computed,
    runInInjectionContext,
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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
    CommentModel,
    slideCommentDTO,
    SlideService,
} from '../services/slide.service';
import {
  BoundingBoxDTO,
    SkeletalDTO,
    SocketCommentDTO,
    SocketCommentDeletedDTO,
    SocketService,
} from '../services/socket.service';
import { AuthService } from '../services/Auth.service';
import { map, distinctUntilChanged, Observable, firstValueFrom } from 'rxjs';
import { AnnotationTopbarComponent } from '../annotation-topbar/annotation-topbar.component';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ProjectService, ProjectUser } from '../services/project.service';
import {
    AnnotationService,
    BoundingBoxDTO as AnnotationBoundingBoxDTO,
    SkeletalDTO as AnnotationSkeletalDTO,
} from '../services/annotation.service';
import {
    BoxAnn,
    Id,
    Keypoint,
    LabelChip,
    LabelDef,
    PendingBoxSnapshot,
    PendingPointSnapshot,
    Selection,
    SkeletonAnn,
    SlideMeta,
    Tool,
    ToolCtx,
    ToolKind,
    Vis,
} from './annotation-edit.types';
import {
    clearPendingBox,
    clearPendingPoint,
    getOrCreateNestedMap,
    linkPointIds,
    localPointOf,
    markPendingBox,
    markPendingPoint,
    pLocKey,
    serverPointId,
    takePendingBoxMatch,
    takePendingPointMatch,
} from './annotation-edit.mapping-utils';
import {
    mapDtoToComment,
    mapSocketToComment,
    PendingCommentTracker,
} from './annotation-edit.comment-utils';

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
        AnnotationTopbarComponent,
        ScrollingModule,
    ],
    templateUrl: './annotation-edit.component.html',
    styleUrls: ['./annotation-edit.component.scss'],
})
export class AnnotationEditComponent implements AfterViewInit, OnDestroy {
    private snack = inject(MatSnackBar);
    private injector = inject(Injector);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    // Querystring routing: /annotate/:project_id?slide=SLIDE_ID
    projectId = toSignal(
        this.route.paramMap.pipe(
            map((p) => p.get('project_id') ?? ''),
            distinctUntilChanged()
        ),
        { initialValue: '' }
    );
    slideIdQ = toSignal(
        this.route.queryParamMap.pipe(
            map((q) => q.get('slide')),
            distinctUntilChanged()
        ),
        { initialValue: null }
    );

    // Slides list for the rail
    slides = signal<SlideMeta[]>([]);
    slidesLoading = signal(false);
    slidesError = signal<string | null>(null);
    currentSlideId = computed(
        () => this.slideIdQ() ?? this.slides()[0]?.id ?? null
    );
    currentIndex = computed(() => {
        const id = this.slideIdQ();
        if (!id) return -1;
        return this.slides().findIndex((s) => s.id === id);
    });
    /** Remember the most recently edited skeleton (creation, point drag, etc.) */
    private lastEditedSkId: number | null = null;

    // SIMPLE per-slide stores (no caching/LRU)
    private boxesBySlide = new Map<string, BoxAnn[]>();
    private skeletonsBySlide = new Map<string, SkeletonAnn[]>();
    private annotationsLoading = new Map<string, Promise<void>>();

    // Keep last slide to persist on switch
    private lastSlideId: string | null = null;

    // One shared <img> used by your existing paint() path
    private currentImgUrl: string | null = null;

    constructor() {
        // 1) Stable image path: onload updates flags/sizes and triggers a paint
        this.img.onload = () => {
            const w = this.img.naturalWidth || this.img.width;
            const h = this.img.naturalHeight || this.img.height;
            this.imageWidth.set(w);
            this.imageHeight.set(h);
            this.imgLoaded.set(true);

            // your existing helpers - keep them if you have them
            this.fitCanvasToImageOrMax?.();
            this.resizeToContainer?.();
            this.updateScreenLabels?.();
            this.requestPaint?.();
        };

        // 2) Effects: put them in an injection context (not in ngOnInit/AfterViewInit)
        runInInjectionContext(this.injector, () => {
            // Load slides when project changes
            effect(() => {
                const pid = this.projectId();
                if (!pid) return;
                void this.loadSlides(pid);
            });

            // On slide change: persist outgoing, restore incoming, then load image
            effect(() => {
                const pid = this.projectId();
                const id = this.currentSlideId();
                if (!id) return;

                if (this.lastSlideId && this.lastSlideId !== id) {
                    this.persistCurrentSlideState(this.lastSlideId);
                }
                this.restoreSlideState(id); // put annotations for this slide into signals
                void this.showSlide(id); // kicks off image load via <img>.src
                const idx = this.currentIndex(); // compute index after we know the id
                if (idx >= 0) void this.prefetchNeighbors(idx); // warm next/prev decodes
                this.lastSlideId = id;

                if (pid) void this.loadAnnotationsForSlide(pid, id);
            });

            // Keep per-slide stores in sync as you edit (cheap, no LRU)
            effect(() => {
                const sid = this.currentSlideId();
                if (!sid) return;
                this.boxesBySlide.set(
                    sid,
                    this.boxes().map((b) => ({ ...b }))
                );
                this.skeletonsBySlide.set(
                    sid,
                    this.skeletons().map((sk) => ({
                        ...sk,
                        points: { ...sk.points },
                        edges:
                            sk.edges?.map(
                                (e) => [e[0], e[1]] as [string, string]
                            ) ?? [],
                    }))
                );
            });
            effect(() => {
                // read signals that affect drawing
                void this.boxes();
                void this.skeletons();
                void this.canvasSize?.();
                void this.imgLoaded();
                void this.stagePan();
                void this.stageScale();
                void this.showBoxLabels?.();
                void this.showPointLabels?.();

                // repaint + relayout labels
                this.requestPaint?.();
                this.updateScreenLabels?.();
            });

            // Load project users when the project id is known (for usernames in comments)
            effect(() => {
                const pid = this.projectId();
                if (!pid) return;
                this.loadProjectUsers(pid);
            });

            // Join/leave comment room automatically when slide changes
            let lastCommentsSlideId: string | null = null;
            effect(() => {
                const sid = this.currentSlideId();
                const uid = this.auth.getUserId(); // from AuthService
                if (!sid || !uid) return;

                // Leave previous slide room
                if (lastCommentsSlideId && lastCommentsSlideId !== sid) {
                    try {
                        this.socket.leaveSlide(lastCommentsSlideId);
                    } catch {}
                }

                // Join new room
                this.comments.set([]); // reset list for the new slide
                this.socket.joinSlide(sid, uid);
                this.isConnected.set(true);
                lastCommentsSlideId = sid;

                // Load existing comments and sort newest -> oldest
                this.slideSvc.getComments(sid).subscribe({
                    next: (dto) => {
                        const mapped = (dto?.comments ?? []).map(
                            mapDtoToComment
                        );
                        mapped.sort(
                            (a, b) =>
                                b.createdAt.getTime() - a.createdAt.getTime()
                        );
                        this.comments.set(mapped);
                    },
                    error: () => {
                        this.snack.open('Failed to load comments', undefined, {
                            duration: 1600,
                        });
                    },
                });

                // Rewire live events (dispose old first)
                this.disposeSocketHandlers();
                this.socketSubs = [
                    this.observe(this.socket.onCommentCreated(), (c) =>
                        this.applyIncomingCreateNewestFirst(c)
                    ),
                    this.observe(this.socket.onCommentUpdated(), (c) =>
                        this.applyIncomingUpdate(c)
                    ),
                    this.observe(this.socket.onCommentDeleted(), (c) =>
                        this.applyIncomingDelete(c)
                    ),
                    this.observe(this.socket.onError(), (e) =>
                        this.snack.open(
                            e.message ?? 'Socket error',
                            undefined,
                            { duration: 1800 }
                        )
                    ),
                ];
            });

            // === Lock events from socket ===
            effect(() => {
                const sid = this.currentSlideId();
                if (!sid) return;

                // clear all locks when slide changes
                this.boxLocks.set(new Map());
                this.skelLocks.set(new Map());
                this.pendingRemoteBoxLocks.clear();
                this.pendingRemoteSkelLocks.clear();
                this.pendingRemoteSkelByTemp.clear();
                this.remoteSkelLockState.clear();

                // dispose previous
                this.disposeTouchHandlers?.();
                this._touchOffs = [
                    this.observe(this.socket.onBoxTouch(), (p) => {
                        this.logLock('socket:onBoxTouch', p);
                        if (!p?.slideId || p.slideId !== this.currentSlideId())
                            return;
                        const emitter =
                            (p.clientInstanceId ?? '').trim() || '';
                        if (
                            emitter &&
                            emitter === this.socket.clientInstanceId
                        ) {
                            this.logLock('socket:onBoxTouch:ignored-self', {
                                emitter,
                            });
                            return;
                        }
                        const user = (p.userId ?? '').trim();
                        if (!emitter && (!user || user === this.me())) {
                            this.logLock(
                                'socket:onBoxTouch:ignored-self-fallback',
                                { user }
                            );
                            return;
                        }
                        const sid = p.slideId;
                        const instance =
                            emitter || (user ? `user:${user}` : '');
                        let localId: Id | undefined;
                        let serverId: string | undefined =
                            typeof p.boundingBoxId === 'string'
                                ? p.boundingBoxId
                                : undefined;
                        if (serverId) {
                            localId = this.boxLocalId(sid, serverId);
                        } else if (typeof p.boxId === 'number') {
                            localId = p.boxId;
                        }
                        if (typeof localId === 'number') {
                            this.setBoxLock(localId, {
                                by: user,
                                instanceId: emitter || undefined,
                            });
                            if (serverId) this.clearPendingBoxLock(sid, serverId);
                        } else if (serverId) {
                            this.queuePendingBoxLock(sid, serverId, {
                                by: user,
                                instanceId: emitter || undefined,
                            });
                        }
                        this.requestPaint();
                    }),
                    this.observe(this.socket.onBoxUnTouch(), (p) => {
                        this.logLock('socket:onBoxUnTouch', p);
                        if (!p?.slideId || p.slideId !== this.currentSlideId())
                            return;
                        const emitter =
                            (p.clientInstanceId ?? '').trim() || '';
                        if (
                            emitter &&
                            emitter === this.socket.clientInstanceId
                        ) {
                            this.logLock('socket:onBoxUnTouch:ignored-self', {
                                emitter,
                            });
                            return;
                        }
                        const user = (p.userId ?? '').trim();
                        if (!emitter && (!user || user === this.me())) {
                            this.logLock(
                                'socket:onBoxUnTouch:ignored-self-fallback',
                                { user }
                            );
                            return;
                        }
                        const sid = p.slideId;
                        let localId: Id | undefined;
                        const serverId =
                            typeof p.boundingBoxId === 'string'
                                ? p.boundingBoxId
                                : undefined;
                        if (serverId) {
                            localId = this.boxLocalId(sid, serverId);
                        } else if (typeof p.boxId === 'number') {
                            localId = p.boxId;
                        }
                        if (typeof localId === 'number') {
                            this.setBoxLock(localId, null);
                        } else if (serverId) {
                            this.clearPendingBoxLock(sid, serverId);
                        }
                        this.requestPaint();
                    }),

                    this.observe(this.socket.onSkeletalTouch(), (p) => {
                        this.logLock('socket:onSkeletalTouch', p);
                        if (!p?.slideId || p.slideId !== this.currentSlideId())
                            return;
                        const emitter =
                            (p.clientInstanceId ?? '').trim() || '';
                        if (
                            emitter &&
                            emitter === this.socket.clientInstanceId
                        ) {
                            this.logLock(
                                'socket:onSkeletalTouch:ignored-self',
                                { emitter }
                            );
                            return;
                        }
                        const user = (p.userId ?? '').trim();
                        if (!emitter && (!user || user === this.me())) {
                            this.logLock(
                                'socket:onSkeletalTouch:ignored-self-fallback',
                                { user }
                            );
                            return;
                        }
                        const sid = p.slideId;
                        const instance =
                            emitter || (user ? `user:${user}` : '');
                        let localSkId: Id | undefined;
                        let pid: string | undefined =
                            typeof p.pointId === 'string' ? p.pointId : undefined;
                        const pointServerId =
                            typeof p.pointServerId === 'string'
                                ? p.pointServerId
                                : undefined;
                        if (pointServerId) {
                            const mapping = this.pointServerToLocal
                                .get(sid)
                                ?.get(pointServerId);
                            if (mapping) {
                                localSkId = mapping.sk as Id;
                                pid = mapping.pid;
                            }
                        } else if (typeof p.skeletalId === 'number') {
                            localSkId = p.skeletalId;
                        }
                        if (localSkId !== undefined) {
                            this.addRemoteSkelLock(
                                localSkId,
                                {
                                    by: user,
                                    pid,
                                    instanceId: instance || undefined,
                                },
                                1
                            );
                            if (pointServerId)
                                this.clearPendingSkelLock(sid, pointServerId);
                        } else if (pointServerId) {
                            this.queuePendingSkelLock(sid, pointServerId, {
                                by: user,
                                instanceId: instance || undefined,
                                pid,
                                count: 1,
                            });
                        } else if (
                            typeof p.skeletalId === 'number' &&
                            typeof p.pointId === 'string'
                        ) {
                            if (instance) {
                                const tempKey = this.remoteSkelTempKey(
                                    sid,
                                    p.skeletalId,
                                    p.pointId
                                );
                                this.pendingRemoteSkelByTemp.set(tempKey, {
                                    by: user,
                                    instanceId: instance,
                                });
                                this.logLock('pendingSkelTemp:add', {
                                    key: tempKey,
                                });
                            }
                        }
                        this.requestPaint();
                    }),
                    this.observe(this.socket.onSkeletalUnTouch(), (p) => {
                        this.logLock('socket:onSkeletalUnTouch', p);
                        if (!p?.slideId || p.slideId !== this.currentSlideId())
                            return;
                        const emitter =
                            (p.clientInstanceId ?? '').trim() || '';
                        if (
                            emitter &&
                            emitter === this.socket.clientInstanceId
                        ) {
                            this.logLock(
                                'socket:onSkeletalUnTouch:ignored-self',
                                { emitter }
                            );
                            return;
                        }
                        const user = (p.userId ?? '').trim();
                        if (!emitter && (!user || user === this.me())) {
                            this.logLock(
                                'socket:onSkeletalUnTouch:ignored-self-fallback',
                                { user }
                            );
                            return;
                        }
                        const sid = p.slideId;
                        const instance =
                            emitter || (user ? `user:${user}` : '');
                        let localSkId: Id | undefined;
                        const pointServerId =
                            typeof p.pointServerId === 'string'
                                ? p.pointServerId
                                : undefined;
                        if (pointServerId) {
                            const mapping = this.pointServerToLocal
                                .get(sid)
                                ?.get(pointServerId);
                            if (mapping) {
                                localSkId = mapping.sk as Id;
                            }
                        } else if (typeof p.skeletalId === 'number') {
                            localSkId = p.skeletalId;
                        }
                        if (localSkId !== undefined) {
                            this.removeRemoteSkelLock(localSkId, instance);
                        } else if (pointServerId) {
                            this.clearPendingSkelLock(sid, pointServerId);
                        } else if (
                            typeof p.skeletalId === 'number' &&
                            typeof p.pointId === 'string'
                        ) {
                            const tempKey = this.remoteSkelTempKey(
                                sid,
                                p.skeletalId,
                                p.pointId
                            );
                            if (this.pendingRemoteSkelByTemp.delete(tempKey)) {
                                this.logLock('pendingSkelTemp:remove', {
                                    key: tempKey,
                                });
                            }
                        }
                        this.requestPaint();
                    }),
                ];
            });

            effect(() => {
                const sid = this.currentSlideId();
                const sel = this.selection();
                void this.boxes();
                void this.skeletons();
                this.syncSelectionLocks(sid ?? null, sel);
            });

            let offAnn: Array<() => void> = [];
            effect(() => {
                // dispose old
                for (const off of offAnn)
                    try {
                        off();
                    } catch {}
                offAnn = [];

                const sid = this.currentSlideId();
                if (!sid) return;

                // --- BOX CREATED ---
                offAnn.push(
                    this.observe(
                        this.socket.onBoundingBoxCreated(),
                        (srv: any) => {
                            this.logLock('socket:onBoundingBoxCreated', srv);
                            if (!srv?.slideId || srv.slideId !== sid) return;

                            // If server echoes a clientTempId, use it; else insert fresh
                            const clientTempId = (srv as any).clientTempId
                                ? Number((srv as any).clientTempId)
                                : undefined;
                            const pendingLocalId = takePendingBoxMatch(this.pendingBoxes, sid, srv);

                            if (clientTempId != null) {
                                // Link ids and replace optimistic
                                this.linkBoxIds(sid, clientTempId, srv.id);
                                this.tryApplyPendingBoxLock(sid, srv.id);
                                clearPendingBox(this.pendingBoxes, sid, clientTempId);
                                this.boxes.update((arr) => {
                                    const i = arr.findIndex((x) => x.id === clientTempId);
                                    if (i === -1) return arr;
                                    const next = arr.slice();
                                    next[i] = this.coerceServerBoxToUI(clientTempId, srv);
                                    return next;
                                });
                            } else if (pendingLocalId != null) {
                                this.linkBoxIds(sid, pendingLocalId, srv.id);
                                this.tryApplyPendingBoxLock(sid, srv.id);
                                clearPendingBox(this.pendingBoxes, sid, pendingLocalId);
                                this.boxes.update((arr) => {
                                    const i = arr.findIndex((x) => x.id === pendingLocalId);
                                    if (i === -1) return arr;
                                    const next = arr.slice();
                                    next[i] = this.coerceServerBoxToUI(pendingLocalId, srv);
                                    return next;
                                });
                            } else {
                                // No temp id: insert new with a new local id
                                const localId = this.idSeq++;
                                this.linkBoxIds(sid, localId, srv.id);
                                this.tryApplyPendingBoxLock(sid, srv.id);
                                this.boxes.update((arr) => [
                                    ...arr,
                                    this.coerceServerBoxToUI(localId, srv),
                                ]);
                            }
                            this.requestPaint();
                            this.updateScreenLabels();
                        }
                    )
                );

                // --- BOX UPDATED (position/size/color/label) ---
                offAnn.push(
                    this.observe(
                        this.socket.onBoundingBoxUpdated(),
                        (srv: any) => {
                            this.logLock('socket:onBoundingBoxUpdated', srv);
                            if (!srv?.slideId || srv.slideId !== sid) return;
                            const localId = this.boxLocalId(sid, srv.id);
                            if (localId == null) return;
                            this.boxes.update((arr) => {
                                const i = arr.findIndex(
                                    (x) => x.id === localId
                                );
                                if (i === -1) return arr;
                                const next = arr.slice();
                                next[i] = this.coerceServerBoxToUI(
                                    localId,
                                    srv
                                );
                                return next;
                            });
                            this.requestPaint();
                            this.updateScreenLabels();
                        }
                    )
                );

                // --- BOX DELETED ---
                offAnn.push(
                    this.observe(
                        this.socket.onBoundingBoxDeleted(),
                        (srv: any) => {
                            this.logLock('socket:onBoundingBoxDeleted', srv);
                            if (!srv) return;
                            const serverId = srv.boundingBoxId || srv.id;
                            const localId = this.boxLocalId(sid, serverId);
                            if (localId == null) return;
                            this.boxes.update((arr) =>
                                arr.filter((b) => b.id !== localId)
                            );
                            getOrCreateNestedMap(this.boxLocalToServer, sid).delete(localId);
                            getOrCreateNestedMap(this.boxServerToLocal, sid).delete(serverId);
                            clearPendingBox(this.pendingBoxes, sid, localId);
                            const sel = this.selection();
                            if (sel.type === 'box' && sel.id === localId) {
                                this.selection.set({ type: null, id: null });
                            }
                            this.requestPaint();
                            this.updateScreenLabels();
                        }
                    )
                );

                // --- SKELETON CREATED ---
                offAnn.push(
                    this.observe(
                        this.socket.onSkeletalCreated(),
                        (srv: any) => {
                            this.logLock('socket:onSkeletalCreated', srv);
                            const sid = this.currentSlideId();
                            if (!sid || srv?.slideId !== sid) return;

                            const clientTempRaw = String(
                                (srv as any).clientTempId ?? ''
                            ).trim();
                            let pendingTempEntry:
                                | { by: string; instanceId: string }
                                | null = null;
                            let pendingTempKey: string | null = null;
                            let pendingTempPid: string | null = null;
                            if (clientTempRaw) {
                                const tempParts = clientTempRaw.split(':');
                                if (tempParts.length === 2) {
                                    const [remoteSkStr, remotePid] = tempParts;
                                    if (remoteSkStr && remotePid) {
                                        pendingTempKey =
                                            this.remoteSkelTempKey(
                                                sid,
                                                remoteSkStr,
                                                remotePid
                                            );
                                        pendingTempEntry =
                                            this.pendingRemoteSkelByTemp.get(
                                                pendingTempKey
                                            ) ?? null;
                                        pendingTempPid = remotePid;
                                    }
                                }
                            }

                            const pendingMatch = takePendingPointMatch(this.pendingPoints, sid, srv);
                            if (pendingMatch) {
                                linkPointIds(this.pointLocalToServer, this.pointServerToLocal, sid, pendingMatch.skId, pendingMatch.pid, srv.id);
                                this.tryApplyPendingSkelLock(sid, srv.id);
                                if (pendingTempEntry && pendingTempKey) {
                                    this.pendingRemoteSkelByTemp.delete(
                                        pendingTempKey
                                    );
                                    this.addRemoteSkelLock(
                                        pendingMatch.skId,
                                        {
                                            by: pendingTempEntry.by,
                                            pid: pendingMatch.pid,
                                            instanceId:
                                                pendingTempEntry.instanceId,
                                        },
                                        1
                                    );
                                }
                                this.skeletons.update((arr) =>
                                    arr.map((sk) => {
                                        if (sk.id !== pendingMatch.skId) return sk;
                                        const point = sk.points[pendingMatch.pid];
                                        if (!point) return sk;
                                        const updatedPoint = {
                                            ...point,
                                            x: typeof srv.x_pos === 'number' ? srv.x_pos : point.x,
                                            y: typeof srv.y_pos === 'number' ? srv.y_pos : point.y,
                                            isPending: false,
                                        };
                                        return {
                                            ...sk,
                                            color: srv.color ?? sk.color,
                                            labelId: srv.category ?? sk.labelId,
                                            points: {
                                                ...sk.points,
                                                [pendingMatch.pid]: updatedPoint,
                                            },
                                        };
                                    })
                                );
                                this.syncServerEdgesForPoint(sid, pendingMatch.skId, pendingMatch.pid);
                                this.requestPaint();
                                const queuedUpdate =
                                    this.pendingSkeletalUpdates
                                        .get(sid)
                                        ?.get(srv.id);
                                if (queuedUpdate) {
                                    this.applyServerSkeletalUpdate(
                                        sid,
                                        queuedUpdate,
                                    );
                                }
                                return;
                            }

                            // 0) If this server id is already mapped, ignore (prevents duplicates)
                            if (localPointOf(this.pointServerToLocal, sid, srv.id)) return;

                            // 1) Try to reconcile optimistic create by clientTempId: "<skLocalId>:<pid>"
                            const temp = String(
                                (srv as any).clientTempId ?? ''
                            ).trim();
                            if (temp) {
                                const [skLocalStr, pid] = temp.split(':');
                                const skLocalId = Number(skLocalStr);
                                if (!Number.isNaN(skLocalId) && pid) {
                                    // If our local point exists, just link ids and EXIT (no UI insert)
                                    const hasLocal = this.skeletons().some(
                                        (sk) =>
                                            sk.id === skLocalId &&
                                            !!sk.points[pid]
                                    );
                                    if (hasLocal) {
                                        linkPointIds(this.pointLocalToServer, this.pointServerToLocal, 
                                            sid,
                                            skLocalId,
                                            pid,
                                            srv.id
                                        );
                                        this.tryApplyPendingSkelLock(sid, srv.id);
                                        if (pendingTempEntry && pendingTempKey) {
                                            this.pendingRemoteSkelByTemp.delete(
                                                pendingTempKey
                                            );
                                            this.addRemoteSkelLock(
                                                skLocalId,
                                                {
                                                    by: pendingTempEntry.by,
                                                    pid,
                                                    instanceId:
                                                        pendingTempEntry.instanceId,
                                                },
                                                1
                                            );
                                        }
                                        clearPendingPoint(this.pendingPoints, sid, skLocalId, pid);
                                        const queuedUpdate =
                                            this.pendingSkeletalUpdates
                                                .get(sid)
                                                ?.get(srv.id);
                                        if (queuedUpdate) {
                                            this.applyServerSkeletalUpdate(
                                                sid,
                                                queuedUpdate,
                                            );
                                        }
                                        return;
                                    }
                                }
                            }

                            // 2) No optimistic match -> insert a fresh point+skeleton
                            const color = srv.color ?? '#00e676';
                            const labelId =
                                srv.category ?? this.activeSkelLabelId();
                            const pid = 'p' + this.pointSeq++;
                            const p: Keypoint = {
                                id: pid,
                                x: srv.x_pos ?? 0,
                                y: srv.y_pos ?? 0,
                                v: 2,
                                labelId,
                            };
                            const localSkId = this.idSeq++;

                            this.skeletons.update((arr) => [
                                ...arr,
                                {
                                    id: localSkId,
                                    color,
                                    labelId,
                                    points: { [pid]: p },
                                    edges: [],
                                },
                            ]);
                            linkPointIds(this.pointLocalToServer, this.pointServerToLocal, sid, localSkId, pid, srv.id);
                            this.tryApplyPendingSkelLock(sid, srv.id);
                            if (
                                pendingTempEntry &&
                                pendingTempKey &&
                                pendingTempPid
                            ) {
                                this.pendingRemoteSkelByTemp.delete(
                                    pendingTempKey
                                );
                                this.addRemoteSkelLock(
                                    localSkId,
                                    {
                                        by: pendingTempEntry.by,
                                        pid,
                                        instanceId: pendingTempEntry.instanceId,
                                    },
                                    1
                                );
                            }
                            const queuedUpdate =
                                this.pendingSkeletalUpdates
                                    .get(sid)
                                    ?.get(srv.id);
                            if (queuedUpdate) {
                                this.applyServerSkeletalUpdate(
                                    sid,
                                    queuedUpdate,
                                );
                            }
                            this.requestPaint();
                        }
                    )
                );

                // --- SKELETAL UPDATED (single point + its connections) ---
                offAnn.push(
                    this.observe(
                        this.socket.onSkeletalUpdated(),
                        (srv: any) => {
                            this.logLock('socket:onSkeletalUpdated', srv);
                            const sid = this.currentSlideId();
                            if (!sid || srv?.slideId !== sid) return;
                            this.applyServerSkeletalUpdate(sid, srv);
                        }
                    )
                );

                // --- SKELETON DELETED ---
                offAnn.push(
                    this.observe(
                        this.socket.onSkeletalDeleted(),
                        (srv: any) => {
                            this.logLock('socket:onSkeletalDeleted', srv);
                            const sid = this.currentSlideId();
                            if (!sid) return;

                            const loc = localPointOf(this.pointServerToLocal, 
                                sid,
                                srv.skeletalId || srv.id
                            );
                            if (!loc) return;

                            const { sk: localSkId, pid } = loc;

                            this.skeletons.update((arr) => {
                                const next = arr
                                    .map((sk) => {
                                        if (sk.id !== localSkId) return sk;
                                        const pts = { ...sk.points };
                                        if (!pts[pid]) return sk;
                                        delete pts[pid];

                                        const edges = sk.edges.filter(
                                            ([a, b]) => a !== pid && b !== pid
                                        );
                                        return { ...sk, points: pts, edges };
                                    })
                                    .filter(
                                        (sk) =>
                                            Object.keys(sk.points).length > 0
                                    );
                                return next;
                            });

                            this.unlinkPointId(sid, localSkId, pid);
                            clearPendingPoint(this.pendingPoints, sid, localSkId, pid);

                            const sel = this.selection();
                            if (sel.type === 'point' && sel.id === localSkId && sel.pid === pid) {
                                const stillExists = this.skeletons().some((sk) => sk.id === localSkId);
                                if (stillExists) {
                                    this.selection.set({ type: 'skeleton', id: localSkId });
                                    this.lastEditedSkId = localSkId;
                                } else {
                                    this.selection.set({ type: null, id: null });
                                    if (this.lastEditedSkId === localSkId) this.lastEditedSkId = null;
                                }
                            } else if (sel.type === 'skeleton' && sel.id === localSkId) {
                                const stillExists = this.skeletons().some((sk) => sk.id === localSkId);
                                if (!stillExists) {
                                    this.selection.set({ type: null, id: null });
                                    if (this.lastEditedSkId === localSkId) this.lastEditedSkId = null;
                                }
                            }

                            this.requestPaint();
                            this.updateScreenLabels();
                        }
                    )
                );
            });
        });
    }

    private async loadSlides(projectId: string) {
        this.slidesLoading.set(true);
        this.slidesError.set(null);
        try {
            const list = await this.slideSvc.listSlidesPromise(projectId);
            // Add index here
            const meta: SlideMeta[] = list.map((s, i) => ({
                id: s.id,
                index: i,
            }));
            this.slides.set(meta);

            if (!this.slideIdQ() && meta.length) {
                this.router.navigate([], {
                    relativeTo: this.route,
                    queryParams: { slide: meta[0].id },
                    queryParamsHandling: 'merge',
                    replaceUrl: true,
                });
            }
        } catch (e: any) {
            this.slidesError.set(e?.message ?? 'Failed to load slides');
        } finally {
            this.slidesLoading.set(false);
        }
    }

    private async showSlide(slideId: string) {
        if (!slideId) return;
        const blob = await this.slideSvc.getSlideImageBlob(slideId);

        // REVOKE previous URL first
        if (this.currentImgUrl) {
            URL.revokeObjectURL(this.currentImgUrl);
            this.currentImgUrl = null;
        }

        // Create & assign new URL
        const url = URL.createObjectURL(blob);
        this.currentImgUrl = url;

        // Let onload handle sizes/paint as you already do
        this.imgLoaded.set(false);
        this.img.src = url;
    }

    private async loadAnnotationsForSlide(projectId: string, slideId: string) {
        if (!projectId || !slideId) return;

        const existing = this.annotationsLoading.get(slideId);
        if (existing) return existing;

        const loadPromise = (async () => {
            try {
                const [boxes, skeletals] = await Promise.all([
                    firstValueFrom(
                        this.annotationSvc.getAllBoundingBox(projectId, slideId)
                    ),
                    firstValueFrom(
                        this.annotationSvc.getAllSkeletal(projectId, slideId)
                    ),
                ]);

                if (this.currentSlideId() !== slideId) return;

                this.clearIdMapsForSlide(slideId);
                this.clearPointMapsForSlide(slideId);

                this.seedBoxesFromServer(slideId, boxes ?? []);
                this.seedSkeletalsFromServer(slideId, skeletals ?? []);

                this.selection.set({ type: null, id: null });
                this.requestPaint?.();
                this.updateScreenLabels?.();
            } catch (err) {
                console.error(err);
                this.snack.open('Failed to load annotations', undefined, {
                    duration: 2000,
                });
            } finally {
                this.annotationsLoading.delete(slideId);
            }
        })();

        this.annotationsLoading.set(slideId, loadPromise);
        return loadPromise;
    }

    private persistCurrentSlideState(slideId: string) {
        this.boxesBySlide.set(
            slideId,
            this.boxes().map((b) => ({ ...b }))
        );
        this.skeletonsBySlide.set(
            slideId,
            this.skeletons().map((sk) => ({
                ...sk,
                points: { ...sk.points },
                edges:
                    sk.edges?.map((e) => [e[0], e[1]] as [string, string]) ??
                    [],
            }))
        );
        // optional: stash pan/zoom if you keep it per slide
    }

    private restoreSlideState(slideId: string) {
        this.clearIdMapsForSlide(slideId);
        this.clearPointMapsForSlide(slideId);
        const cachedBoxes = (this.boxesBySlide.get(slideId) ?? []).map(
            (b) => ({ ...b })
        );
        for (const box of cachedBoxes) {
            this.ensureBoxLabelIdForName(box.labelId);
        }
        this.boxes.set(cachedBoxes);

        const cachedSkels = (this.skeletonsBySlide.get(slideId) ?? []).map(
            (sk) => ({
                ...sk,
                points: { ...sk.points },
                edges:
                    sk.edges?.map((e) => [e[0], e[1]] as [string, string]) ??
                    [],
            })
        );
        for (const sk of cachedSkels) {
            this.ensureSkelLabelIdForName(sk.labelId);
            for (const kp of Object.values(sk.points)) {
                this.ensureSkelLabelIdForName(kp.labelId);
            }
        }
        this.skeletons.set(cachedSkels);
        // clear selection on slide switch
        this.selection.set({ type: null, id: null });
        this.requestPaint?.();
    }

    goToSlide(id: string) {
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { slide: id },
            queryParamsHandling: 'merge',
        });
    }

    onTopbarUndo() {
        // forward to your annotation history or use service:
        // this.annotationHistoryService.undo();
    }
    onTopbarRedo() {
        // this.annotationHistoryService.redo();
    }

    /* ---------- View refs ---------- */
    @ViewChild('bgCanvas', { static: true })
    bgCanvasRef!: ElementRef<HTMLCanvasElement>;
    @ViewChild('fgCanvas', { static: true })
    fgCanvasRef!: ElementRef<HTMLCanvasElement>;
    @ViewChild('viewport', { static: true })
    viewportRef!: ElementRef<HTMLDivElement>;
    @ViewChild('stage', { static: false })
    stageRef?: ElementRef<HTMLDivElement>;
    @ViewChild('labelLayer', { static: true })
    labelLayerRef!: ElementRef<HTMLDivElement>;

    /* ---------- Stage (desk) pan + zoom (SCREEN space) ---------- */
    stagePan = signal<{ x: number; y: number }>({ x: 0, y: 0 });
    stageScale = signal<number>(1);

    private stageDragging = false;
    private stageLast = { x: 0, y: 0 };
    private spaceHeld = false;

    isPanMode() {
        return this.currentTool().kind === 'stagePan' || this.spaceHeld;
    }
    isPanning() {
        return this.stageDragging;
    }

    // NEW: label visibility toggles
    showBoxLabels = signal<boolean>(true);
    showPointLabels = signal<boolean>(true);

    onStagePointerDown(e: PointerEvent) {
        // start pan if: middle mouse OR spacebar held OR pan tool is active
        const panRequested =
            e.button === 1 ||
            this.spaceHeld ||
            this.currentTool().kind === 'stagePan';
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
        const stageEl =
            this.stageRef?.nativeElement ??
            (this.viewportRef.nativeElement.closest('.stage') as HTMLElement);
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
        const stageEl =
            this.stageRef?.nativeElement ??
            (this.viewportRef.nativeElement.closest('.stage') as HTMLElement);
        if (!stageEl) return;
        const rect = stageEl.getBoundingClientRect();
        const cx = rect.width / 2,
            cy = rect.height / 2;

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
        if (e.code === 'Space') {
            this.spaceHeld = true;
            e.preventDefault();
            return;
        }
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
    private onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') this.spaceHeld = false;
    };

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
    imageWidth = signal(0);
    imageHeight = signal(0);

    canvasSize = signal<{ w: number; h: number }>({ w: 960, h: 600 });
    private ro?: ResizeObserver;

    /* ---------- Data ---------- */
    boxLabels = signal<LabelDef[]>([
        { id: 'Bird', name: 'Bird' },
        { id: 'Wing', name: 'Wing' },
        { id: 'Head', name: 'Head' },
    ]);
    skelLabels = signal<LabelDef[]>([
        { id: 'Eye', name: 'Eye' },
        { id: 'Beak', name: 'Beak' },
        { id: 'Wing Tip', name: 'Wing Tip' },
    ]);

    // Active defaults (creation)
    activeLabelId = signal<string>(this.boxLabels()[0]?.id ?? '');
    activeSkelLabelId = signal<string>(this.skelLabels()[0]?.id ?? '');

    // Inputs for "Add label" forms
    newBoxLabelName = signal<string>('');
    newSkelLabelName = signal<string>('');

    activeColor = signal<string>('#ff8c00'); // new boxes
    activeSkelColor = signal<string>('#00e676'); // default color for NEW skeleton bones

    boxes = signal<BoxAnn[]>([]);

    skeletons = signal<SkeletonAnn[]>([]);
    private idSeq = 1;
    private pointSeq = 1;

    selection = signal<Selection>({ type: null, id: null });
    sidenavOpen = true;

    /* ---------- Screen-space label chips for BOXES only ---------- */
    boxLabelChips = signal<LabelChip[]>([]);
    pointLabelChips = signal<LabelChip[]>([]);

    /* ---------- Tools ---------- */
    private boxTool: Tool = this.makeBoxTool();
    private selectToolObj: Tool = this.makeSelectTool(); // now supports skeleton + point select/move/delete
    private skeletonTool: Tool = this.makeSkeletonTool(); // custom behavior per spec
    private stagePanTool: Tool = this.makeStagePanTool();

    currentTool = signal<Tool>(this.selectToolObj);
    selectTool(kind: ToolKind) {
        this.currentTool.set(
            kind === 'box'
                ? this.boxTool
                : kind === 'skeleton'
                ? this.skeletonTool
                : kind === 'stagePan'
                ? this.stagePanTool
                : this.selectToolObj
        );
        this.requestPaint();
    }

    /* ---------- Paint scheduling ---------- */
    private needsPaint = false;
    requestPaint = () => {
        if (this.needsPaint) return;
        this.needsPaint = true;
        requestAnimationFrame(() => {
            this.needsPaint = false;
            this.paint();
        });
    };

    /* ---------- Lifecycle ---------- */
    ngAfterViewInit() {
        this.resizeToContainer();

        this.ro = new ResizeObserver(() => {
            this.resizeToContainer();
            this.fitDeskToView();
            this.updateScreenLabels();
        });
        const stageEl =
            this.stageRef?.nativeElement ??
            (this.viewportRef.nativeElement.closest('.stage') as HTMLElement);
        if (stageEl) this.ro.observe(stageEl);
        this.ro.observe(this.viewportRef.nativeElement);

        window.addEventListener('keydown', this.onKeyDown, { passive: false });
        window.addEventListener('keyup', this.onKeyUp, { passive: true });
    }

    ngOnDestroy() {
        this.ro?.disconnect();
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);

        this.releaseAllLocks();
        this.pendingRemoteBoxLocks.clear();
        this.pendingRemoteSkelLocks.clear();

        if (this.currentImgUrl) {
            URL.revokeObjectURL(this.currentImgUrl);
            this.currentImgUrl = null;
        }

        try {
            const sid = this.currentSlideId();
            if (sid) this.socket.leaveSlide(sid);
        } catch {}
        this.disposeSocketHandlers();
        this.isConnected.set(false);
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
        const sid = this.currentSlideId();
        if (sid) {
            const emittedBoxIds = new Set<string>();
            for (const box of this.boxes()) {
                const srvId = this.boxServerId(sid, box.id);
                if (srvId && !emittedBoxIds.has(srvId)) {
                    this.socket.deleteBoundingBox(sid, srvId);
                    emittedBoxIds.add(srvId);
                }
            }

            const pointMap = this.pointLocalToServer.get(sid);
            if (pointMap) {
                const emittedPoints = new Set<string>();
                for (const srvId of pointMap.values()) {
                    if (srvId && !emittedPoints.has(srvId)) {
                        this.socket.deleteSkeletal(sid, srvId);
                        emittedPoints.add(srvId);
                    }
                }
            }

            this.clearIdMapsForSlide(sid);
            this.clearPointMapsForSlide(sid);
            this.boxesBySlide.set(sid, []);
            this.skeletonsBySlide.set(sid, []);
            this.lastEditedSkId = null;
        }

        this.boxes.set([]);
        this.skeletons.set([]);
        this.selection.set({ type: null, id: null });
        this.requestPaint();
        this.updateScreenLabels();
    }

    onExport() {
        const payload = {
            image: {
                width: this.imageWidth(),
                height: this.imageHeight(),
                file: this.img.src,
            },
            boxLabels: this.boxLabels(), // <- boxes' label set
            skelLabels: this.skelLabels(), // <- keypoints' label set
            boxes: this.boxes(),
            skeletons: this.skeletons(),
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = 'annotations.json';
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
        this.snack.open('Exported annotations.json', undefined, {
            duration: 1600,
        });
    }

    onActiveColorInput(e: Event) {
        const value =
            (e.target as HTMLInputElement)?.value ?? this.activeColor();
        this.activeColor.set(value);
    }

    /* ---------- Selected helpers ---------- */
    selectedBox(): BoxAnn | null {
        const s = this.selection();
        if (s.type !== 'box' || s.id == null) return null;
        return this.boxes().find((b) => b.id === s.id) ?? null;
    }

    selectedSkeleton(): SkeletonAnn | null {
        const s = this.selection();
        if (s.type === 'skeleton' && s.id != null) {
            return this.skeletons().find((sk) => sk.id === s.id) ?? null;
        }
        if (s.type === 'point' && s.id != null) {
            return this.skeletons().find((sk) => sk.id === s.id) ?? null;
        }
        return null;
    }

    selectedPoint(): { sk: SkeletonAnn; kp: Keypoint } | null {
        const s = this.selection();
        if (s.type !== 'point' || s.id == null) return null;
        const sk = this.skeletons().find((x) => x.id === s.id);
        if (!sk) return null;
        const kp = sk.points[s.pid];
        return kp ? { sk, kp } : null;
    }

    /* ---------- Sidebar bindings for BOX ---------- */
    selectedBoxLabelId() {
        return this.selectedBox()?.labelId ?? this.activeLabelId();
    }
    selectedBoxColor() {
        return this.selectedBox()?.color ?? this.activeColor();
    }

    onSelectedLabelChange(newId: string) {
        const s = this.selection();
        if (s.type !== 'box' || s.id == null) return;
        this.boxes.update((arr) =>
            arr.map((b) => (b.id === s.id ? { ...b, labelId: newId } : b))
        );
        this.requestPaint();
        this.updateScreenLabels();
        this.emitBoxState(s.id);
    }
    onSelectedColorInput(e: Event) {
        const value = (e.target as HTMLInputElement)?.value;
        const s = this.selection();
        if (!value || s.type !== 'box' || s.id == null) return;
        this.boxes.update((arr) =>
            arr.map((b) => (b.id === s.id ? { ...b, color: value } : b))
        );
        this.requestPaint();
        this.updateScreenLabels();
        this.emitBoxState(s.id);
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
            this.skeletons.update((arr) =>
                arr.map((sk) => (sk.id === s.id ? { ...sk, color: value } : sk))
            );
            this.requestPaint();
            this.emitSkeletonAppearanceFor(s.id);
            this.updateScreenLabels();
        } else if (s.type === 'point' && s.id != null) {
            this.skeletons.update((arr) =>
                arr.map((sk) => (sk.id === s.id ? { ...sk, color: value } : sk))
            );
            this.requestPaint();
            this.emitSkeletonAppearanceFor(s.id);
            this.updateScreenLabels();
        }
    }

    onActiveBoxColorInput(e: Event) {
        this.activeColor.set(
            (e.target as HTMLInputElement)?.value ?? this.activeColor()
        );
    }
    onActiveBoxLabelChange(newId: string) {
        this.activeLabelId.set(newId);
    }

    onActiveSkelColorInput(e: Event) {
        const newColor =
            (e.target as HTMLInputElement)?.value ?? this.activeSkelColor();
        this.activeSkelColor.set(newColor);
        const sid = this.currentSlideId();
        const skId = this.getTargetSkeletonId();
        if (sid && skId != null) {
            const sk = this.skeletons().find((s) => s.id === skId);
            if (sk) {
                this.skeletons.update((arr) =>
                    arr.map((item) =>
                        item.id === skId ? { ...item, color: newColor } : item
                    )
                );
                this.emitSkeletonAppearanceFor(skId);
                this.updateScreenLabels();
            }
        }
    }
    onActiveSkelLabelChange(newId: string) {
        this.activeSkelLabelId.set(newId);
        const sid = this.currentSlideId();
        const skId = this.getTargetSkeletonId();
        if (sid && skId != null) {
            const sk = this.skeletons().find((s) => s.id === skId);
            if (sk) {
                for (const pid of Object.keys(sk.points)) {
                    const srv = serverPointId(this.pointLocalToServer, sid, sk.id, pid);
                    if (srv) {
                        this.socket.updateSkeletal(sid, srv, {
                            color: sk.color,
                            category: this.skelCategoryValue(sk.labelId),
                        });
                    }
                }
            }
        }
    }

    private normalizeLabelName(name: string | null | undefined): string {
        return (name ?? '').trim();
    }

    private categoryNameOrFallback(
        name: string | null | undefined,
        fallback: string,
    ): string {
        const normalized = this.normalizeLabelName(name);
        return normalized || fallback;
    }

    private ensureBoxLabelIdForName(name: string | null | undefined): string {
        const display = this.categoryNameOrFallback(name, 'Unknown');
        const current = this.boxLabels();
        const existing = current.find(
            (l) => l.name.toLowerCase() === display.toLowerCase(),
        );
        if (existing) {
            return existing.id;
        }
        const id = display;
        this.boxLabels.set([...current, { id, name: display }]);
        if (!this.activeLabelId()) {
            this.activeLabelId.set(id);
        }
        return id;
    }

    private ensureSkelLabelIdForName(name: string | null | undefined): string {
        const display = this.categoryNameOrFallback(name, 'Unknown');
        const current = this.skelLabels();
        const existing = current.find(
            (l) => l.name.toLowerCase() === display.toLowerCase(),
        );
        if (existing) {
            return existing.id;
        }
        const id = display;
        this.skelLabels.set([...current, { id, name: display }]);
        if (!this.activeSkelLabelId()) {
            this.activeSkelLabelId.set(id);
        }
        return id;
    }

    private boxCategoryValue(labelId: string | null | undefined): string {
        const match = labelId
            ? this.boxLabels().find(
                  (l) => l.id.toLowerCase() === labelId.toLowerCase(),
              )
            : undefined;
        return match?.name ?? this.categoryNameOrFallback(labelId, 'Unknown');
    }

    private skelCategoryValue(labelId: string | null | undefined): string {
        const match = labelId
            ? this.skelLabels().find(
                  (l) => l.id.toLowerCase() === labelId.toLowerCase(),
              )
            : undefined;
        return match?.name ?? this.categoryNameOrFallback(labelId, 'Unknown');
    }

    boxLabelName = (id: string) =>
        this.boxLabels().find((l) => l.id === id)?.name ?? id;
    skelLabelName = (id: string) =>
        this.skelLabels().find((l) => l.id === id)?.name ?? id;

    isBoxLabelUsed(id: string): boolean {
        return this.boxes().some((b) => b.labelId === id);
    }
    isSkelLabelUsed(id: string): boolean {
        return this.skeletons().some((sk) =>
            Object.values(sk.points).some((kp) => kp.labelId === id)
        );
    }

    boxLabelNameById(id: string | null | undefined): string {
        if (!id) return '-';
        return this.boxLabels().find((l) => l.id === id)?.name ?? '-';
    }
    skelLabelNameById(id: string | null | undefined): string {
        if (!id) return '-';
        return this.skelLabels().find((l) => l.id === id)?.name ?? '-';
    }

    // which option row is currently hovered (any dropdown)
    hoveredLabelId = signal<string | null>(null);

    // convenience for showing the check
    isSelectedOption(
        id: string,
        currentId: string | null | undefined
    ): boolean {
        return !!currentId && id === currentId;
    }

    addBoxLabel() {
        const name = this.normalizeLabelName(this.newBoxLabelName());
        if (!name) return;
        if (
            this.boxLabels().some(
                (l) => l.name.toLowerCase() === name.toLowerCase()
            )
        ) {
            this.snack.open(
                'A box label with that name already exists.',
                undefined,
                { duration: 1500 }
            );
            return;
        }

        const id = name;
        this.boxLabels.update((arr) => [...arr, { id, name }]);
        // if no active or the user just added the first, set active
        if (!this.activeLabelId() || this.boxLabels().length === 1)
            this.activeLabelId.set(id);
        this.newBoxLabelName.set('');
    }

    addSkelLabel() {
        const name = this.normalizeLabelName(this.newSkelLabelName());
        if (!name) return;
        if (
            this.skelLabels().some(
                (l) => l.name.toLowerCase() === name.toLowerCase()
            )
        ) {
            this.snack.open(
                'A keypoint label with that name already exists.',
                undefined,
                { duration: 1500 }
            );
            return;
        }

        const id = name;
        this.skelLabels.update((arr) => [...arr, { id, name }]);
        if (!this.activeSkelLabelId() || this.skelLabels().length === 1)
            this.activeSkelLabelId.set(id);
        const sid = this.currentSlideId();
        const skId = this.getTargetSkeletonId();
        if (sid && skId != null) {
            const sk = this.skeletons().find((s) => s.id === skId);
            if (sk) {
                for (const pid of Object.keys(sk.points)) {
                    const srv = serverPointId(this.pointLocalToServer, sid, sk.id, pid);
                    if (srv) {
                        this.socket.updateSkeletal(sid, srv, {
                            color: sk.color,
                            category: this.skelCategoryValue(sk.labelId),
                        });
                    }
                }
            }
        }
        this.newSkelLabelName.set('');
    }

    // --- Add: compact add/delete handlers (BOX) ---
    addBoxLabelPrompt() {
        const name = this.normalizeLabelName(
            window.prompt('New box label name?') || ''
        );
        if (!name) return;

        // case-insensitive duplicate name check
        if (
            this.boxLabels().some(
                (l) => l.name.toLowerCase() === name.toLowerCase()
            )
        ) {
            this.snack.open(
                'A box label with that name already exists.',
                undefined,
                { duration: 1600 }
            );
            return;
        }

        const id = name;
        this.boxLabels.update((arr) => [...arr, { id, name }]);
        if (!this.activeLabelId()) this.activeLabelId.set(id);
    }

    // --- Add: compact add/delete handlers (SKELETON KEYPOINT) ---
    addSkelLabelPrompt() {
        const name = this.normalizeLabelName(
            window.prompt('New keypoint label name?') || ''
        );
        if (!name) return;

        if (
            this.skelLabels().some(
                (l) => l.name.toLowerCase() === name.toLowerCase()
            )
        ) {
            this.snack.open(
                'A keypoint label with that name already exists.',
                undefined,
                { duration: 1600 }
            );
            return;
        }

        const id = name;
        this.skelLabels.update((arr) => [...arr, { id, name }]);
        if (!this.activeSkelLabelId()) {
            this.activeSkelLabelId.set(id);
            const sid = this.currentSlideId();
            const skId = this.getTargetSkeletonId();
            if (sid && skId != null) {
                const sk = this.skeletons().find((s) => s.id === skId);
                if (sk) {
                    for (const pid of Object.keys(sk.points)) {
                        const srv = serverPointId(this.pointLocalToServer, sid, sk.id, pid);
                        if (srv) {
                            this.socket.updateSkeletal(sid, srv, {
                                color: sk.color,
                                category: this.skelCategoryValue(sk.labelId),
                            });
                        }
                    }
                }
            }
        }
    }

    // BOX
    deleteBoxLabelCompact(id: string) {
        // block if this is the last label
        if (this.boxLabels().length <= 1) {
            this.snack.open(
                'You must keep at least one box label.',
                undefined,
                { duration: 1800 }
            );
            return;
        }
        // block if label is in use
        if (this.isBoxLabelUsed(id)) {
            this.snack.open(
                'Cannot delete: label is used by a box annotation.',
                undefined,
                { duration: 1800 }
            );
            return;
        }
        const next = this.boxLabels().filter((l) => l.id !== id);
        this.boxLabels.set(next);
        if (this.activeLabelId() === id)
            this.activeLabelId.set(next[0]?.id ?? '');
    }

    // If you still call these "full" versions anywhere, patch them too:
    deleteBoxLabel(id: string) {
        if (this.boxLabels().length <= 1) {
            this.snack.open(
                'You must keep at least one box label.',
                undefined,
                { duration: 1800 }
            );
            return;
        }
        if (this.isBoxLabelUsed(id)) {
            this.snack.open(
                'Cannot delete: label is used by a box annotation.',
                undefined,
                { duration: 1800 }
            );
            return;
        }
        this.boxLabels.update((arr) => arr.filter((l) => l.id !== id));
        if (this.activeLabelId() === id)
            this.activeLabelId.set(this.boxLabels()[0]?.id ?? '');
    }

    // SKELETON
    deleteSkelLabelCompact(id: string) {
        if (this.skelLabels().length <= 1) {
            this.snack.open(
                'You must keep at least one keypoint label.',
                undefined,
                { duration: 1800 }
            );
            return;
        }
        if (this.isSkelLabelUsed(id)) {
            this.snack.open(
                'Cannot delete: label is used by a keypoint.',
                undefined,
                { duration: 1800 }
            );
            return;
        }
        const next = this.skelLabels().filter((l) => l.id !== id);
        this.skelLabels.set(next);
        if (this.activeSkelLabelId() === id) {
            this.activeSkelLabelId.set(next[0]?.id ?? '');
            const sid = this.currentSlideId();
            const skId = this.getTargetSkeletonId();
            if (sid && skId != null) {
                const sk = this.skeletons().find((s) => s.id === skId);
                if (sk) {
                    for (const pid of Object.keys(sk.points)) {
                        const srv = serverPointId(this.pointLocalToServer, sid, sk.id, pid);
                        if (srv) {
                            this.socket.updateSkeletal(sid, srv, {
                                color: sk.color,
                                category: this.skelCategoryValue(sk.labelId),
                            });
                        }
                    }
                }
            }
        }
    }

    deleteSkelLabel(id: string) {
        if (this.skelLabels().length <= 1) {
            this.snack.open(
                'You must keep at least one keypoint label.',
                undefined,
                { duration: 1800 }
            );
            return;
        }
        if (this.isSkelLabelUsed(id)) {
            this.snack.open(
                'Cannot delete: label is used by a keypoint.',
                undefined,
                { duration: 1800 }
            );
            return;
        }
        this.skelLabels.update((arr) => arr.filter((l) => l.id !== id));
        if (this.activeSkelLabelId() === id) {
            this.activeSkelLabelId.set(this.skelLabels()[0]?.id ?? '');
            const sid = this.currentSlideId();
            const skId = this.getTargetSkeletonId();
            if (sid && skId != null) {
                const sk = this.skeletons().find((s) => s.id === skId);
                if (sk) {
                    for (const pid of Object.keys(sk.points)) {
                        const srv = serverPointId(this.pointLocalToServer, sid, sk.id, pid);
                        if (srv) {
                            this.socket.updateSkeletal(sid, srv, {
                                color: sk.color,
                                category: this.skelCategoryValue(sk.labelId),
                            });
                        }
                    }
                }
            }
        }
    }

    // BOX
    canDeleteBoxLabel(id: string): boolean {
        return this.boxLabels().length > 1 && !this.isBoxLabelUsed(id);
    }
    boxLabelTooltip(id: string): string {
        if (this.boxLabels().length <= 1)
            return 'At least one label is required';
        if (this.isBoxLabelUsed(id)) return 'In use - cannot delete';
        return 'Delete label';
    }

    // SKELETON
    canDeleteSkelLabel(id: string): boolean {
        return this.skelLabels().length > 1 && !this.isSkelLabelUsed(id);
    }
    skelLabelTooltip(id: string): string {
        if (this.skelLabels().length <= 1)
            return 'At least one label is required';
        if (this.isSkelLabelUsed(id)) return 'In use - cannot delete';
        return 'Delete label';
    }

    pointLabelId(): string {
        const sp = this.selectedPoint();
        return sp?.kp.labelId ?? this.activeSkelLabelId();
    }
    onPointLabelChange(newId: string) {
        const s = this.selection();
        if (s.type !== 'point') return;
        const sid = this.currentSlideId();
        this.skeletons.update((arr) =>
            arr.map((sk) => {
                if (sk.id !== s.id) return sk;
                const kp = sk.points[s.pid];
                if (!kp) return sk;
                return {
                    ...sk,
                    points: {
                        ...sk.points,
                        [s.pid]: { ...kp, labelId: newId },
                    },
                };
            })
        );
        this.requestPaint();
        this.updateScreenLabels();
        if (!sid) return;
        const sk = this.skeletons().find((item) => item.id === s.id);
        if (!sk) return;
        const srvId = serverPointId(
            this.pointLocalToServer,
            sid,
            sk.id,
            s.pid
        );
        if (!srvId) return;
        const point = sk.points[s.pid];
        const neighborIds = this.serverNeighborIds(sid, sk, s.pid);
        this.socket.updateSkeletal(sid, srvId, {
            category: this.skelCategoryValue(point.labelId),
            color: sk.color,
            key_points: neighborIds.length ? neighborIds : null,
        });
    }

    isSelected(type: 'box' | 'skeleton', id: number | string) {
        const s = this.selection();
        if (type === 'box')
            return s.type === 'box' && s.id === Number(id);
        if (type === 'skeleton')
            return (s.type === 'skeleton' || s.type === 'point') &&
                s.id === Number(id);
        return false;
    }
    selectEntity(type: 'box' | 'skeleton', id: number | string) {
        const numericId = Number(id);
        if (type === 'box') this.selection.set({ type: 'box', id: numericId });
        else {
            this.selection.set({ type: 'skeleton', id: numericId });
            this.lastEditedSkId = numericId;
        }
        this.currentTool.set(this.selectToolObj);
        this.requestPaint();
    }

    /* ---------- Canvas pointer handlers ---------- */
    onPointerDown(e: PointerEvent) {
        const el = e.currentTarget as HTMLElement;

        // If pan tool is active (or middle/space), let the stage handler do it
        if (
            this.currentTool().kind === 'stagePan' ||
            e.button === 1 ||
            this.spaceHeld
        ) {
            // Do nothing here; onStagePointerDown handles the drag
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
        if (this.stageDragging) {
            this.moveStagePan(e);
            this.updateScreenLabels();
            return;
        }
        this.currentTool().onMove(e, this.toolCtx());
    }
    onPointerUp(e: PointerEvent) {
        const el = e.currentTarget as HTMLElement;
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
            this.viewportRef.nativeElement.closest(
                '.stage'
            )) as HTMLElement | null;
        if (!stageEl) return;

        const rect = stageEl.getBoundingClientRect();
        const { pTop, pRight, pBottom, pLeft } = this.getStagePadding(stageEl);

        const innerW = Math.max(0, rect.width - pLeft - pRight);
        const innerH = Math.max(0, rect.height - pTop - pBottom);
        const cw = this.canvasSize().w,
            ch = this.canvasSize().h;
        if (!cw || !ch || !innerW || !innerH) return;

        const s = Math.min(innerW / cw, innerH / ch) * 0.95;
        this.stageScale.set(s);

        const panX = pLeft + (innerW - cw * s) / 2;
        const panY = pTop + (innerH - ch * s) / 2;
        this.stagePan.set({ x: panX, y: panY });
    }

    /* ---------- Canvas sizing ---------- */
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

    /* ---------- Painting ---------- */
    private paint() {
        const bg = this.bgCanvasRef.nativeElement;
        const fg = this.fgCanvasRef.nativeElement;
        const gBg = bg.getContext('2d')!;
        const g = fg.getContext('2d')!;

        // Ensure crisp pixels
        this.ensureDevicePixels(bg);
        this.ensureDevicePixels(fg);

        // BACKGROUND
        gBg.setTransform(1, 0, 0, 1, 0, 0);
        gBg.clearRect(0, 0, bg.width, bg.height);

        if (this.imgLoaded()) {
            gBg.imageSmoothingEnabled = true;
            gBg.drawImage(this.img, 0, 0, bg.width, bg.height);
        } else {
            // (optional) checkerboard while waiting
            const size = 16;
            for (let y = 0; y < bg.height; y += size) {
                for (let x = 0; x < bg.width; x += size) {
                    gBg.fillStyle =
                        (x / size + y / size) % 2 === 0 ? '#111' : '#161616';
                    gBg.fillRect(x, y, size, size);
                }
            }
        }

        // OVERLAY in image space
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, fg.width, fg.height);

        const iw = Math.max(1, this.imageWidth());
        const ih = Math.max(1, this.imageHeight());
        const sx = fg.width / iw;
        const sy = fg.height / ih;

        // Stable stroke & handle size (~2px stroke, ~6px handles on screen)
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const s = this.stageScale();
        const cssStroke = 2,
            cssHandle = 6;
        const lw = Math.max(
            1,
            Math.round((cssStroke * dpr) / Math.max(0.5, s))
        );
        const handleR = Math.max(
            3,
            Math.round((cssHandle * dpr) / Math.max(0.5, s))
        );

        // boxes
        for (const b of this.boxes()) {
            const locked = this.isBoxLockedForMe(b.id);
            g.lineWidth = lw;
            g.setLineDash(locked ? [8, 6] : []);
            g.globalAlpha = locked ? 0.5 : 1;
            g.strokeStyle = b.color;
            g.strokeRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy);
        }
        g.setLineDash([]);
        g.globalAlpha = 1; // reset
        // selected box handles
        const selBox = this.selectedBox();
        if (selBox) {
            const corners = this.getBoxCornerCanvasPoints(selBox, sx, sy);
            g.fillStyle = '#fff';
            g.strokeStyle = selBox.color;
            for (const c of corners) {
                g.beginPath();
                g.arc(c.x, c.y, handleR, 0, Math.PI * 2);
                g.fill();
                g.stroke();
            }
        }

        // skeletons: draw bones (lines) then points (circles)
        for (const sk of this.skeletons()) {
            const locked = this.isSkelLockedForMe(sk.id);
            g.lineWidth = lw;
            g.setLineDash(locked ? [8, 6] : []);
            g.globalAlpha = locked ? 0.5 : 1;
            g.strokeStyle = sk.color;

            // bones
            for (const [a, b] of sk.edges) {
                const pa = sk.points[a],
                    pb = sk.points[b];
                if (!pa || !pb) continue;
                g.beginPath();
                g.moveTo(pa.x * sx, pa.y * sy);
                g.lineTo(pb.x * sx, pb.y * sy);
                g.stroke();
            }

            // points
            for (const kp of Object.values(sk.points)) {
                g.beginPath();
                g.fillStyle = '#ffffff';
                g.strokeStyle = sk.color;
                g.arc(kp.x * sx, kp.y * sy, handleR, 0, Math.PI * 2);
                g.fill();
                g.stroke();
            }
        }
        g.setLineDash([]);
        g.globalAlpha = 1;

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
        if (c.width !== w || c.height !== h) {
            c.width = w;
            c.height = h;
        }
    }
    private viewportRect() {
        return this.fgCanvasRef.nativeElement.getBoundingClientRect();
    }
    private resizeToContainer() {
        this.ensureDevicePixels(this.bgCanvasRef.nativeElement);
        this.ensureDevicePixels(this.fgCanvasRef.nativeElement);
        this.requestPaint();
    }

    /** Client -> IMAGE px */
    private screenToImage(clientX: number, clientY: number) {
        const rect = this.viewportRect();
        const lx = clientX - rect.left;
        const ly = clientY - rect.top;
        const iw = this.imageWidth(),
            ih = this.imageHeight();
        const sx = iw / Math.max(1, rect.width);
        const sy = ih / Math.max(1, rect.height);
        return { x: lx * sx, y: ly * sy };
    }
    private clampToImage(p: { x: number; y: number }) {
        const iw = this.imageWidth(),
            ih = this.imageHeight();
        return {
            x: Math.min(Math.max(0, p.x), Math.max(0, iw)),
            y: Math.min(Math.max(0, p.y), Math.max(0, ih)),
        };
    }

    private updateScreenLabels() {
        const stageEl =
            this.stageRef?.nativeElement ??
            (this.viewportRef.nativeElement.closest('.stage') as HTMLElement);
        if (!stageEl || !this.imgLoaded()) {
            this.boxLabelChips.set([]);
            this.pointLabelChips.set([]);
            return;
        }

        const stageRect = stageEl.getBoundingClientRect();
        const canvasRect =
            this.fgCanvasRef.nativeElement.getBoundingClientRect();
        const layerRect =
            this.labelLayerRef.nativeElement.getBoundingClientRect();
        const iw = this.imageWidth(),
            ih = this.imageHeight();
        const sx = canvasRect.width / Math.max(1, iw);
        const sy = canvasRect.height / Math.max(1, ih);

        const chipH = 20;
        const chipW = 200;
        const margin = 6;

        /* ---- BOX LABELS ---- */
        const boxesOut: LabelChip[] = this.showBoxLabels()
            ? this.boxes().map((b) => {
                  const bx = canvasRect.left + b.x * sx;
                  const by = canvasRect.top + b.y * sy;
                  const bw = b.w * sx,
                      bh = b.h * sy;

                  let L = bx,
                      T = by - chipH - margin; // above top-left
                  if (T < stageRect.top + 4) T = by + bh + margin; // flip below
                  if (L < stageRect.left + 4) L = stageRect.left + 4;
                  const maxLeft = stageRect.right - 4 - chipW;
                  if (L > maxLeft) L = maxLeft;

                  const left = L - layerRect.left,
                      top = T - layerRect.top;

                  return {
                      id: String(b.id),
                      labelId: b.labelId,
                      labelName: this.boxLabelName(b.labelId),
                      color: b.color,
                      left,
                      top,
                      maxWidth: chipW,
                  } as LabelChip;
              })
            : [];

        /* ---- POINT LABELS ---- */
        const ptsOut: LabelChip[] = [];
        if (this.showPointLabels()) {
            for (const sk of this.skeletons()) {
                for (const kp of Object.values(sk.points)) {
                    const px = canvasRect.left + kp.x * sx;
                    const py = canvasRect.top + kp.y * sy;

                    let L = px - 4,
                        T = py - chipH - margin; // above point, slight left
                    if (T < stageRect.top + 4) T = py + margin + 8; // flip below if clipped
                    if (L < stageRect.left + 4) L = stageRect.left + 4;
                    const maxLeft = stageRect.right - 4 - chipW;
                    if (L > maxLeft) L = maxLeft;

                    const left = L - layerRect.left,
                        top = T - layerRect.top;

                    // border uses skeleton color; swatch uses the point label's color
                    ptsOut.push({
                        id: `${sk.id}:${kp.id}`,
                        labelId: kp.labelId,
                        labelName: this.skelLabelName(kp.labelId),
                        color: sk.color,
                        left,
                        top,
                        maxWidth: chipW,
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
            { x: b.x * sx, y: b.y * sy, key: 'nw' },
            { x: (b.x + b.w) * sx, y: b.y * sy, key: 'ne' },
            { x: b.x * sx, y: (b.y + b.h) * sy, key: 'sw' },
            { x: (b.x + b.w) * sx, y: (b.y + b.h) * sy, key: 'se' },
        ] as const;
    }
    private hitTestBorder(
        box: BoxAnn,
        clientX: number,
        clientY: number,
        tolPx = 6
    ): boolean {
        const rect = this.viewportRect();
        const sx = rect.width / Math.max(1, this.imageWidth());
        const sy = rect.height / Math.max(1, this.imageHeight());
        const x = box.x * sx,
            y = box.y * sy,
            w = box.w * sx,
            h = box.h * sy;

        const cx = clientX - rect.left,
            cy = clientY - rect.top;
        const onLeft =
            Math.abs(cx - x) <= tolPx && cy >= y - tolPx && cy <= y + h + tolPx;
        const onRight =
            Math.abs(cx - (x + w)) <= tolPx &&
            cy >= y - tolPx &&
            cy <= y + h + tolPx;
        const onTop =
            Math.abs(cy - y) <= tolPx && cx >= x - tolPx && cx <= x + w + tolPx;
        const onBottom =
            Math.abs(cy - (y + h)) <= tolPx &&
            cx >= x - tolPx &&
            cx <= x + w + tolPx;
        return onLeft || onRight || onTop || onBottom;
    }
    private hitTestCorner(
        box: BoxAnn,
        clientX: number,
        clientY: number,
        radiusPx = 8
    ): 'nw' | 'ne' | 'sw' | 'se' | null {
        const rect = this.viewportRect();
        const sx = rect.width / Math.max(1, this.imageWidth());
        const sy = rect.height / Math.max(1, this.imageHeight());
        const corners = this.getBoxCornerCanvasPoints(box, sx, sy);
        const cx = clientX - rect.left,
            cy = clientY - rect.top;
        for (const c of corners) {
            const dx = cx - c.x,
                dy = cy - c.y;
            if (dx * dx + dy * dy <= radiusPx * radiusPx) return c.key;
        }
        return null;
    }

    /* ---------- Skeleton math & hit-tests ---------- */
    private hitRadiusPx = 10;

    private forEachSkeletonPoint<T>(
        fn: (sk: SkeletonAnn, pid: string, kp: Keypoint) => T | void
    ): void {
        for (const sk of this.skeletons()) {
            for (const [pid, kp] of Object.entries(sk.points)) {
                const r = fn(sk, pid, kp);
                if (r !== undefined) return;
            }
        }
    }

    private hitTestPoint(
        clientX: number,
        clientY: number
    ): { skId: Id; pid: string } | null {
        const rect = this.viewportRect();
        const sx = rect.width / Math.max(1, this.imageWidth());
        const sy = rect.height / Math.max(1, this.imageHeight());
        const cx = clientX - rect.left,
            cy = clientY - rect.top;

        let found: { skId: Id; pid: string } | null = null;
        this.forEachSkeletonPoint((sk, pid, kp) => {
            const px = kp.x * sx,
                py = kp.y * sy;
            const dx = cx - px,
                dy = cy - py;
            if (dx * dx + dy * dy <= this.hitRadiusPx * this.hitRadiusPx) {
                found = { skId: sk.id, pid };
            }
        });
        return found;
    }

    private segmentHit(
        clientX: number,
        clientY: number,
        ax: number,
        ay: number,
        bx: number,
        by: number,
        tol = 6
    ): boolean {
        // distance from point to segment in screen px
        const px = clientX,
            py = clientY;
        const dx = bx - ax,
            dy = by - ay;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.hypot(px - ax, py - ay) <= tol;
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const mx = ax + t * dx,
            my = ay + t * dy;
        return Math.hypot(px - mx, py - my) <= tol;
    }

    private hitTestBone(clientX: number, clientY: number): { skId: Id } | null {
        const rect = this.viewportRect();
        const sx = rect.width / Math.max(1, this.imageWidth());
        const sy = rect.height / Math.max(1, this.imageHeight());
        const cx = clientX - rect.left,
            cy = clientY - rect.top;

        for (const sk of this.skeletons()) {
            for (const [a, b] of sk.edges) {
                const pa = sk.points[a],
                    pb = sk.points[b];
                if (!pa || !pb) continue;
                const ax = pa.x * sx,
                    ay = pa.y * sy,
                    bx = pb.x * sx,
                    by = pb.y * sy;
                if (this.segmentHit(cx, cy, ax, ay, bx, by, 6))
                    return { skId: sk.id };
            }
        }
        return null;
    }

    /* ---------- Tools ---------- */
    private makeStagePanTool(): Tool {
        return {
            kind: 'stagePan',
            onDown: (e) => {
                this.beginStagePan(e.currentTarget as HTMLElement, e);
            },
            onMove: (e) => {
                if (this.stageDragging) {
                    this.moveStagePan(e);
                    this.updateScreenLabels();
                }
            },
            onUp: (e) => {
                (e.currentTarget as HTMLElement).releasePointerCapture?.(
                    e.pointerId
                );
                this.stageDragging = false;
            },
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
                startImg = ctx.clampToImage(
                    ctx.screenToImage(e.clientX, e.clientY)
                );
                const id = this.idSeq++;
                tempId = id;
                const newBox: BoxAnn = {
                    id,
                    x: startImg.x,
                    y: startImg.y,
                    w: 1,
                    h: 1,
                    labelId: ctx.activeLabelId,
                    color: ctx.activeColor,
                    isPending: true,
                };
                this.boxes.update((list) => [...list, newBox]);
                this.selection.set({ type: 'box', id });
                ctx.requestPaint();
                this.updateScreenLabels();
            },
            onMove: (e, ctx) => {
                if (!creating || tempId == null) return;
                const cur = ctx.clampToImage(
                    ctx.screenToImage(e.clientX, e.clientY)
                );
                const x = Math.min(startImg.x, cur.x);
                const y = Math.min(startImg.y, cur.y);
                const w = Math.max(1, Math.abs(cur.x - startImg.x));
                const h = Math.max(1, Math.abs(cur.y - startImg.y));
                this.boxes.update((list) =>
                    list.map((bb) =>
                        bb.id === tempId ? { ...bb, x, y, w, h } : bb
                    )
                );
                ctx.requestPaint();
                this.updateScreenLabels();
            },
            onUp: (_e, ctx) => {
                creating = false;
                if (tempId != null) {
                    const sid = this.currentSlideId();
                    const uid = this.me();
                    if (sid && uid) {
                        // EMIT CREATE with clientTempId to reconcile
                        const box = this.boxes().find((b) => b.id === tempId);
                        if (box) {
                            markPendingBox(this.pendingBoxes, sid, tempId, box);
                            this.socket.createBoundingBox(sid, {
                                x_pos: box.x,
                                y_pos: box.y,
                                x_long: box.w,
                                y_long: box.h,
                                color: box.color,
                                category: this.boxCategoryValue(box.labelId),
                                clientTempId: String(tempId), // <- critical for mapping
                            });
                        }
                    }
                }
                tempId = null;
                ctx.requestPaint();
                this.updateScreenLabels();
            },
        };
    }

    /** Select tool with skeleton support:
     * - Click bone -> select skeleton (Skeleton Select)
     * - Click point -> select point (Point Select)
     * - Drag skeleton -> moves all points
     * - Drag point -> moves only that point (bones update automatically)
     */
    private makeSelectTool(): Tool {
        type Corner = 'nw' | 'ne' | 'sw' | 'se';
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
                    if (this.isSkelLockedForMe(ptHit.skId)) return; // block if locked by others
                    this.selection.set({
                        type: 'point',
                        id: ptHit.skId,
                        pid: ptHit.pid,
                    });
                    draggingPoint = ptHit;
                    lastImg = pImg;
                    this.lastEditedSkId = ptHit.skId;
                    ctx.requestPaint();
                    return;
                }

                // Skeleton: test bones (Skeleton Select)
                const boneHit = this.hitTestBone(e.clientX, e.clientY);
                if (boneHit) {
                    if (this.isSkelLockedForMe(boneHit.skId)) return;
                    this.selection.set({ type: 'skeleton', id: boneHit.skId });
                    this.lastEditedSkId = boneHit.skId;
                    draggingSkeletonId = boneHit.skId;
                    lastImg = pImg;

                    this.lastEditedSkId = boneHit.skId;
                    ctx.requestPaint();
                    return;
                }

                // ----- Boxes (keep previous behavior) -----
                // Corner handles (resize takes priority)
                const hitCorner = [...boxes]
                    .reverse()
                    .map((b) => ({
                        b,
                        c: this.hitTestCorner(b, e.clientX, e.clientY),
                    }))
                    .find((h) => !!h.c);
                if (hitCorner) {
                    // prevent if locked
                    if (this.isBoxLockedForMe(hitCorner.b.id)) return;

                    this.selection.set({ type: 'box', id: hitCorner.b.id });
                    resizingId = hitCorner.b.id as Id;
                    corner = hitCorner.c as Corner;
                    lastImg = pImg;

                    ctx.requestPaint();
                    return;
                }

                // Border-only selection
                const hitBorder = [...boxes]
                    .reverse()
                    .find((b) => this.hitTestBorder(b, e.clientX, e.clientY));
                if (hitBorder) {
                    if (this.isBoxLockedForMe(hitBorder.id)) return;

                    this.selection.set({ type: 'box', id: hitBorder.id });
                    draggingBoxId = hitBorder.id as Id;
                    lastImg = pImg;

                    ctx.requestPaint();
                    return;
                }

                // Move only if clicked INSIDE the currently selected box
                const sel = this.selectedBox();
                if (
                    sel &&
                    pImg.x >= sel.x &&
                    pImg.x <= sel.x + sel.w &&
                    pImg.y >= sel.y &&
                    pImg.y <= sel.y + sel.h
                ) {
                    if (this.isBoxLockedForMe(sel.id)) return;

                    draggingBoxId = sel.id;
                    lastImg = pImg;

                    ctx.requestPaint();
                    return;
                }

                // Otherwise clear selection
                this.selection.set({ type: null, id: null });
                ctx.requestPaint();
            },

            onMove: (e, ctx) => {
                const cur = ctx.screenToImage(e.clientX, e.clientY);

                // Move point
                if (draggingPoint) {
                    const dx = cur.x - lastImg.x,
                        dy = cur.y - lastImg.y;
                    lastImg = cur;

                    this.skeletons.update((arr) =>
                        arr.map((sk) => {
                            if (sk.id !== draggingPoint!.skId) return sk;
                            const kp = sk.points[draggingPoint!.pid];
                            if (!kp) return sk;
                            let nx = kp.x + dx,
                                ny = kp.y + dy;
                            const clamped = this.clampToImage({ x: nx, y: ny });
                            nx = clamped.x;
                            ny = clamped.y;
                            return {
                                ...sk,
                                points: {
                                    ...sk.points,
                                    [draggingPoint!.pid]: {
                                        ...kp,
                                        x: nx,
                                        y: ny,
                                    },
                                },
                            };
                        })
                    );
                    ctx.requestPaint();
                    return;
                }

                // Move skeleton (all points)
                if (draggingSkeletonId != null) {
                    const dx = cur.x - lastImg.x,
                        dy = cur.y - lastImg.y;
                    lastImg = cur;

                    this.skeletons.update((arr) =>
                        arr.map((sk) => {
                            if (sk.id !== draggingSkeletonId) return sk;
                            const moved: Record<string, Keypoint> = {};
                            for (const [pid, kp] of Object.entries(sk.points)) {
                                const clamped = this.clampToImage({
                                    x: kp.x + dx,
                                    y: kp.y + dy,
                                });
                                moved[pid] = {
                                    ...kp,
                                    x: clamped.x,
                                    y: clamped.y,
                                };
                            }
                            return { ...sk, points: moved };
                        })
                    );
                    ctx.requestPaint();
                    return;
                }

                // ----- Boxes -----
                if (draggingBoxId != null) {
                    const dx = cur.x - lastImg.x,
                        dy = cur.y - lastImg.y;
                    lastImg = cur;

                    this.boxes.update((list) =>
                        list.map((b) => {
                            if (b.id !== draggingBoxId) return b;
                            let x = b.x + dx,
                                y = b.y + dy;
                            x = Math.max(
                                0,
                                Math.min(x, this.imageWidth() - b.w)
                            );
                            y = Math.max(
                                0,
                                Math.min(y, this.imageHeight() - b.h)
                            );
                            return { ...b, x, y };
                        })
                    );
                    ctx.requestPaint();
                    this.updateScreenLabels();
                    return;
                }

                if (resizingId != null && corner) {
                    const curClamp = ctx.clampToImage(cur);
                    this.boxes.update((list) =>
                        list.map((b) => {
                            if (b.id !== resizingId) return b;
                            let { x, y, w, h } = b;
                            const minW = 4,
                                minH = 4;

                            if (corner === 'nw') {
                                const nx = Math.min(x + w - minW, curClamp.x);
                                const ny = Math.min(y + h - minH, curClamp.y);
                                w = x + w - nx;
                                h = y + h - ny;
                                x = nx;
                                y = ny;
                            }
                            if (corner === 'ne') {
                                const nx = Math.max(x + minW, curClamp.x);
                                const ny = Math.min(y + h - minH, curClamp.y);
                                w = nx - x;
                                y = ny;
                                h = y + h - ny;
                            }
                            if (corner === 'sw') {
                                const nx = Math.min(x + w - minW, curClamp.x);
                                const ny = Math.max(y + minH, curClamp.y);
                                w = x + w - nx;
                                x = nx;
                                h = ny - y;
                            }
                            if (corner === 'se') {
                                const nx = Math.max(x + minW, curClamp.x);
                                const ny = Math.max(y + minH, curClamp.y);
                                w = nx - x;
                                h = ny - y;
                            }

                            // Clamp to image
                            x = Math.max(0, Math.min(x, this.imageWidth() - w));
                            y = Math.max(
                                0,
                                Math.min(y, this.imageHeight() - h)
                            );

                            return { ...b, x, y, w, h };
                        })
                    );
                    ctx.requestPaint();
                    this.updateScreenLabels();
                }
            },

            onUp: (_e, ctx) => {
                // BOX UPDATED?
                const sid = this.currentSlideId();
                if (sid && (draggingBoxId != null || resizingId != null)) {
                    const lid = draggingBoxId ?? resizingId!;
                    const srvId = this.boxServerId(sid, lid);
                    const box = this.boxes().find((b) => b.id === lid);
                    if (srvId && box) {
                        this.socket.updateBoundingBox(sid, srvId, {
                            x_pos: box.x,
                            y_pos: box.y,
                            x_long: box.w,
                            y_long: box.h,
                            color: box.color,
                            category: this.boxCategoryValue(box.labelId),
                        });
                    }
                }

                // POINT/SKELETON UPDATED?
                if (sid && (draggingPoint || draggingSkeletonId != null)) {
                    // Case A: a single point was moved/changed -> send one SkeletalUpdate
                    if (draggingPoint) {
                        const { skId, pid } = draggingPoint;
                        const sk = this.skeletons().find((s) => s.id === skId);
                        if (!sk) {
                            /* no-op */
                        } else {
                            // server skeletal id here must refer to THIS point in the DB model
                            const srvPointId = serverPointId(this.pointLocalToServer, 
                                sid,
                                skId,
                                pid
                            ); // see note below
                            if (srvPointId) {
                                const p = sk.points[pid];
                                const neighborIds = this.serverNeighborIds(sid, sk, pid);
                                this.socket.updateSkeletal(sid, srvPointId, {
                                    x_pos: p.x,
                                    y_pos: p.y,
                                    color: sk.color,
                                    category: this.skelCategoryValue(p.labelId),
                                    key_points: neighborIds.length ? neighborIds : null,
                                });
                            }
                        }
                    }
                    // Case B: whole skeleton dragged -> update ALL its points
                    else if (draggingSkeletonId != null) {
                        const sk = this.skeletons().find(
                            (s) => s.id === draggingSkeletonId
                        );
                        if (sk) {
                            for (const pid of Object.keys(sk.points)) {
                                const srvPointId = serverPointId(this.pointLocalToServer, 
                                    sid,
                                    sk.id,
                                    pid
                                ); // see note below
                                if (!srvPointId) continue;
                                const p = sk.points[pid];
                                const neighborIds = this.serverNeighborIds(sid, sk, pid);
                                this.socket.updateSkeletal(sid, srvPointId, {
                                    x_pos: p.x,
                                    y_pos: p.y,
                                    color: sk.color,
                                    category: this.skelCategoryValue(p.labelId),
                                    key_points: neighborIds.length ? neighborIds : null,
                                });
                            }
                        }
                    }
                }

                draggingPoint = null;
                draggingSkeletonId = null;
                draggingBoxId = null;
                resizingId = null;
                corner = null;
                ctx.requestPaint();
                this.updateScreenLabels();
            },

            drawOverlay: () => {},
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

        const addSkeletonWithPoint = (p: {
            x: number;
            y: number;
        }): { sk: SkeletonAnn; pid: string } => {
            const id = this.idSeq++;
            const pid = 'p' + this.pointSeq++;
            const activeLabelId = this.ensureSkelLabelIdForName(
                this.activeSkelLabelId(),
            );
            const sk: SkeletonAnn = {
                id,
                points: {
                    [pid]: {
                        id: pid,
                        x: p.x,
                        y: p.y,
                        v: 2,
                        labelId: activeLabelId,
                        isPending: true,
                    },
                },
                edges: [] as [string, string][],
                labelId: activeLabelId,
                color: this.activeSkelColor(), // default; user can change in sidebar
            };
            this.skeletons.update((arr) => [...arr, sk]);

            const sid = this.currentSlideId();
            const uid = this.me(); // if you need it for touches; not required for create
            if (sid) {
                this.socket.createSkeletal(sid, {
                    x_pos: p.x,
                    y_pos: p.y,
                    key_points: null,
                    color: sk.color, // for first point use skeleton color
                    category: this.skelCategoryValue(activeLabelId),
                    clientTempId: `${sk.id}:${pid}`,
                });
                markPendingPoint(
                    this.pendingPoints,
                    sid,
                    sk.id,
                    pid,
                    sk.points[pid],
                    sk.color,
                    sk.points[pid].labelId,
                );
            }
            // after you build `sk` and push to `this.skeletons`
            this.lastEditedSkId = sk.id;

            return { sk, pid };
        };

        const addPointToSkeleton = (
            sk: SkeletonAnn,
            p: { x: number; y: number },
            labelHint?: string,
        ): { pid: string } => {
            const pid = 'p' + this.pointSeq++;
            const baseLabelId =
                labelHint ??
                sk.labelId ??
                this.activeSkelLabelId();
            const pointLabelId = this.ensureSkelLabelIdForName(
                baseLabelId,
            );
            const next: SkeletonAnn = {
                ...sk,
                points: {
                    ...sk.points,
                    [pid]: {
                        id: pid,
                        x: p.x,
                        y: p.y,
                        v: 2,
                        labelId: pointLabelId,
                        isPending: true,
                    },
                },
            };
            const newPoint = next.points[pid];
            this.skeletons.update((arr) =>
                arr.map((s) => (s.id === sk.id ? next : s))
            );
            this.lastEditedSkId = sk.id;

            const sid = this.currentSlideId();
            const uid = this.me(); // if you need it for touches; not required for create
            if (sid) {
                this.socket.createSkeletal(sid, {
                    x_pos: p.x,
                    y_pos: p.y,
                    key_points: null,
                    color: sk.color, // for first point use skeleton color
                    category: this.skelCategoryValue(pointLabelId),
                    clientTempId: `${sk.id}:${pid}`,
                });
                const pendingPoint = newPoint ?? next.points[pid];
                markPendingPoint(
                    this.pendingPoints,
                    sid,
                    sk.id,
                    pid,
                    pendingPoint,
                    sk.color,
                    pendingPoint.labelId,
                );
            }
            return { pid };
        };

        const ensureEdge = (sk: SkeletonAnn, a: string, b: string) => {
            const exists = sk.edges.some(
                ([x, y]) => (x === a && y === b) || (x === b && y === a)
            );
            if (exists) return;

            // force tuple type for the appended value
            const next: SkeletonAnn = {
                ...sk,
                edges: [...sk.edges, [a, b] as [string, string]],
            };
            this.skeletons.update((arr) =>
                arr.map((s) => (s.id === sk.id ? next : s))
            );

            this.emitEdgeSync(next /* or sk if unchanged */, a, b);
        };

        const mergeSkeletons = (keepId: Id, dropId: Id) => {
            const sid = this.currentSlideId();
            let keep = this.skeletons().find((s) => s.id === keepId)!;
            let drop = this.skeletons().find((s) => s.id === dropId)!;
            // move points
            const movedPts: Record<string, Keypoint> = { ...keep.points };
            const renameMap = new Map<string, string>();
            for (const [pid, kp] of Object.entries(drop.points)) {
                let npid = pid;
                while (movedPts[npid]) {
                    npid = `m${npid}`;
                }
                renameMap.set(pid, npid);
                movedPts[npid] = { ...kp, id: npid };
            }
            // move edges (remap pids if we ever renamed)
            const movedEdges: [string, string][] = [...keep.edges];
            const remapPid = (pid: string) => renameMap.get(pid) ?? pid;
            for (const [a, b] of drop.edges) {
                const aa = remapPid(a);
                const bb = remapPid(b);
                if (
                    !movedEdges.some(
                        ([x, y]) =>
                            (x === aa && y === bb) || (x === bb && y === aa)
                    )
                ) {
                    movedEdges.push([aa, bb]); // <- OK: movedEdges is a tuple array
                }
            }
            // adopt keep's color (per spec: prioritize selected point's skeleton color)
            const merged: SkeletonAnn = {
                ...keep,
                points: movedPts,
                edges: movedEdges,
            };
            this.skeletons.update((arr) => {
                const filtered = arr.filter((s) => s.id !== dropId);
                return filtered.map((s) => (s.id === keepId ? merged : s));
            });

            if (sid) {
                const l2sMap = getOrCreateNestedMap(this.pointLocalToServer, sid);
                const s2lMap = getOrCreateNestedMap(this.pointServerToLocal, sid);
                const pendingMap = this.pendingPoints.get(sid);

                for (const [oldPid, newPid] of renameMap) {
                    const oldKey = pLocKey(dropId, oldPid);
                    const srvId = l2sMap.get(oldKey);
                    if (srvId) {
                        l2sMap.delete(oldKey);
                        l2sMap.set(pLocKey(keepId, newPid), srvId);
                        s2lMap.set(srvId, { sk: keepId, pid: newPid });
                    }
                    if (pendingMap) {
                        const snap = pendingMap.get(oldKey);
                        if (snap) {
                            pendingMap.delete(oldKey);
                            pendingMap.set(pLocKey(keepId, newPid), {
                                ...snap,
                                skId: keepId,
                                pid: newPid,
                            });
                        }
                    }
                }
            }
        };

        const clickExistingPoint = (
            hit: { skId: Id; pid: string },
            ctrl: boolean
        ) => {
            const sel = this.selection();

            if (sel.type === 'point') {
                if (sel.id === hit.skId) {
                    // Same skeleton: connect
                    const sk = this.skeletons().find((s) => s.id === sel.id)!;
                    ensureEdge(sk, sel.pid, hit.pid);
                    this.selection.set({
                        type: 'point',
                        id: hit.skId,
                        pid: hit.pid,
                    });
                } else {
                    // Different skeletons: merge into the selected point's skeleton, then connect
                    const keepId = sel.id; // keep selected point's skeleton/color
                    const dropId = hit.skId;
                    mergeSkeletons(keepId, dropId);
                    const merged = this.skeletons().find(
                        (s) => s.id === keepId
                    )!;
                    ensureEdge(merged, sel.pid, hit.pid);
                    this.selection.set({
                        type: 'point',
                        id: keepId,
                        pid: hit.pid,
                    });
                }

                // Ctrl toggles chaining vs. exit to Select
                if (!ctrl) this.currentTool.set(this.selectToolObj);
            } else {
                // No prior point selected: just select the clicked point; stay in Skeleton tool.
                this.selection.set({
                    type: 'point',
                    id: hit.skId,
                    pid: hit.pid,
                });
            }

            this.requestPaint();
        };

        const clickEmpty = (pImg: { x: number; y: number }, ctrl: boolean) => {
            const sel = this.selection();
            if (sel.type === 'point') {
                // add new point, connect to previous
                const sk = this.skeletons().find((s) => s.id === sel.id)!;
                const sourcePoint = sk.points[sel.pid];
                const { pid: newPid } = addPointToSkeleton(
                    sk,
                    pImg,
                    sourcePoint?.labelId ?? sk.labelId,
                );
                ensureEdge(
                    this.skeletons().find((s) => s.id === sel.id)!,
                    sel.pid,
                    newPid
                );
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
                    if (this.isSkelLockedForMe(hit.skId)) return;
                    clickExistingPoint(hit, ctrl);
                    return;
                }
                const p = ctx.clampToImage(
                    ctx.screenToImage(e.clientX, e.clientY)
                );
                clickEmpty(p, ctrl);
            },
            onMove: (_e, _ctx) => {},
            onUp: (_e, _ctx) => {},
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
        const sid = this.currentSlideId();
        if (s.type === 'skeleton' && s.id != null) {
            if (sid) {
                const sk = this.skeletons().find((item) => item.id === s.id);
                if (sk) {
                    for (const pid of Object.keys(sk.points)) {
                        const srvId = serverPointId(
                            this.pointLocalToServer,
                            sid,
                            sk.id,
                            pid
                        );
                        if (srvId) this.socket.deleteSkeletal(sid, srvId);
                        this.unlinkPointId(sid, sk.id, pid);
                        clearPendingPoint(this.pendingPoints, sid, sk.id, pid);
                    }
                }
            }
            this.skeletons.update((arr) => arr.filter((sk) => sk.id !== s.id));
            this.selection.set({ type: null, id: null });
            this.lastEditedSkId = null;
            this.requestPaint();
            this.updateScreenLabels();
            return;
        }
        if (s.type === 'point' && s.id != null) {
            if (sid) {
                const srvId = serverPointId(
                    this.pointLocalToServer,
                    sid,
                    s.id,
                    s.pid
                );
                if (srvId) this.socket.deleteSkeletal(sid, srvId);
                this.unlinkPointId(sid, s.id, s.pid);
                clearPendingPoint(this.pendingPoints, sid, s.id, s.pid);
            }
            this.skeletons.update((arr) =>
                arr
                    .map((sk) => {
                        if (sk.id !== s.id) return sk;
                        const nextPts = { ...sk.points };
                        if (!nextPts[s.pid]) return sk;
                        delete nextPts[s.pid];
                        const nextEdges = sk.edges.filter(
                            ([a, b]) => a !== s.pid && b !== s.pid
                        );
                        return { ...sk, points: nextPts, edges: nextEdges };
                    })
                    .filter((sk) => Object.keys(sk.points).length > 0)
            );
            this.selection.set({ type: 'skeleton', id: s.id }); // fallback to skeleton if it still exists
            this.lastEditedSkId = s.id;
            this.requestPaint();
            return;
        }
        if (s.type === 'box' && s.id != null) {
            if (sid) {
                const srvId = this.boxServerId(sid, s.id);
                if (srvId) {
                    this.socket.deleteBoundingBox(sid, srvId);
                    getOrCreateNestedMap(
                        this.boxServerToLocal,
                        sid
                    ).delete(srvId);
                }
                getOrCreateNestedMap(this.boxLocalToServer, sid).delete(s.id);
                clearPendingBox(this.pendingBoxes, sid, s.id);
            }
            this.boxes.update((list) => list.filter((b) => b.id !== s.id));
            this.selection.set({ type: null, id: null });
            this.requestPaint();
            this.updateScreenLabels();
        }
    }

    /* ---------- Comments tab state (unchanged, with handlers) ---------- */
    private annotationSvc = inject(AnnotationService);
    private slideSvc = inject(SlideService);
    private socket = inject(SocketService);
    private auth = inject(AuthService);

    // Map of userId -> userName for displaying comment authors
    private projectSvc = inject(ProjectService);
    usersById = signal<Record<string, string>>({});

    private loadProjectUsers(pid: string) {
        this.projectSvc.getProjectUsers(pid).subscribe({
            next: (users: ProjectUser[]) => {
                const map: Record<string, string> = {};
                for (const u of users ?? []) map[u.userId] = u.userName ?? '';
                this.usersById.set(map);
            },
            error: () => {
                // If it fails, keep empty map; we'll fallback to "Removed User"
                this.usersById.set({});
            },
        });
    }

    displayNameFor(userId: string | null | undefined): string {
        if (!userId) return 'Removed User';
        return this.usersById()[userId] || 'Removed User';
    }
    // Logged-in user (from AuthService), used for posting comments
    currentUserId = signal<string>(this.auth.getUserId() ?? '');

    // Comments state (kept from your file)
    comments = signal<CommentModel[]>([]);
    newComment = signal<string>('');
    isConnected = signal<boolean>(false);

    private applyIncomingCreateNewestFirst(c: SocketCommentDTO) {
        const current = this.currentSlideId();
        if (!c.slideId || c.slideId !== current) return;

        const incoming = mapSocketToComment(c);
        const pendingKey = `${incoming.userId}|${incoming.content.trim()}`;

        this.comments.update((arr) => {
            // If we already have this server id, ignore
            if (arr.some((x) => x.id === incoming.id)) return arr;

            // Only replace if we still have a pending record for this key
            const canReplace = this.pendingTracker.consume(current!, pendingKey);

            if (canReplace) {
                // Find the optimistic candidate: same user/content and marked pending
                const i = arr.findIndex(
                    (x) =>
                        x.isPending === true &&
                        x.userId === incoming.userId &&
                        x.content.trim() === incoming.content.trim()
                );

                if (i !== -1) {
                    const next = arr.slice();
                    next[i] = { ...incoming, isPending: false };
                    return next;
                }
            }

            // No optimistic match -> insert at top (newest-first)
            const next = [incoming, ...arr];
            next.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            return next;
        });
    }

    private socketSubs: Array<() => void> = [];
    private pendingOptimistic: Array<{ userId: string; content: string }> = [];
    private pendingTracker = new PendingCommentTracker();
    private uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    disconnectFromSlide() {
        this.disposeSocketHandlers();
        this.releaseAllLocks();
        this.pendingRemoteBoxLocks.clear();
        this.pendingRemoteSkelLocks.clear();
        this.socket.disconnect();
        this.pendingOptimistic = [];
        this.pendingTracker.clear();
        this.isConnected.set(false);
    }

    private disposeSocketHandlers() {
        for (const off of this.socketSubs)
            try {
                off();
            } catch {}
        this.socketSubs = [];
    }

    private observe<T>(obs: Observable<T>, next: (v: T) => void): () => void {
        const sub = obs.subscribe(next);
        return () => sub.unsubscribe();
    }

    private applyIncomingCreate(c: SocketCommentDTO) {
        if (!this.isForCurrentSlide(c.slideId)) return;
        const incoming = mapSocketToComment(c);
        let matchedPending = false;
        this.comments.update((arr) => {
            const idx = arr.findIndex(
                (x) =>
                    (x as any).isPending &&
                    x.userId === incoming.userId &&
                    x.content === incoming.content
            );
            if (idx !== -1) {
                matchedPending = true;
                const copy = arr.slice();
                copy[idx] = incoming;
                copy.sort(
                    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
                );
                return copy;
            }
            if (arr.some((x) => x.id === incoming.id)) {
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
        const incoming = mapSocketToComment(c);
        this.comments.update((arr) => {
            const idx = arr.findIndex((x) => x.id === incoming.id);
            if (idx === -1) return arr;
            const copy = arr.slice();
            copy[idx] = {
                ...copy[idx],
                content: incoming.content,
                updatedAt: incoming.updatedAt,
                isPending: undefined,
            };
            return copy;
        });
    }

    private applyIncomingDelete(c: SocketCommentDeletedDTO) {
        if (!this.isForCurrentSlide(c.slideId)) return;
        this.comments.update((arr) => arr.filter((item) => item.id !== c.id));
    }

    private isForCurrentSlide(slideId?: string | null): boolean {
        const current = this.currentSlideId();
        return !!slideId && !!current && slideId === current;
    }

    onNewCommentInput(ev: Event) {
        const value = (ev.target as HTMLTextAreaElement).value ?? '';
        this.newComment.set(value);
    }

    private removePendingEntry(userId: string, content: string) {
        const normalizedUser = userId.trim();
        const normalizedContent = content.trim();
        const idx = this.pendingOptimistic.findIndex(
            (item) =>
                item.userId === normalizedUser &&
                item.content === normalizedContent
        );
        if (idx !== -1) {
            this.pendingOptimistic.splice(idx, 1);
        }
    }

    addComment() {
        const slideId = this.currentSlideId();
        if (!slideId) {
            this.snack.open('No slide selected', undefined, { duration: 1500 });
            return;
        }

        const content = this.newComment().trim();
        if (!content) return;

        const uid = this.auth.getUserId();
        if (!uid) {
            this.snack.open('Not logged in', undefined, { duration: 1500 });
            return;
        }

        const pendingKey = `${uid}|${content}`;

        const optimistic: CommentModel = {
            id: crypto.randomUUID(),
            slideId,
            userId: uid,
            content,
            createdAt: new Date(),
            updatedAt: new Date(),
            isPending: true,
        };

        this.comments.update((arr) => [optimistic, ...arr]); // newest-first
        this.pendingTracker.add(slideId, pendingKey);

        this.socket.createComment(slideId, uid, content);
        this.newComment.set('');
    }

    commentAuthor(c: CommentModel): string {
        return this.displayNameFor(c.userId);
    }
    avatarUrl(userId: string): string {
        const initial = (
            this.displayNameFor(userId)?.trim()?.[0] ?? '?'
        ).toUpperCase();
        const bg = this.hashColor(userId);
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='160'>
         <rect width='100%' height='100%' fill='${bg}'/>
         <text x='50%' y='55%' font-family='Inter,Arial' font-size='72' dominant-baseline='middle' text-anchor='middle' fill='white'>${initial}</text>
       </svg>`;
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    private hashColor(s: string): string {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        const r = (h >>> 16) & 0xff,
            g = (h >>> 8) & 0xff,
            b = h & 0xff;
        return `rgb(${128 + (r >> 1)}, ${128 + (g >> 1)}, ${128 + (b >> 1)})`;
    }

    trackSlideId = (_: number, s: { id: string }) => s.id;

    // Thumbnails store (data URLs)
    thumbs = signal<Record<string, string>>({});
    private thumbInFlight = new Set<string>();

    // Optional: set to true when your backend serves thumbs at the URL pattern below
    useServerThumbs = false;
    private serverThumbUrl(slideId: string): string {
        // Example pattern - change if/when your backend has a real endpoint
        return `http://localhost:8080/slide/thumb/${slideId}`;
    }

    // Get a thumbnail src; triggers lazy generation if needed (when useServerThumbs=false)
    thumbSrcFor(slideId: string): string | null {
        if (this.useServerThumbs) {
            return this.serverThumbUrl(slideId);
        }
        const t = this.thumbs()[slideId];
        if (!t) {
            void this.ensureLocalThumb(slideId);
            return null;
        }
        return t;
    }

    private async ensureLocalThumb(slideId: string): Promise<void> {
        if (
            !slideId ||
            this.thumbs()[slideId] ||
            this.thumbInFlight.has(slideId)
        )
            return;
        this.thumbInFlight.add(slideId);
        try {
            const blob = await this.slideSvc.getSlideImageBlob(slideId);
            const bmp = await createImageBitmap(blob);

            // Fit to a 120x90 box (same sizes as rail)
            const maxW = 120,
                maxH = 90;
            const scale = Math.min(maxW / bmp.width, maxH / bmp.height, 1);
            const w = Math.max(1, Math.round(bmp.width * scale));
            const h = Math.max(1, Math.round(bmp.height * scale));

            const cvs = document.createElement('canvas');
            cvs.width = w;
            cvs.height = h;
            const ctx = cvs.getContext('2d', { alpha: false })!;
            ctx.drawImage(bmp, 0, 0, w, h);
            try {
                (bmp as any).close?.();
            } catch {}

            const dataUrl = cvs.toDataURL('image/jpeg', 0.8);
            const next = { ...this.thumbs() };
            next[slideId] = dataUrl;
            this.thumbs.set(next);
        } catch {
            // ignore: cell keeps showing skeleton
        } finally {
            this.thumbInFlight.delete(slideId);
        }
    }

    // --- ImageBitmap LRU (very small) ---
    private readonly LRU_CAPACITY = 5;
    private bmpLRU = new Map<string, ImageBitmap>();

    private getCachedBitmap(id: string): ImageBitmap | null {
        const e = this.bmpLRU.get(id);
        if (!e) return null;
        this.bmpLRU.delete(id); // mark as MRU
        this.bmpLRU.set(id, e);
        return e;
    }
    private putCachedBitmap(id: string, bmp: ImageBitmap) {
        if (this.bmpLRU.has(id)) this.bmpLRU.delete(id);
        this.bmpLRU.set(id, bmp);
        while (this.bmpLRU.size > this.LRU_CAPACITY) {
            const k = this.bmpLRU.keys().next().value as string;
            const victim = this.bmpLRU.get(k);
            this.bmpLRU.delete(k);
            try {
                (victim as any)?.close?.();
            } catch {}
        }
    }

    private async prefetchNeighbors(index: number) {
        if (index < 0) return;
        const list = this.slides();
        const ids: string[] = [];
        if (index + 1 < list.length) ids.push(list[index + 1].id);
        if (index - 1 >= 0) ids.push(list[index - 1].id);

        for (const id of ids) {
            if (this.getCachedBitmap(id)) continue;
            try {
                const blob = await this.slideSvc.getSlideImageBlob(id);
                const bmp = await createImageBitmap(blob);
                this.putCachedBitmap(id, bmp);
                // (optional) also seed a thumbnail if you want (below we keep thumbs separate)
            } catch {
                /* ignore */
            }
        }
    }

    // === Locks (who is touching what) ===
    boxLocks = signal<Map<Id, { by: string; instanceId?: string }>>(
        new Map()
    );
    skelLocks = signal<
        Map<Id, { by: string; pid?: string; instanceId?: string }>
    >(new Map());
    private heldBoxLock: {
        slideId: string;
        boxId: Id;
        serverId?: string | null;
    } | null = null;
    private heldSkelLock: {
        slideId: string;
        skelId: Id;
        pointId?: string;
        pointServerId?: string | null;
    } | null = null;
    private pendingRemoteBoxLocks = new Map<
        string,
        { by: string; instanceId?: string }
    >();
    private pendingRemoteSkelLocks = new Map<
        string,
        { by: string; instanceId?: string; pid?: string; count: number }
    >();
    private pendingRemoteSkelByTemp = new Map<
        string,
        { by: string; instanceId: string }
    >();
    private remoteSkelLockState = new Map<
        Id,
        Map<
            string,
            {
                count: number;
                by: string;
                pid?: string;
                instanceId: string;
                releaseTimer?: ReturnType<typeof setTimeout> | null;
            }
        >
    >();
    private readonly remoteSkelReleaseDelayMs = 400;

    private logLock(...args: any[]) {
        console.log('[Lock]', ...args);
    }

    private anonUserKey = 'anno-guest-user-id';
    private resolveUserId(): string {
        const tokenId = (this.auth.getUserId() ?? '').trim();
        if (tokenId) return tokenId;
        let stored = sessionStorage.getItem(this.anonUserKey) ?? '';
        if (!stored) {
            stored = crypto.randomUUID();
            sessionStorage.setItem(this.anonUserKey, stored);
        }
        return stored;
    }

    private me() {
        return this.resolveUserId();
    }

    isBoxLockedForMe = (id: Id) => {
        const l = this.boxLocks().get(id);
        const me = this.me();
        const myInstance = this.socket.clientInstanceId;
        const locked =
            !!l &&
            !(
                l.by === me &&
                (!l.instanceId || l.instanceId === myInstance)
            );
        this.logLock('isBoxLockedForMe', {
            id,
            lockedBy: l?.by,
            instanceId: l?.instanceId,
            me,
            myInstance,
            locked,
        });
        return locked;
    };

    isSkelLockedForMe = (id: Id) => {
        const l = this.skelLocks().get(id);
        const me = this.me();
        const myInstance = this.socket.clientInstanceId;
        const locked =
            !!l &&
            !(
                l.by === me &&
                (!l.instanceId || l.instanceId === myInstance)
            );
        this.logLock('isSkelLockedForMe', {
            id,
            lockedBy: l?.by,
            pid: l?.pid,
            instanceId: l?.instanceId,
            me,
            myInstance,
            locked,
        });
        return locked;
    };

    // helpers to mutate the maps immutably (so signals fire)
    private setBoxLock(
        id: Id,
        payload: { by: string; instanceId?: string } | null
    ) {
        const next = new Map(this.boxLocks());
        if (payload) next.set(id, payload);
        else next.delete(id);
        this.logLock('setBoxLock', {
            id,
            payload,
            map: Array.from(next.entries()).map(([k, v]) => [
                k,
                { by: v.by, instanceId: v.instanceId },
            ]),
        });
        this.boxLocks.set(next);
    }
    private setSkelLockSignal(
        id: Id,
        payload: { by: string; pid?: string; instanceId?: string } | null
    ) {
        const next = new Map(this.skelLocks());
        if (payload) next.set(id, payload);
        else next.delete(id);
        this.skelLocks.set(next);
    }
    private refreshRemoteSkelSignal(id: Id) {
        const state = this.remoteSkelLockState.get(id);
        if (!state || state.size === 0) {
            this.setSkelLockSignal(id, null);
            return;
        }
        let chosen: {
            count: number;
            by: string;
            pid?: string;
            instanceId: string;
        } | null = null;
        for (const entry of state.values()) {
            if (!chosen) chosen = entry;
            if (entry.instanceId !== this.socket.clientInstanceId) {
                chosen = entry;
                break;
            }
        }
        if (!chosen) {
            this.setSkelLockSignal(id, null);
            return;
        }
        this.setSkelLockSignal(id, {
            by: chosen.by,
            pid: chosen.pid,
            instanceId: chosen.instanceId,
        });
    }
    private addRemoteSkelLock(
        id: Id,
        payload: { by: string; pid?: string; instanceId?: string },
        count = 1
    ) {
        const by = (payload.by ?? '').trim();
        const instanceId = (payload.instanceId ?? by).trim();
        if (!by || !instanceId || count <= 0) return;
        const map =
            this.remoteSkelLockState.get(id) ??
            new Map<
                string,
                {
                    count: number;
                    by: string;
                    pid?: string;
                    instanceId: string;
                    releaseTimer?: ReturnType<typeof setTimeout> | null;
                }
            >();
        let entry = map.get(instanceId);
        if (!entry) {
            entry = {
                count: 0,
                by,
                pid: payload.pid,
                instanceId,
                releaseTimer: null,
            };
        } else if (entry.releaseTimer) {
            clearTimeout(entry.releaseTimer);
            entry.releaseTimer = null;
        }
        entry.count += count;
        entry.by = by;
        if (payload.pid !== undefined) entry.pid = payload.pid;
        map.set(instanceId, entry);
        this.remoteSkelLockState.set(id, map);
        this.logLock('addRemoteSkelLock', { id, entry, count });
        this.refreshRemoteSkelSignal(id);
    }
    private removeRemoteSkelLock(
        id: Id,
        instanceIdRaw: string | undefined,
        count = 1
    ) {
        const instanceId = (instanceIdRaw ?? '').trim();
        if (!instanceId) return;
        const map = this.remoteSkelLockState.get(id);
        if (!map) return;
        const entry = map.get(instanceId);
        if (!entry) return;
        if (entry.releaseTimer) {
            clearTimeout(entry.releaseTimer);
            entry.releaseTimer = null;
        }
        entry.count = Math.max(0, entry.count - count);
        if (entry.count > 0) {
            map.set(instanceId, entry);
            this.remoteSkelLockState.set(id, map);
            this.logLock('removeRemoteSkelLock:decrement', { id, entry, count });
            this.refreshRemoteSkelSignal(id);
            return;
        }
        const timer = setTimeout(() => {
            const currentMap = this.remoteSkelLockState.get(id);
            if (!currentMap) return;
            const currentEntry = currentMap.get(instanceId);
            if (!currentEntry || currentEntry.releaseTimer !== timer) return;
            currentMap.delete(instanceId);
            if (currentMap.size === 0) this.remoteSkelLockState.delete(id);
            else this.remoteSkelLockState.set(id, currentMap);
            this.logLock('removeRemoteSkelLock:timer-release', {
                id,
                instanceId,
            });
            this.refreshRemoteSkelSignal(id);
        }, this.remoteSkelReleaseDelayMs);
        entry.releaseTimer = timer;
        map.set(instanceId, entry);
        this.remoteSkelLockState.set(id, map);
        this.logLock('removeRemoteSkelLock:schedule', {
            id,
            instanceId,
            delay: this.remoteSkelReleaseDelayMs,
        });
        this.refreshRemoteSkelSignal(id);
    }

    private syncSelectionLocks(slideId: string | null, sel: Selection) {
        this.logLock('syncSelectionLocks:start', {
            slideId,
            selection: sel,
            heldBox: this.heldBoxLock,
            heldSkel: this.heldSkelLock,
        });
        if (this.heldBoxLock && this.heldBoxLock.slideId !== slideId) {
            this.releaseBoxLock();
        }
        if (this.heldSkelLock && this.heldSkelLock.slideId !== slideId) {
            this.releaseSkelLock();
        }

        const desiredBoxId =
            slideId && sel.type === 'box' && typeof sel.id === 'number'
                ? sel.id
                : null;
        const desiredSkel =
            slideId && typeof sel.id === 'number'
                ? sel.type === 'point'
                    ? { skId: sel.id, pointId: sel.pid }
                    : sel.type === 'skeleton'
                      ? { skId: sel.id, pointId: undefined }
                      : null
                : null;

        if (
            this.heldBoxLock &&
            (!desiredBoxId ||
                this.heldBoxLock.boxId !== desiredBoxId ||
                this.heldBoxLock.slideId !== slideId)
        ) {
            this.releaseBoxLock();
        }
        if (
            this.heldSkelLock &&
            (!desiredSkel ||
                this.heldSkelLock.skelId !== desiredSkel.skId ||
                this.heldSkelLock.slideId !== slideId ||
                this.heldSkelLock.pointId !== desiredSkel.pointId)
        ) {
            this.releaseSkelLock();
        }

        if (
            slideId &&
            desiredBoxId != null &&
            (!this.heldBoxLock ||
                this.heldBoxLock.boxId !== desiredBoxId ||
                this.heldBoxLock.slideId !== slideId)
        ) {
            this.acquireBoxLock(slideId, desiredBoxId);
        } else if (
            slideId &&
            desiredBoxId != null &&
            this.heldBoxLock &&
            this.heldBoxLock.slideId === slideId &&
            this.heldBoxLock.boxId === desiredBoxId
        ) {
            const srvId = this.boxServerId(slideId, desiredBoxId);
            if (srvId && this.heldBoxLock.serverId !== srvId) {
                this.heldBoxLock = {
                    ...this.heldBoxLock,
                    serverId: srvId,
                };
                const uid = this.me().trim();
                if (uid) {
                    const payload: any = {
                        slideId,
                        userId: uid,
                        boxId: desiredBoxId,
                        boundingBoxId: srvId,
                    };
                    this.logLock('syncSelectionLocks:rebroadcast boxTouch', {
                        payload,
                    });
                    this.socket.boxTouch(payload);
                }
            }
        }

        if (
            slideId &&
            desiredSkel &&
            (!this.heldSkelLock ||
                this.heldSkelLock.slideId !== slideId ||
                this.heldSkelLock.skelId !== desiredSkel.skId ||
                this.heldSkelLock.pointId !== desiredSkel.pointId)
        ) {
            this.acquireSkelLock(slideId, desiredSkel.skId, desiredSkel.pointId);
        } else if (
            slideId &&
            desiredSkel &&
            this.heldSkelLock &&
            this.heldSkelLock.slideId === slideId &&
            this.heldSkelLock.skelId === desiredSkel.skId
        ) {
            const nextServerId = this.pointServerIdForLock(
                slideId,
                desiredSkel.skId,
                desiredSkel.pointId ?? this.heldSkelLock.pointId
            );
            if (
                nextServerId &&
                this.heldSkelLock.pointServerId !== nextServerId
            ) {
                this.heldSkelLock = {
                    ...this.heldSkelLock,
                    pointServerId: nextServerId,
                };
                const uid = this.me().trim();
                if (uid) {
                    const payload: any = {
                        slideId,
                        userId: uid,
                        skeletalId: desiredSkel.skId,
                        pointServerId: nextServerId,
                    };
                    if (desiredSkel.pointId) {
                        payload.pointId = desiredSkel.pointId;
                    }
                    this.logLock('syncSelectionLocks:rebroadcast skeletalTouch', {
                        payload,
                    });
                    this.socket.skeletalTouch(payload);
                }
            }
        }
        this.logLock('syncSelectionLocks:end', {
            heldBox: this.heldBoxLock,
            heldSkel: this.heldSkelLock,
        });
    }

    private acquireBoxLock(slideId: string, boxId: Id) {
        const uid = this.me().trim();
        if (!uid) return;
        const srvId = this.boxServerId(slideId, boxId);
        const payload: any = {
            slideId,
            userId: uid,
            boxId,
        };
        if (srvId) payload.boundingBoxId = srvId;
        this.logLock('acquireBoxLock:emit', payload);
        this.socket.boxTouch(payload);
        this.heldBoxLock = { slideId, boxId, serverId: srvId ?? null };
        this.logLock('acquireBoxLock:held', this.heldBoxLock);
    }

    private releaseBoxLock() {
        const lock = this.heldBoxLock;
        if (!lock) return;
        this.heldBoxLock = null;
        const { slideId, boxId, serverId } = lock;
        const uid = this.me().trim();
        if (!uid) return;
        const srvId = serverId ?? this.boxServerId(slideId, boxId) ?? undefined;
        const payload: any = {
            slideId,
            userId: uid,
            boxId,
        };
        if (srvId) payload.boundingBoxId = srvId;
        this.logLock('releaseBoxLock:emit', payload);
        this.socket.boxUnTouch(payload);
    }

    private acquireSkelLock(slideId: string, skelId: Id, pointId?: string) {
        const uid = this.me().trim();
        if (!uid) return;
        const pointServerId = this.pointServerIdForLock(
            slideId,
            skelId,
            pointId
        );
        const payload: any = {
            slideId,
            userId: uid,
            skeletalId: skelId,
        };
        if (pointId) payload.pointId = pointId;
        if (pointServerId) payload.pointServerId = pointServerId;
        this.logLock('acquireSkelLock:emit', payload);
        this.socket.skeletalTouch(payload);
        this.heldSkelLock = {
            slideId,
            skelId,
            pointId,
            pointServerId: pointServerId ?? null,
        };
        this.logLock('acquireSkelLock:held', this.heldSkelLock);
    }

    private releaseSkelLock() {
        const lock = this.heldSkelLock;
        if (!lock) return;
        this.heldSkelLock = null;
        const { slideId, skelId, pointId, pointServerId } = lock;
        const uid = this.me().trim();
        if (!uid) return;
        const resolvedPointServerId =
            pointServerId ??
            this.pointServerIdForLock(slideId, skelId, pointId);
        const payload: any = {
            slideId,
            userId: uid,
            skeletalId: skelId,
        };
        if (pointId) payload.pointId = pointId;
        if (resolvedPointServerId) payload.pointServerId = resolvedPointServerId;
        this.logLock('releaseSkelLock:emit', payload);
        this.socket.skeletalUnTouch(payload);
    }

    private releaseAllLocks() {
        this.releaseBoxLock();
        this.releaseSkelLock();
    }

    private pendingBoxKey(slideId: string, serverId: string) {
        return `${slideId}::${serverId}`;
    }
    private queuePendingBoxLock(
        slideId: string,
        serverId: string,
        payload: { by: string; instanceId?: string }
    ) {
        this.logLock('queuePendingBoxLock', { slideId, serverId, payload });
        this.pendingRemoteBoxLocks.set(
            this.pendingBoxKey(slideId, serverId),
            payload
        );
    }
    private clearPendingBoxLock(slideId: string, serverId: string) {
        this.logLock('clearPendingBoxLock', { slideId, serverId });
        this.pendingRemoteBoxLocks.delete(this.pendingBoxKey(slideId, serverId));
    }
    private tryApplyPendingBoxLock(slideId: string, serverId: string) {
        const key = this.pendingBoxKey(slideId, serverId);
        const pending = this.pendingRemoteBoxLocks.get(key);
        if (!pending) return;
        const localId = this.boxLocalId(slideId, serverId);
        if (localId == null) return;
        this.logLock('tryApplyPendingBoxLock', {
            slideId,
            serverId,
            localId,
            pending,
        });
        this.setBoxLock(localId, pending);
        this.pendingRemoteBoxLocks.delete(key);
        this.requestPaint();
    }

    private pendingSkelKey(slideId: string, pointServerId: string) {
        return `${slideId}::${pointServerId}`;
    }
    private remoteSkelTempKey(
        slideId: string,
        remoteSkId: number | string,
        pid: string
    ) {
        return `${slideId}::${remoteSkId}::${pid}`;
    }
    private queuePendingSkelLock(
        slideId: string,
        pointServerId: string,
        payload: { by: string; instanceId?: string; pid?: string; count?: number }
    ) {
        const key = this.pendingSkelKey(slideId, pointServerId);
        const existing = this.pendingRemoteSkelLocks.get(key);
        if (existing) {
            existing.by = payload.by;
            if (payload.instanceId) existing.instanceId = payload.instanceId;
            if (payload.pid !== undefined) existing.pid = payload.pid;
            existing.count += payload.count ?? 1;
            this.pendingRemoteSkelLocks.set(key, existing);
            this.logLock('queuePendingSkelLock:update', {
                slideId,
                pointServerId,
                payload: existing,
            });
        } else {
            const entry = {
                by: payload.by,
                instanceId: payload.instanceId,
                pid: payload.pid,
                count: payload.count ?? 1,
            };
            this.pendingRemoteSkelLocks.set(key, entry);
            this.logLock('queuePendingSkelLock:new', {
                slideId,
                pointServerId,
                payload: entry,
            });
        }
    }
    private clearPendingSkelLock(slideId: string, pointServerId: string) {
        this.logLock('clearPendingSkelLock', { slideId, pointServerId });
        this.pendingRemoteSkelLocks.delete(this.pendingSkelKey(slideId, pointServerId));
    }
    private tryApplyPendingSkelLock(slideId: string, pointServerId: string) {
        const key = this.pendingSkelKey(slideId, pointServerId);
        const pending = this.pendingRemoteSkelLocks.get(key);
        if (!pending) return;
        const mapping = this.pointServerToLocal.get(slideId)?.get(pointServerId);
        if (!mapping) return;
        this.logLock('tryApplyPendingSkelLock', {
            slideId,
            pointServerId,
            mapping,
            pending,
        });
        this.addRemoteSkelLock(
            mapping.sk,
            {
                by: pending.by,
                pid: mapping.pid,
                instanceId: pending.instanceId,
            },
            pending.count
        );
        this.pendingRemoteSkelLocks.delete(key);
        this.requestPaint();
    }

    private pointServerIdForLock(
        slideId: string,
        skelId: Id,
        pointId?: string
    ): string | undefined {
        if (pointId) {
            return serverPointId(
                this.pointLocalToServer,
                slideId,
                skelId,
                pointId
            );
        }
        const sk = this.skeletons().find((s) => s.id === skelId);
        if (!sk) return undefined;
        for (const pid of Object.keys(sk.points)) {
            const srv = serverPointId(
                this.pointLocalToServer,
                slideId,
                skelId,
                pid
            );
            if (srv) return srv;
        }
        return undefined;
    }

    private _touchOffs: Array<() => void> = [];
    private disposeTouchHandlers() {
        for (const off of this._touchOffs)
            try {
                off();
            } catch {}
        this._touchOffs = [];
    }
    /** === Local <-> Server id mapping (per slide) === */
    private boxLocalToServer = new Map<string, Map<number, string>>();
    private boxServerToLocal = new Map<string, Map<string, number>>();
    private pendingBoxes = new Map<string, Map<number, PendingBoxSnapshot>>();

    /** Point id mapping (per slide)
     *  local key = `${skLocalId}:${pid}`
     */
    private pointLocalToServer = new Map<string, Map<string, string>>();
    private pointServerToLocal = new Map<
        string,
        Map<string, { sk: number; pid: string }>
    >();
    private pendingPoints = new Map<string, Map<string, PendingPointSnapshot>>();
    private pendingSkeletalUpdates = new Map<string, Map<string, SkeletalDTO>>();

    /** Call when we first load server annotations for a slide (if/when you fetch them). */
    private seedBoxesFromServer(
        slideId: string,
        serverBoxes: AnnotationBoundingBoxDTO[]
    ) {
        this.pendingBoxes.delete(slideId);
        const l2s = getOrCreateNestedMap(this.boxLocalToServer, slideId);
        l2s.clear();
        const s2l = getOrCreateNestedMap(this.boxServerToLocal, slideId);
        s2l.clear();
        const ui: BoxAnn[] = [];

        for (const srv of serverBoxes ?? []) {
            const localId = this.idSeq++;
            const labelId = this.ensureBoxLabelIdForName(srv.category);
            l2s.set(localId, srv.id);
            s2l.set(srv.id, localId);
            this.tryApplyPendingBoxLock(slideId, srv.id);
            ui.push({
                id: localId,
                x: srv.x_pos,
                y: srv.y_pos,
                w: srv.x_long,
                h: srv.y_long,
                labelId,
                color: srv.color,
            });
        }
        this.boxes.set(ui);
    }

    private seedSkeletalsFromServer(
        slideId: string,
        serverPoints: AnnotationSkeletalDTO[]
    ) {
        this.pendingPoints.delete(slideId);

        const l2s = getOrCreateNestedMap(this.pointLocalToServer, slideId);
        l2s.clear();
        const s2l = getOrCreateNestedMap(this.pointServerToLocal, slideId);
        s2l.clear();

        const dtoById = new Map<string, AnnotationSkeletalDTO>();
        for (const dto of serverPoints ?? []) {
            if (!dto?.id) continue;
            dtoById.set(dto.id, dto);
        }

        if (dtoById.size === 0) {
            this.skeletons.set([]);
            return;
        }

        const adjacency = new Map<string, Set<string>>();
        for (const id of dtoById.keys()) {
            adjacency.set(id, new Set());
        }
        for (const dto of dtoById.values()) {
            const neighbors = Array.isArray(dto.key_points)
                ? dto.key_points
                : [];
            const set = adjacency.get(dto.id);
            if (!set) continue;
            for (const neighborId of neighbors) {
                if (!dtoById.has(neighborId)) continue;
                set.add(neighborId);
                adjacency.get(neighborId)?.add(dto.id);
            }
        }

        const visited = new Set<string>();
        const skeletons: SkeletonAnn[] = [];

        for (const startId of dtoById.keys()) {
            if (visited.has(startId)) continue;

            const stack = [startId];
            const component: string[] = [];

            while (stack.length) {
                const current = stack.pop()!;
                if (visited.has(current)) continue;
                visited.add(current);
                component.push(current);
                for (const neighbor of adjacency.get(current) ?? []) {
                    if (!visited.has(neighbor)) stack.push(neighbor);
                }
            }

            if (!component.length) continue;

            const componentSet = new Set<string>(component);
            const localSkId = this.idSeq++;
            const points: Record<string, Keypoint> = {};
            const serverToLocal = new Map<string, string>();
            let skColor: string | null = null;
            let skLabelId: string | null = null;

            for (const serverId of component) {
                const dto = dtoById.get(serverId);
                if (!dto) continue;
                const pid = 'p' + this.pointSeq++;
                const labelId = this.ensureSkelLabelIdForName(
                    dto.category ?? skLabelId ?? this.activeSkelLabelId(),
                );
                points[pid] = {
                    id: pid,
                    x: dto.x_pos ?? 0,
                    y: dto.y_pos ?? 0,
                    v: 2,
                    labelId,
                };
                serverToLocal.set(serverId, pid);
                linkPointIds(this.pointLocalToServer, this.pointServerToLocal, slideId, localSkId, pid, serverId);
                this.tryApplyPendingSkelLock(slideId, serverId);
                if (!skColor && dto.color) skColor = dto.color;
                if (!skLabelId && dto.category) skLabelId = labelId;
            }

            const edges: [string, string][] = [];
            const seenEdges = new Set<string>();
            for (const serverId of component) {
                const fromPid = serverToLocal.get(serverId);
                if (!fromPid) continue;
                for (const neighbor of adjacency.get(serverId) ?? []) {
                    if (!componentSet.has(neighbor)) continue;
                    const toPid = serverToLocal.get(neighbor);
                    if (!toPid) continue;
                    const key =
                        fromPid < toPid
                            ? `${fromPid}|${toPid}`
                            : `${toPid}|${fromPid}`;
                    if (seenEdges.has(key)) continue;
                    seenEdges.add(key);
                    edges.push([fromPid, toPid]);
                }
            }

        skeletons.push({
            id: localSkId,
            color: skColor ?? this.activeSkelColor(),
            labelId:
                skLabelId ??
                this.ensureSkelLabelIdForName(this.activeSkelLabelId()),
            points,
            edges,
        });
        }

        this.skeletons.set(skeletons);
    }

    /** When changing slides, also clear the id maps (we rebuild on restore/seed). */
    private clearIdMapsForSlide(slideId: string) {
        this.boxLocalToServer.delete(slideId);
        this.boxServerToLocal.delete(slideId);
        this.pendingBoxes.delete(slideId);
        this.pendingPoints.delete(slideId);
    }

    /* BOX mapping utilities */
    private linkBoxIds(slideId: string, localId: number, serverId: string) {
        getOrCreateNestedMap(this.boxLocalToServer, slideId).set(localId, serverId);
        getOrCreateNestedMap(this.boxServerToLocal, slideId).set(serverId, localId);
    }
    private boxServerId(slideId: string, localId: number): string | undefined {
        return getOrCreateNestedMap(this.boxLocalToServer, slideId).get(localId);
    }
    private boxLocalId(slideId: string, serverId: string): number | undefined {
        return getOrCreateNestedMap(this.boxServerToLocal, slideId).get(serverId);
    }

    private coerceServerBoxToUI(
        localId: number,
        srv: {
            id: string;
            x_pos: number;
            y_pos: number;
            x_long: number;
            y_long: number;
            color: string;
            category: string;
        }
    ): BoxAnn {
        return {
            id: localId,
            x: srv.x_pos,
            y: srv.y_pos,
            w: srv.x_long,
            h: srv.y_long,
            color: srv.color,
            labelId: this.ensureBoxLabelIdForName(srv.category),
        };
    }

    private queueSkeletalUpdate(slideId: string, srv: SkeletalDTO): void {
        getOrCreateNestedMap(this.pendingSkeletalUpdates, slideId).set(
            srv.id,
            srv,
        );
    }

    private applyServerSkeletalUpdate(
        slideId: string,
        srv: SkeletalDTO,
    ): void {
        if (!srv?.id || slideId !== this.currentSlideId()) return;

        const loc = localPointOf(this.pointServerToLocal, slideId, srv.id);
        if (!loc) {
            this.queueSkeletalUpdate(slideId, srv);
            return;
        }

        const { sk: curSkId, pid: curPid } = loc;

        const serverNeighbors: string[] = Array.isArray(srv.key_points)
            ? srv.key_points
            : [];
        const neighLocals = serverNeighbors
            .map((spid) => localPointOf(this.pointServerToLocal, slideId, spid))
            .filter(Boolean) as Array<{ sk: number; pid: string }>;

        const merges: Array<{ from: number; to: number; pids: string[] }> = [];

        this.skeletons.update((arr) => {
            let list = arr.map((sk) => {
                if (sk.id !== curSkId) return sk;

                const old = sk.points[curPid];
                if (!old) return sk;

                const nx =
                    typeof srv.x_pos === 'number' ? srv.x_pos : old.x;
                const ny =
                    typeof srv.y_pos === 'number' ? srv.y_pos : old.y;

                const pointLabelId = this.ensureSkelLabelIdForName(
                    srv.category ?? old.labelId,
                );

                const keep = sk.edges.filter(
                    ([a, b]) => a !== curPid && b !== curPid,
                );
                const add = neighLocals
                    .filter((n) => n.sk === curSkId)
                    .map((n) => [curPid, n.pid] as [string, string])
                    .filter(
                        ([a, b]) =>
                            !keep.some(
                                ([x, y]) =>
                                    (x === a && y === b) ||
                                    (x === b && y === a),
                            ),
                    );

                return {
                    ...sk,
                    color: srv.color ?? sk.color,
                    labelId: pointLabelId,
                    points: {
                        ...sk.points,
                        [curPid]: {
                            ...old,
                            x: nx,
                            y: ny,
                            labelId: pointLabelId,
                            isPending: false,
                        },
                    },
                    edges: [...keep, ...add],
                };
            });

            const foreign = neighLocals.filter((n) => n.sk !== curSkId);
            for (const n of foreign) {
                const fromIdx = list.findIndex((s) => s.id === n.sk);
                const toIdx = list.findIndex((s) => s.id === curSkId);
                if (fromIdx === -1 || toIdx === -1) continue;

                const from = list[fromIdx];
                const to = list[toIdx];

                merges.push({
                    from: from.id,
                    to: to.id,
                    pids: Object.keys(from.points),
                });

                const mergedPoints = { ...to.points, ...from.points };
                const mergedEdges = [
                    ...to.edges,
                    ...from.edges,
                    [curPid, n.pid] as [string, string],
                ];
                const dedup: [string, string][] = [];
                const seen = new Set<string>();
                for (const [a, b] of mergedEdges) {
                    const k1 = `${a}|${b}`;
                    const k2 = `${b}|${a}`;
                    if (seen.has(k1) || seen.has(k2)) continue;
                    seen.add(k1);
                    seen.add(k2);
                    dedup.push([a, b]);
                }

                list[toIdx] = {
                    ...to,
                    points: mergedPoints,
                    edges: dedup,
                };
                list.splice(fromIdx, 1);
            }

            return list;
        });

        if (merges.length) {
            const l2s = getOrCreateNestedMap(
                this.pointLocalToServer,
                slideId,
            );
            const s2l = getOrCreateNestedMap(
                this.pointServerToLocal,
                slideId,
            );
            for (const merge of merges) {
                for (const pid of merge.pids) {
                    const oldKey = pLocKey(merge.from, pid);
                    const srvId = l2s.get(oldKey);
                    l2s.delete(oldKey);
                    if (srvId) {
                        const newKey = pLocKey(merge.to, pid);
                        l2s.set(newKey, srvId);
                        s2l.set(srvId, { sk: merge.to, pid });
                    }
                }
            }
        }

        const pending = this.pendingSkeletalUpdates.get(slideId);
        pending?.delete(srv.id);

        this.requestPaint();
        this.updateScreenLabels();
    }

    private syncServerEdgesForPoint(slideId: string | null, skLocalId: number, pid: string) {
        if (!slideId || slideId !== this.currentSlideId()) return;
        const sk = this.skeletons().find((s) => s.id === skLocalId);
        if (!sk) return;
        const srvId = serverPointId(this.pointLocalToServer, slideId, skLocalId, pid);
        if (!srvId) return;

        const connected = sk.edges.filter(([a, b]) => a === pid || b === pid);
        if (connected.length === 0) {
            this.socket.updateSkeletal(slideId, srvId, { key_points: null });
            return;
        }

        for (const [a, b] of connected) {
            this.emitEdgeSync(sk, a, b);
        }
    }

    private serverNeighborIds(sid: string, sk: SkeletonAnn, pid: string): string[] {
        const neighbours: string[] = [];
        const seen = new Set<string>();
        for (const [a, b] of sk.edges) {
            let other: string | null = null;
            if (a === pid) other = b;
            else if (b === pid) other = a;
            if (!other) continue;
            const srv = serverPointId(this.pointLocalToServer, sid, sk.id, other);
            if (srv && !seen.has(srv)) {
                seen.add(srv);
                neighbours.push(srv);
            }
        }
        return neighbours;
    }

    /** clear when switching slides */
    private clearPointMapsForSlide(slideId: string) {
        this.pointLocalToServer.delete(slideId);
        this.pointServerToLocal.delete(slideId);
        this.pendingSkeletalUpdates.delete(slideId);
    }

    private unlinkPointId(slideId: string, skLocalId: number, pid: string) {
        const l2s = this.pointLocalToServer.get(slideId);
        const s2l = this.pointServerToLocal.get(slideId);
        if (!l2s) return;
        const key = pLocKey(skLocalId, pid);
        const srv = l2s.get(key);
        if (srv) s2l?.delete(srv);
        l2s.delete(key);
    }

    private emitBoxState(localId: Id) {
        const sid = this.currentSlideId();
        if (!sid) return;
        const srvId = this.boxServerId(sid, localId);
        if (!srvId) return;
        const box = this.boxes().find((b) => b.id === localId);
        if (!box) return;
        this.socket.updateBoundingBox(sid, srvId, {
            x_pos: box.x,
            y_pos: box.y,
            x_long: box.w,
            y_long: box.h,
            color: box.color,
            category: this.boxCategoryValue(box.labelId),
        });
    }

    private emitSkeletonAppearanceFor(skLocalId: number) {
        const sid = this.currentSlideId();
        if (!sid) return;
        const sk = this.skeletons().find((s) => s.id === skLocalId);
        if (!sk) return;
        for (const pid of Object.keys(sk.points)) {
            const srvPointId = serverPointId(
                this.pointLocalToServer,
                sid,
                sk.id,
                pid
            );
            if (!srvPointId) continue;
            const point = sk.points[pid];
            const label = this.skelCategoryValue(point?.labelId ?? sk.labelId);
            const neighborIds = this.serverNeighborIds(sid, sk, pid);
            this.socket.updateSkeletal(sid, srvPointId, {
                color: sk.color,
                category: label,
                key_points: neighborIds.length ? neighborIds : null,
            });
        }
    }

    private getTargetSkeletonId(): number | null {
        const sel = this.selection();
        if (sel?.type === 'skeleton' && typeof sel.id === 'number')
            return sel.id;
        if (this.lastEditedSkId != null) return this.lastEditedSkId;
        // fallback: first skeleton (or null)
        return this.skeletons()[0]?.id ?? null;
    }
    /** After adding an edge locally, call this to sync both endpoints to the server */
    private emitEdgeSync(sk: SkeletonAnn, aPid: string, bPid: string) {
        const sid = this.currentSlideId();
        if (!sid) return;

        const aSrv = serverPointId(this.pointLocalToServer, sid, sk.id, aPid);
        const bSrv = serverPointId(this.pointLocalToServer, sid, sk.id, bPid);
        if (!aSrv || !bSrv) return;

        // Build FULL key_points arrays (server ids) for each endpoint
        const toSrv = (pid: string) =>
            serverPointId(this.pointLocalToServer, sid, sk.id, pid) || undefined;

        const aNeighbors = new Set<string>();
        for (const [x, y] of sk.edges) {
            if (x === aPid) {
                const id = toSrv(y);
                if (id) aNeighbors.add(id);
            }
            if (y === aPid) {
                const id = toSrv(x);
                if (id) aNeighbors.add(id);
            }
        }
        aNeighbors.add(bSrv);
        const aSend = Array.from(aNeighbors);

        const bNeighbors = new Set<string>();
        for (const [x, y] of sk.edges) {
            if (x === bPid) {
                const id = toSrv(y);
                if (id) bNeighbors.add(id);
            }
            if (y === bPid) {
                const id = toSrv(x);
                if (id) bNeighbors.add(id);
            }
        }
        bNeighbors.add(aSrv);
        const bSend = Array.from(bNeighbors);

        this.socket.updateSkeletal(sid, aSrv, {
            key_points: aSend.length ? aSend : null,
        });
        this.socket.updateSkeletal(sid, bSrv, {
            key_points: bSend.length ? bSend : null,
        });
    }
}
