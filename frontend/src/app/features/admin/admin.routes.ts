import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'validations' },
  {
    path: 'validations',
    title: 'Validations',
    loadComponent: () => import('./validations/validations-page').then((m) => m.ValidationsPage),
  },
  {
    path: 'plannings',
    title: 'Édition des plannings',
    loadComponent: () => import('./plannings/plannings-page').then((m) => m.PlanningsPage),
  },
];
