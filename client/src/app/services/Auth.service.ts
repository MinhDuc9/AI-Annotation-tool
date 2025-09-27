import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { jwtDecode } from 'jwt-decode';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    http = inject(HttpClient);

    constructor() {}

    login(email: string, password: string) {
        let token = this.http.post<string>(
            'http://localhost:8080/user/login',
            { email: email, password: password },
            { responseType: 'text' as 'json' }
        );
        return token;
    }

    register(userName: string, email: string, password: string) {
        let token = this.http.post<string>(
            'http://localhost:8080/user/register',
            { userName: userName, email: email, password: password },
            { responseType: 'text' as 'json' }
        );
        return token;
    }

    setToken(token: string) {
        sessionStorage.setItem('token', token);
    }

    getToken(): string | null {
        return sessionStorage.getItem('token');
    }

    getUserId(): string | null {
        try {
            return jwtDecode(this.getToken()!).sub!;
        } catch (Error) {
            console.error('Error decoding token:', Error);
            return null;
        }
    }
}
