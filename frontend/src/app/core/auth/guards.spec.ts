import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { CurrentUser } from '../../api/models';
import { AuthService } from './auth.service';
import { adminGuard, authGuard } from './guards';

describe('guards', () => {
  let user: CurrentUser | null;

  beforeEach(() => {
    user = null;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { loadMe: async () => user } },
      ],
    });
  });

  const runAdmin = () =>
    TestBed.runInInjectionContext(() => adminGuard({ path: 'admin' }, [], {} as never) as Promise<boolean | UrlTree>);
  const runAuth = () =>
    TestBed.runInInjectionContext(() => authGuard({} as never, {} as never) as Promise<boolean | UrlTree>);
  const url = (result: boolean | UrlTree) => TestBed.inject(Router).serializeUrl(result as UrlTree);

  it('adminGuard laisse passer un ADMIN', async () => {
    user = { id: 1, email: 'admin@exemple.fr', role: 'ADMIN' };
    expect(await runAdmin()).toBe(true);
  });

  it('adminGuard refuse un EMPLOYEE (redirection planning)', async () => {
    user = { id: 2, email: 'alice@exemple.fr', role: 'EMPLOYEE' };
    expect(url(await runAdmin())).toBe('/planning');
  });

  it('adminGuard renvoie vers /login si non connecté', async () => {
    expect(url(await runAdmin())).toBe('/login');
  });

  it('authGuard renvoie vers /login si non connecté', async () => {
    expect(url(await runAuth())).toBe('/login');
  });
});
