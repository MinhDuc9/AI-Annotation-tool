import { inject, Injectable } from '@angular/core';
import { ProjectResponseDTO } from './project.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './Auth.service';

export interface CreateSlideDTO {
  id: string;
  projectId: string;
  project: ProjectResponseDTO;
  imageRoute: string
}

export interface UpdateSlideDTO {
  id: string;
  projectId: string;
  imageRoute: string
}

export interface getSlidesDTO {
  id: string;
  projectId: string;
}

export interface getCommentDTO{
  id: string;
  projectId: string;
  comments: slideCommentDTO[]
}

export interface slideCommentDTO{
  id: string;
  slideId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string
}

export interface CommentModel{
  id: string;
  slideId: string;
  userId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  isPending?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SlideService {

  constructor() { }

  http = inject(HttpClient);
  auth = inject(AuthService);


  createSlide(projectId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.post<CreateSlideDTO>('http://localhost:8080/slide/' + projectId, null, {headers: header});
  }

  updateSlide(projectId: string, slideId: string, imageFormData: FormData) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.patch<UpdateSlideDTO>('http://localhost:8080/slide/' + projectId + '/' + slideId, imageFormData, {headers: header});
  }

  getSlides(projectId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.get<UpdateSlideDTO[]>('http://localhost:8080/slide/get_all/' + projectId, {headers: header});
  }

  getImage(slideId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.get('http://localhost:8080/slide/image/' + slideId, {headers: header, responseType: 'blob', observe: 'response'});
  }

  getComments(slideId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.get<getCommentDTO>('http://localhost:8080/slide/comments/' + slideId, {headers: header});
  }
}

