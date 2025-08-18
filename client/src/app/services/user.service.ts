import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Inject, inject, Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class UserService {

  http = inject(HttpClient);

  constructor() { }

  getUsers() {
    const token = sessionStorage.getItem('token');
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.get('http://localhost:8080/user', {headers: header});
  }

}
