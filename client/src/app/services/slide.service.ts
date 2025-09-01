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

}
