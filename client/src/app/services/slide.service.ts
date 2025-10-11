import { inject, Injectable } from '@angular/core';
import { ProjectResponseDTO } from './project.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './Auth.service';
import { firstValueFrom } from 'rxjs';
import { buildApiUrl } from '../config/api.config';

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
    return this.http.post<CreateSlideDTO>(buildApiUrl(`/slide/${projectId}`), null, {headers: header});
  }

  updateSlide(projectId: string, slideId: string, imageFormData: FormData) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.patch<UpdateSlideDTO>(buildApiUrl(`/slide/${projectId}/${slideId}`), imageFormData, {headers: header});
  }

  getSlides(projectId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.get<UpdateSlideDTO[]>(buildApiUrl(`/slide/get_all/${projectId}`), {headers: header});
  }

  getImage(slideId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.get(buildApiUrl(`/slide/image/${slideId}`), {headers: header, responseType: 'blob', observe: 'response'});
  }

  getComments(slideId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.get<getCommentDTO>(buildApiUrl(`/slide/comments/${slideId}`), {headers: header});
  }

  deleteSlide(slideId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.delete(buildApiUrl(`/slide/${slideId}`), {headers: header});
  }

   /**
   * Promise wrapper over getSlides(projectId).
   * Returns just the slide IDs (and projectId) in the same order the API gives.
   */
  async listSlidesPromise(projectId: string): Promise<{ id: string; projectId: string; imageRoute?: string }[]> {
    const res = await firstValueFrom(this.getSlides(projectId)); // UpdateSlideDTO[]
    return res.map(s => ({ id: s.id, projectId: s.projectId, imageRoute: (s as any).imageRoute }));
  }

  /**
   * Promise wrapper over getImage(slideId) that returns a Blob body.
   */
  async getSlideImageBlob(slideId: string): Promise<Blob> {
    const httpRes = await firstValueFrom(this.getImage(slideId)); // HttpResponse<Blob>
    return httpRes.body as Blob;
  }

  autoAnnotate(projectId: string, slideIds: string[]) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.post(buildApiUrl(`/ai-microservice/ai_auto/${projectId}`), {slideIds: slideIds}, {headers: header});
  }
}
