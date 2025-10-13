import { CanActivateFn, Router, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { inject } from '@angular/core';

export const authGuard: CanActivateFn = () => {
  const token = sessionStorage.getItem('token');
  return token ? true : inject(Router).parseUrl('/login');
};

export const routes: Routes = [
    {
        path: '',
        pathMatch: 'full',
        component: HomeComponent
    },
    {
        path: 'register',
        loadComponent: () => import('./register/register.component').then(m => m.RegisterComponent)
    },
    {
        path: 'login',
        loadComponent: () => import('./login/login.component').then(m => m.LoginComponent)
    },
    {
        path: 'annotate/:project_id',
        loadComponent: () => import('./annotation-edit/annotation-edit.component').then(m => m.AnnotationEditComponent),
        canActivate: [authGuard]
    },
    {
        path: 'guide',
        loadComponent: () => import('./guide/guide.component').then(m => m.GuideComponent)
    },
    {
        path: '**',
        redirectTo: ''
    }
];
