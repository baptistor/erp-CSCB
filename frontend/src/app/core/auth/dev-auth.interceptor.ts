import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Profil dev : ajoute X-Dev-User ; sur 401, renvoie vers la page de connexion. */
export const devAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const email = auth.devEmail();
  const request = email ? req.clone({ setHeaders: { 'X-Dev-User': email } }) : req;
  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.currentUser.set(null);
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};
