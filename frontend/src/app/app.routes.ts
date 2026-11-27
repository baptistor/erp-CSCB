import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth/guards';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Connexion',
    loadComponent: () => import('./core/auth/dev-login').then((m) => m.DevLogin),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'planning' },
      {
        path: 'planning',
        title: 'Planning',
        loadComponent: () => import('./features/planning/planning-page').then((m) => m.PlanningPage),
      },
      {
        path: 'admin',
        canMatch: [adminGuard],
        loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
      },
    ],
  },
  { path: '**', redirectTo: 'planning' },
];
