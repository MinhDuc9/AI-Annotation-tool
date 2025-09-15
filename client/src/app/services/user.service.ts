import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Inject, inject, Injectable } from '@angular/core';
import { AuthService } from './Auth.service';

@Injectable({
    providedIn: 'root',
})
export class UserService {
    http = inject(HttpClient);
    auth = inject(AuthService);

    constructor() {}

    getUsers() {
        const token = this.auth.getToken();
        const header = new HttpHeaders().set(
            'Authorization',
            'Bearer ' + token
        );
        return this.http.get('http://localhost:8080/user', { headers: header });
    }
}
