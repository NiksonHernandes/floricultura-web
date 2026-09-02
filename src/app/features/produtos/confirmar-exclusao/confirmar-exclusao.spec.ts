import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ConfirmarExclusao, ConfirmarExclusaoDados } from './confirmar-exclusao';

/** Probe do interno protegido — testamos comportamento observável (fecha true/false + DOM). */
interface Probe {
  confirmar(): void;
  cancelar(): void;
}

describe('ConfirmarExclusao (T-M2-9 — CA-20 delete / FC-08)', () => {
  let fixture: ComponentFixture<ConfirmarExclusao>;
  let ref: jasmine.SpyObj<MatDialogRef<ConfirmarExclusao, boolean>>;

  function montar(dados: ConfirmarExclusaoDados): void {
    ref = jasmine.createSpyObj<MatDialogRef<ConfirmarExclusao, boolean>>('MatDialogRef', ['close']);
    TestBed.configureTestingModule({
      imports: [ConfirmarExclusao],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: dados },
      ],
    });
    fixture = TestBed.createComponent(ConfirmarExclusao);
    fixture.detectChanges();
  }

  it('exibe o NOME do produto na confirmação (FC-08 — confirmação explícita com o nome)', () => {
    montar({ nome: 'Rosa Vermelha' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.alerta__nome')?.textContent).toContain('Rosa Vermelha');
  });

  it('avisa que a exclusão é irreversível (FC-08)', () => {
    montar({ nome: 'Girassol' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.alerta__aviso')?.textContent?.toLowerCase()).toContain('irreversível');
  });

  it('confirmar → fecha o diálogo com true (dispara o DELETE na lista-mãe)', () => {
    montar({ nome: 'Girassol' });
    (fixture.componentInstance as unknown as Probe).confirmar();
    expect(ref.close).toHaveBeenCalledOnceWith(true);
  });

  it('cancelar → fecha com false (nada é excluído)', () => {
    montar({ nome: 'Girassol' });
    (fixture.componentInstance as unknown as Probe).cancelar();
    expect(ref.close).toHaveBeenCalledOnceWith(false);
  });

  it('o clique no botão "Excluir produto" fecha com true', () => {
    montar({ nome: 'Girassol' });
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.acao-perigo') as HTMLButtonElement).click();
    expect(ref.close).toHaveBeenCalledOnceWith(true);
  });
});
