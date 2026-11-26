import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { devAuthInterceptor } from './core/auth/dev-auth.interceptor';
import { provideZard } from '@/shared/core/provider/providezard';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([devAuthInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    provideZard(),
  ],
};
