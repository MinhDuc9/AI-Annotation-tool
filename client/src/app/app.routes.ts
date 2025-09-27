import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';

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
        loadComponent: () => import('./annotation-edit/annotation-edit.component').then(m => m.AnnotationEditComponent)
    },
    {
        path: '**',
        redirectTo: ''
    }
];
