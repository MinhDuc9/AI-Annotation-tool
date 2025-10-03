import { inject, Injectable } from '@angular/core';
import { AuthService } from './Auth.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export interface ProjectResponseDTO {
  id: string;
  projectName: string
  userRoles: Array<UserRolesDTO>;
}

export interface Project {
  projectName: string;
  id: string;
  projectId: string;
  userId: string;
  role: "admin" | "write" | "read";
}

export interface UserRolesDTO {
  id: string;
  projectId: string;
  userId: string;
  role: "admin" | "write" | "read";
}

export interface ProjectUser {
  role: "admin" | "write" | "read";
  userId: string;
  userName: string;
  email: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProjectService {

  http = inject(HttpClient);
  auth = inject(AuthService);

  constructor() { }


  createProject(name: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.post<ProjectResponseDTO>('http://localhost:8080/project', { projectName: name}, {headers: header});
  }

  getProjects() {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.get<[Project]>('http://localhost:8080/project/all', {headers: header});
  }

  getProjectUsers(projectId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.get<[ProjectUser]>('http://localhost:8080/project/all_user_project/' + projectId, {headers: header});
  }

  addWriteUser(userEmail: string, projectId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.patch<ProjectResponseDTO>('http://localhost:8080/project/add_write_user/' + userEmail + '/' + projectId, null, {headers: header});
  }

  addReadUser(userEmail: string, projectId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.patch<ProjectResponseDTO>('http://localhost:8080/project/add_read_user/' + userEmail + '/' + projectId, null, {headers: header});
  }

  deleteProject(projectId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.delete('http://localhost:8080/project/' + projectId, {headers: header});
  }
}
