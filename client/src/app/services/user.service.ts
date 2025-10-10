import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Inject, inject, Injectable } from '@angular/core';
import { AuthService } from './Auth.service';
import { buildApiUrl } from '../config/api.config';

@Injectable({
  providedIn: 'root'
})
export class UserService {

  http = inject(HttpClient);
  auth = inject(AuthService);

  constructor() { }

  getUsers() {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.post(buildApiUrl('/user'), {headers: header});
  }

  
}
