import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// inject() doit être appelé avant tout await (contexte d'injection synchrone)
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.loadMe();
  return user ? true : router.createUrlTree(['/login']);
};

/** Confort UX uniquement : le contrôle de rôle réel est fait côté serveur. */
export const adminGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.loadMe();
  if (!user) return router.createUrlTree(['/login']);
  return user.role === 'ADMIN' ? true : router.createUrlTree(['/planning']);
};
