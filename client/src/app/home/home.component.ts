import { ChangeDetectionStrategy, Component, HostListener, inject, signal, type OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from '../services/user.service';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector: 'app-home',
  imports: [SidebarComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {

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

  username = signal(sessionStorage.getItem('username') || '');

  userService = inject(UserService);

  router = inject(Router);

  ngOnInit(): void { 
    this.isLeftSidebarCollapsed.set(this.screenWidth() < 768);
    if (!sessionStorage.getItem('token')) {
      this.router.navigate(['/login']);
    }
  }

  getUsers() {
    this.userService.getUsers().subscribe((users) => console.log(users));
  }

}
