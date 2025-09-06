import { ChangeDetectionStrategy, Component, HostListener, inject, signal, WritableSignal, type OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from '../services/user.service';
import { MatDialog } from '@angular/material/dialog';
import { ProjectDialogueComponent } from '../project-dialogue/project-dialogue.component';
import { ProjectService } from '../services/project.service';
import { SlideService } from '../services/slide.service';
import { MatCardImage, MatCardModule } from "@angular/material/card";
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { TitleCasePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { SidebarComponent } from '../sidebar/sidebar.component';

interface ProjectCardVM {
  id: string;
  name: string;
  role: string;
  imgUrl?: string;          // object URL or placeholder
  slideId?: string | null; // first slide id if found
}

@Component({
    selector: 'app-home',
    imports: [MatCardModule, TitleCasePipe, MatButtonModule, SidebarComponent],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {

    username = signal(sessionStorage.getItem('username') || '');

    userService = inject(UserService);

    router = inject(Router);

    private projectService = inject(ProjectService);

    private slideService = inject(SlideService);

    readonly dialog = inject(MatDialog);

    cards: WritableSignal<ProjectCardVM[]> = signal([]);
    private objectUrls: string[] = [];

    openDialog(): void {
        const dialogRef = this.dialog.open(ProjectDialogueComponent, {
            width: '960px',
            maxWidth: '80vw', // override the 80vw default cap
            // height: 'auto',
            maxHeight: '90vh',
            panelClass: 'dlg-xl', // optional (see B)
        });

        dialogRef.afterClosed().subscribe((result) => {
            this.load();
        });
    }

    isLeftSidebarCollapsed = signal<boolean>(false);
    screenWidth = signal<number>(window.innerWidth);

    @HostListener('window:resize')
    onResize() {
      this.screenWidth.set(window.innerWidth);
      if (this.screenWidth() < 768) {
        this.isLeftSidebarCollapsed.set(true);
      }
    }

    changeIsLeftSidebarCollapsed(isLeftSidebarCollapsed: boolean): void {
      this.isLeftSidebarCollapsed.set(isLeftSidebarCollapsed);
    }

    ngOnInit(): void {
        if (!sessionStorage.getItem('token')) {
            this.router.navigate(['/login']);
        }

        this.isLeftSidebarCollapsed.set(this.screenWidth() < 768);
        if (!sessionStorage.getItem('token')) {
          this.router.navigate(['/login']);
        }

        this.load();
    }

    getUsers() {
        this.userService.getUsers().subscribe((users) => console.log(users));
    }

    private load(): void {
        this.projectService
            .getProjects()
            .pipe(
                switchMap((projects) => {
                    const vms: ProjectCardVM[] = (projects ?? []).map((p) => {
                        const id = (p as any).projectId || p.id;
                        return {
                            id,
                            name: p.projectName,
                            role: p.role,
                            slideId: null,
                        };
                    });
                    this.cards.set(vms);

                    const perProject$ = vms.map((vm, index) =>
                        this.slideService.getSlides(vm.id).pipe(
                            map(
                                (slides) =>
                                    slides?.[0]?.id as string | undefined
                            ),
                            switchMap((firstSlideId) => {
                                if (!firstSlideId)
                                    return of({
                                        index,
                                        url: undefined,
                                        slideId: null,
                                    });
                                return this.slideService
                                    .getImage(firstSlideId)
                                    .pipe(
                                        map((res) => res.body as Blob),
                                        map((blob) => {
                                            const url =
                                                URL.createObjectURL(blob);
                                            this.objectUrls.push(url);
                                            return {
                                                index,
                                                url,
                                                slideId: firstSlideId,
                                            };
                                        }),
                                        catchError(() =>
                                            of({
                                                index,
                                                url: undefined,
                                                slideId: null,
                                            })
                                        )
                                    );
                            }),
                            catchError(() =>
                                of({ index, url: undefined, slideId: null })
                            )
                        )
                    );

                    return perProject$.length ? forkJoin(perProject$) : of([]);
                })
            )
            .subscribe((updates) => {
                if (!updates?.length) return;
                const next = this.cards().slice();
                for (const { index, url, slideId } of updates) {
                    if (next[index])
                        next[index] = { ...next[index], imgUrl: url, slideId };
                }
                this.cards.set(next);
            });
    }

    onImgError(ev: Event) {
        const img = ev.target as HTMLImageElement;
        // prevent loops if the placeholder fails too
        img.onerror = null;
        img.src = 'placeholder.svg';
    }
    ngOnDestroy(): void {
        // Revoke any created Object URLs to avoid leaks
        for (const u of this.objectUrls) URL.revokeObjectURL(u);
        this.objectUrls = [];
    }
}
