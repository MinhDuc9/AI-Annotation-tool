import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterModule } from '@angular/router';
import { f } from "../../../node_modules/.pnpm/@angular+material@20.1.4_7902b7d345d4b3d15ab09c126d6f23c9/node_modules/@angular/material/icon-module.d-COXCrhrh";
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { ProjectDialogueComponent } from '../project-dialogue/project-dialogue.component';

@Component({
  selector: 'app-sidebar',
  imports: [RouterModule, CommonModule, MatIcon],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  // Code taken from
  // https://www.youtube.com/watch?v=ZRtVGFtIUjs&t=856s&pp=ygUPYW5ndWxhciBzaWRlYmFy
  // and modified to suit the application
  isLeftSidebarCollapsed = input.required<boolean>();
  changeIsLeftSidebarCollapsed = output<boolean>();
  projectCreated = output<boolean>();

  private dialog = inject(MatDialog);

  items = [
    {
      routeLink: 'dashboard',
      icon: 'fa fa-home',
      label: 'Dashboard',
    },
  ];
      openDialog(): void {
        const dialogRef = this.dialog.open(ProjectDialogueComponent, {
            width: '960px',
            maxWidth: '80vw', // override the 80vw default cap
            // height: 'auto',
            maxHeight: '90vh',
            panelClass: 'dlg-xl', // optional (see B)
        });

        dialogRef.afterClosed().subscribe((result) => {
            this.projectCreated.emit(true);
        });
    }

  toggleCollapse(): void {
    this.changeIsLeftSidebarCollapsed.emit(!this.isLeftSidebarCollapsed());
  }

  closeSidenav(): void {
    this.changeIsLeftSidebarCollapsed.emit(true);
  }
}
