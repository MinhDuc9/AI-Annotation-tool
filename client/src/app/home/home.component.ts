import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from '../services/user.service';

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

  ngOnInit(): void { 
    if (!sessionStorage.getItem('token')) {
      this.router.navigate(['/login']);
    }
  }

  getUsers() {
    this.userService.getUsers().subscribe((users) => console.log(users));
  }

}
