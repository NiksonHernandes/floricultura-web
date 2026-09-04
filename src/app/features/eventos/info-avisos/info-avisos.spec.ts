import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';

import { InfoAvisos } from './info-avisos';
import { AvisosEventosPreferencia } from '../../../core/services/avisos-eventos-preferencia';

interface Probe {
  fechar(): void;
  aoAlternarMostrar(e: MatSlideToggleChange): void;
}

/**
 * T-M4.1-5 (CA-9/CA-10): o diálogo explica as regras em LINGUAGEM DE NEGÓCIO (60 dias / último mês /
 * 7 dias / repete todo ano), sem jargão técnico, e fecha pelo botão (Esc/backdrop são do MatDialog).
 * T-M4.1-6 (CA-11): o toggle "Mostrar avisos na tela inicial" liga/desliga a preferência compartilhada.
 * Stub leve de `AvisosEventosPreferencia` (signal + definir spy) — sem AuthService/HttpClient.
 */
describe('InfoAvisos (ícone "i" — T-M4.1-5/6, CA-9/CA-10/CA-11)', () => {
  let fixture: ComponentFixture<InfoAvisos>;
  let ref: jasmine.SpyObj<MatDialogRef<InfoAvisos>>;
  let oculto: WritableSignal<boolean>;
  let definir: jasmine.Spy;

  beforeEach(() => {
    ref = jasmine.createSpyObj<MatDialogRef<InfoAvisos>>('MatDialogRef', ['close']);
    oculto = signal(false);
    definir = jasmine.createSpy('definir').and.callFake((v: boolean) => oculto.set(v));
    TestBed.configureTestingModule({
      imports: [InfoAvisos],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: ref },
        { provide: AvisosEventosPreferencia, useValue: { oculto, definir, alternar: () => {} } },
      ],
    });
    fixture = TestBed.createComponent(InfoAvisos);
    fixture.detectChanges();
  });

  it('mostra as regras em linguagem de negócio (60 dias / 7 dias / muda de cor / todo ano)', () => {
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('60 dias antes');
    expect(texto).toContain('a cada 7 dias');
    expect(texto).toContain('muda de cor');
    expect(texto).toContain('todo ano');
  });

  it('NÃO expõe jargão técnico (faixaUrgencia / diasAte / destaqueReforcado — CA-9)', () => {
    const texto = ((fixture.nativeElement as HTMLElement).textContent ?? '').toLowerCase();
    expect(texto).not.toContain('faixaurgencia');
    expect(texto).not.toContain('diasate');
    expect(texto).not.toContain('destaquereforcado');
  });

  it('tem um título de diálogo acessível (mat-dialog-title)', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('[mat-dialog-title]')).toBeTruthy();
  });

  it('o botão "Entendi" fecha o diálogo', () => {
    (fixture.componentInstance as unknown as Probe).fechar();
    expect(ref.close).toHaveBeenCalled();
  });

  // --- T-M4.1-6: toggle "Mostrar avisos na tela inicial" (CA-11) ---

  it('o toggle nasce marcado quando o aviso está visível (oculto=false)', () => {
    const sw = (fixture.nativeElement as HTMLElement).querySelector(
      '.avisos__preferencia button[role="switch"]',
    ) as HTMLButtonElement;
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('desmarcar "Mostrar avisos" persiste oculto=true (checked=false → definir(true)) — CA-11', () => {
    (fixture.componentInstance as unknown as Probe).aoAlternarMostrar({
      checked: false,
    } as MatSlideToggleChange);
    expect(definir).toHaveBeenCalledWith(true);
    expect(oculto()).toBeTrue();
  });

  it('remarcar "Mostrar avisos" volta a mostrar (checked=true → definir(false)) — CA-11', () => {
    oculto.set(true);
    (fixture.componentInstance as unknown as Probe).aoAlternarMostrar({
      checked: true,
    } as MatSlideToggleChange);
    expect(definir).toHaveBeenCalledWith(false);
    expect(oculto()).toBeFalse();
  });
});
