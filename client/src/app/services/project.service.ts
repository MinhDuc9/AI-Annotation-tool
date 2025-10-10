import { inject, Injectable } from '@angular/core';
import { AuthService } from './Auth.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { buildApiUrl } from '../config/api.config';

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
    return this.http.post<ProjectResponseDTO>(buildApiUrl('/project'), { projectName: name}, {headers: header});
  }

  getProjects() {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.get<[Project]>(buildApiUrl('/project/all'), {headers: header});
  }

  getProjectUsers(projectId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.get<[ProjectUser]>(buildApiUrl(`/project/all_user_project/${projectId}`), {headers: header});
  }

  addWriteUser(userEmail: string, projectId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.patch<ProjectResponseDTO>(buildApiUrl(`/project/add_write_user/${userEmail}/${projectId}`), null, {headers: header});
  }

  addReadUser(userEmail: string, projectId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.patch<ProjectResponseDTO>(buildApiUrl(`/project/add_read_user/${userEmail}/${projectId}`), null, {headers: header});
  }

  deleteProject(projectId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.delete(buildApiUrl(`/project/${projectId}`), {headers: header});
  }
}
