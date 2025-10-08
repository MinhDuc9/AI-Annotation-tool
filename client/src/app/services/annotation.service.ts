import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { AuthService } from './Auth.service';
import { UpdateSlideDTO } from './slide.service';

export interface CreateBoundingBoxResponseDTO{
  id: string;
  slideId: string;
  slide: UpdateSlideDTO;
  x_pos: number;
  y_pos: number;
  x_long: number;
  y_long: number;
  color: string;
  category: string;
}

export interface CreateSkeletalResponseDTO{
  id: string;
  slideId: string;
  slide: UpdateSlideDTO;
  x_pos: number;
  y_pos: number;
  key_points: string[] | null; //null if empty else contains connected ids of points
  color: string;
  category: string;
}

export interface BoundingBoxDTO{
  id: string;
  slideId: string;
  x_pos: number;
  y_pos: number;
  x_long: number;
  y_long: number;
  color: string;
  category: string;
}

export interface SkeletalDTO{
  id: string;
  slideId: string;
  x_pos: number;
  y_pos: number;
  key_points: string[] | null; //null if empty else contains connected ids of points
  color: string;
  category: string;
}

export interface BoundingBoxBody{
  x_pos: number;
  y_pos: number;
  x_long: number;
  y_long: number;
  color: string;
  category: string;
}

export interface SkeletalBody{
  x_pos: number;
  y_pos: number;
  key_points: string[] | null; //null if empty else contains connected ids of points
  color: string;
  category: string;
}

export interface BoundingBoxPatchBody{
  x_pos: number | null;
  y_pos: number | null;
  x_long: number | null;
  y_long: number | null;
  color: string | null;
  category: string | null;
}

export interface SkeletalPatchBody{
  x_pos: number | null;
  y_pos: number | null;
  key_points: string[] | null; //if null sets all as disconnected
  color: string | null;
  category: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AnnotationService {

  http = inject(HttpClient);
  auth = inject(AuthService);

  constructor() { }

  
  getAllBoundingBox(projectId: string, slideId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.get<BoundingBoxDTO[]>('http://localhost:8080/slide/' + projectId + '/' + slideId + '/' + "bounding_box", {headers: header});
  }

  getAllSkeletal(projectId: string, slideId: string) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.get<SkeletalDTO[]>('http://localhost:8080/slide/' + projectId + '/' + slideId + '/' + "skeletal", {headers: header});
  }

  //Use for AI
  createBoundingBox(projectId: string, slideId: string, body: BoundingBoxBody) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.post<BoundingBoxDTO>('http://localhost:8080/slide/' + projectId + '/' + slideId + '/' + "bounding_box", body, {headers: header});
  }

  //Use for AI
  createSkeletal(projectId: string, slideId: string, body: SkeletalBody) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.post<SkeletalDTO>('http://localhost:8080/slide/' + projectId + '/' + slideId + '/' + "skeletal", body, {headers: header});
  }

  patchBoundingBox(projectId: string, slideId: string, body: BoundingBoxPatchBody) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.patch<BoundingBoxDTO>('http://localhost:8080/slide/' + projectId + '/' + slideId + '/' + "bounding_box", body, {headers: header});
  }

  //Main use to connect points
  patchSkeletal(projectId: string, slideId: string, body: SkeletalPatchBody) {
    const token = this.auth.getToken();
    const header = new HttpHeaders().set("Authorization", "Bearer " + token);
    return this.http.patch<SkeletalDTO>('http://localhost:8080/slide/' + projectId + '/' + slideId + '/' + "skeletal", body, {headers: header});
  }
}
