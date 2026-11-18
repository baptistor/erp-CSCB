import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { devAuthInterceptor } from './dev-auth.interceptor';

describe('devAuthInterceptor', () => {
  const devEmail = signal<string | null>(null);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([devAuthInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { devEmail, currentUser: signal(null) } },
      ],
    });
  });

  it('ajoute le header X-Dev-User quand un email dev est défini', () => {
    devEmail.set('alice.martin@exemple.fr');
    TestBed.inject(HttpClient).get('/api/me').subscribe();
    const req = TestBed.inject(HttpTestingController).expectOne('/api/me');
    expect(req.request.headers.get('X-Dev-User')).toBe('alice.martin@exemple.fr');
  });

  it("n'ajoute rien sans email dev", () => {
    devEmail.set(null);
    TestBed.inject(HttpClient).get('/api/me').subscribe();
    const req = TestBed.inject(HttpTestingController).expectOne('/api/me');
    expect(req.request.headers.has('X-Dev-User')).toBe(false);
  });
});
