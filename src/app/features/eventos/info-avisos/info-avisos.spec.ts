import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialogRef } from '@angular/material/dialog';

import { InfoAvisos } from './info-avisos';

interface Probe {
  fechar(): void;
}

/**
 * T-M4.1-5 (CA-9/CA-10): o diálogo explica as regras em LINGUAGEM DE NEGÓCIO (60 dias / último mês /
 * 7 dias / repete todo ano), sem jargão técnico, e fecha pelo botão (Esc/backdrop são do MatDialog).
 */
describe('InfoAvisos (ícone "i" — T-M4.1-5, CA-9/CA-10)', () => {
  let fixture: ComponentFixture<InfoAvisos>;
  let ref: jasmine.SpyObj<MatDialogRef<InfoAvisos>>;

  beforeEach(() => {
    ref = jasmine.createSpyObj<MatDialogRef<InfoAvisos>>('MatDialogRef', ['close']);
    TestBed.configureTestingModule({
      imports: [InfoAvisos],
      providers: [provideNoopAnimations(), { provide: MatDialogRef, useValue: ref }],
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
});
