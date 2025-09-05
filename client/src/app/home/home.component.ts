import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from '../services/user.service';
import { MatDialog } from '@angular/material/dialog';
import { ProjectDialogueComponent } from '../project-dialogue/project-dialogue.component';

@Component({
    selector: 'app-home',
    imports: [],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
    username = signal(sessionStorage.getItem('username') || '');

    userService = inject(UserService);

    router = inject(Router);

    readonly dialog = inject(MatDialog);

    openDialog(): void {
        const dialogRef = this.dialog.open(ProjectDialogueComponent, {
            width: '40vw',
            maxWidth: '80vw', // override the 80vw default cap
            // height: 'auto',
            maxHeight: '90vh',
            panelClass: 'dlg-xl', // optional (see B)
        });
    }

    ngOnInit(): void {
        if (!sessionStorage.getItem('token')) {
            this.router.navigate(['/login']);
        }
    }

    getUsers() {
        this.userService.getUsers().subscribe((users) => console.log(users));
    }
}
