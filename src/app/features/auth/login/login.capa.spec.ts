import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { Login } from './login';
import { AuthService } from '../../../core/services/auth.service';

/**
 * A3 (SPEC-M6.1 §3.9, CA-29) — a capa do login é consumida pelo WebP.
 *
 * O que este arquivo prova: a URL que o CSS aponta. O que ele NÃO prova (§12 #13):
 * não baixa o arquivo, não pesa bytes e não garante que o servidor entrega WebP —
 * isso são o §10 #19 (medição em disco) e o smoke do dono (§10 #18).
 *
 * Caso novo em ARQUIVO NOVO (AD-SQ-147): `login.spec.ts` é herdado e não é tocado.
 */
describe('Login — capa do ateliê (A3, CA-29)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideNoopAnimations(),
        {
          provide: AuthService,
          useValue: jasmine.createSpyObj<Pick<AuthService, 'login'>>('AuthService', ['login']),
        },
        {
          provide: Router,
          useValue: jasmine.createSpyObj<Pick<Router, 'navigate'>>('Router', ['navigate']),
        },
      ],
    });
  });

  it('o painel do ateliê usa o WebP e não referencia mais o PNG', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    const painel = fixture.nativeElement.querySelector('.login__atelier') as HTMLElement;
    expect(painel).withContext('.login__atelier existe no DOM').toBeTruthy();

    const fundo = getComputedStyle(painel).backgroundImage;
    expect(fundo).toContain('atelie-floral.webp');
    expect(fundo).not.toContain('.png');
    // O véu continua sendo pintado junto com a imagem (o `background` é shorthand):
    // se a declaração inteira caísse, o texto claro ficaria ilegível (§12 #12).
    expect(fundo).toContain('gradient');
  });
});
