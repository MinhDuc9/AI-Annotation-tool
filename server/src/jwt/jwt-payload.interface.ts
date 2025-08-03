export interface JwtPayload {
    id: string;
    email: string;
    [key: string]: string;
}
