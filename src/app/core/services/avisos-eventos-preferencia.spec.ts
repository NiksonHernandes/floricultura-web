import { TestBed } from '@angular/core/testing';

import { AvisosEventosPreferencia } from './avisos-eventos-preferencia';
import { AuthService } from './auth.service';

/**
 * T-M4.1-6 (CA-11/CA-13, âncora #6): a preferência "desligar aviso" persiste por usuário×dispositivo
 * na chave `floricultura.avisos-eventos.oculto.<id>` (default = mostrar) e DEGRADA graciosamente se o
 * `localStorage` falhar (nunca lança). Stub leve de `AuthService` (só `usuarioAtual`) — sem HttpClient.
 */
describe('AvisosEventosPreferencia (T-M4.1-6, CA-11/CA-13)', () => {
  function criar(usuarioId: number | null): AvisosEventosPreferencia {
    TestBed.configureTestingModule({
      providers: [
        AvisosEventosPreferencia,
        {
          provide: AuthService,
          useValue: { usuarioAtual: () => (usuarioId != null ? { id: usuarioId } : null) },
        },
      ],
    });
    return TestBed.inject(AvisosEventosPreferencia);
  }

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('default = mostrar quando não há chave gravada (CA-11)', () => {
    expect(criar(7).oculto()).toBeFalse();
  });

  it('definir(true) grava "1" na chave do usuário e oculta; definir(false) remove e mostra (CA-11)', () => {
    const pref = criar(7);
    pref.definir(true);
    expect(pref.oculto()).toBeTrue();
    expect(localStorage.getItem('floricultura.avisos-eventos.oculto.7')).toBe('1');

    pref.definir(false);
    expect(pref.oculto()).toBeFalse();
    expect(localStorage.getItem('floricultura.avisos-eventos.oculto.7')).toBeNull();
  });

  it('alternar inverte mostrar↔ocultar', () => {
    const pref = criar(7);
    pref.alternar();
    expect(pref.oculto()).toBeTrue();
    pref.alternar();
    expect(pref.oculto()).toBeFalse();
  });

  it('persiste entre recargas do mesmo usuário: nova instância relê a chave (CA-11)', () => {
    criar(7).definir(true);
    TestBed.resetTestingModule();
    expect(criar(7).oculto()).toBeTrue();
  });

  it('a chave é por usuário: 7 oculto não afeta 9 (mesmo dispositivo)', () => {
    criar(7).definir(true);
    TestBed.resetTestingModule();
    expect(criar(9).oculto()).toBeFalse();
  });

  it('sem usuarioId (sessão não hidratada) usa a chave sem sufixo — fallback de dispositivo', () => {
    criar(null).definir(true);
    expect(localStorage.getItem('floricultura.avisos-eventos.oculto')).toBe('1');
  });

  it('valor corrompido/≠"1" ⇒ mostrar (default seguro — CA-13)', () => {
    localStorage.setItem('floricultura.avisos-eventos.oculto.7', 'lixo');
    expect(criar(7).oculto()).toBeFalse();
  });

  // --- Âncora #6: degradação graciosa (CA-13) ---

  it('localStorage que lança em getItem ⇒ oculto()=false, sem exceção propagada (CA-13)', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('indisponível');
    let pref!: AvisosEventosPreferencia;
    expect(() => (pref = criar(7))).not.toThrow();
    expect(pref.oculto()).toBeFalse();
  });

  it('localStorage que lança em setItem ⇒ definir não propaga; o signal reflete a escolha (CA-13)', () => {
    const pref = criar(7);
    spyOn(Storage.prototype, 'setItem').and.throwError('quota');
    expect(() => pref.definir(true)).not.toThrow();
    expect(pref.oculto()).toBeTrue(); // a sessão reflete, mesmo sem conseguir persistir
  });
});
