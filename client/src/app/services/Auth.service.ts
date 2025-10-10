import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { jwtDecode, JwtPayload } from 'jwt-decode';
import { buildApiUrl } from '../config/api.config';

type MyClaims = JwtPayload & { id?: string; email?: string };

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    http = inject(HttpClient);

    constructor() {}

    login(email: string, password: string) {
        let token = this.http.post<string>(
            buildApiUrl('/user/login'),
            { email: email, password: password },
            { responseType: 'text' as 'json' }
        );
        return token;
    }

    register(userName: string, email: string, password: string) {
        let token = this.http.post<string>(
            buildApiUrl('/user/register'),
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
            const token = this.getToken();
            if (!token) return null;
            return jwtDecode<MyClaims>(token).id ?? null;
        } catch (Error) {
            console.error('Error decoding token:', Error);
            return null;
        }
    }
}
