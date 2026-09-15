import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ConfirmarExclusao, ConfirmarExclusaoDados } from './confirmar-exclusao';

/**
 * D10 — SPEC-M6.1 §3.8 (CA-23). Spec NOVO; os 5 casos herdados de `confirmar-exclusao.spec.ts` e
 * os 2 de `confirmar-exclusao.entidade.spec.ts` não são tocados.
 *
 * O diálogo é compartilhado por 5 chamadores (produtos, eventos, clientes, fornecedores, cores) e
 * o eyebrow prometia estoque a todos eles — falso em 4. O contrato do diálogo continua com
 * DOIS campos (`entidade`/`contexto`, §3.15 do SPEC-M6): o eyebrow vira literal neutro, não um
 * terceiro campo.
 */
describe('ConfirmarExclusao — eyebrow neutro do diálogo compartilhado (D10, CA-23)', () => {
  function montar(dados: ConfirmarExclusaoDados): HTMLElement {
    TestBed.configureTestingModule({
      imports: [ConfirmarExclusao],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: { close: () => undefined } },
        { provide: MAT_DIALOG_DATA, useValue: dados },
      ],
    });
    const fixture = TestBed.createComponent(ConfirmarExclusao);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('excluindo uma COR, o eyebrow é "Ateliê" e não fala de Estoque', () => {
    const el = montar({
      nome: 'CINZA-ESCURO',
      entidade: 'cor',
      contexto: 'Os produtos que usam esta cor impedem a exclusão.',
    });

    const eyebrow = el.querySelector('.alerta__eyebrow') as HTMLElement;
    expect(eyebrow.textContent?.trim()).toBe('Ateliê');
    expect(eyebrow.textContent).not.toContain('Estoque');
    // O título continua vindo do `entidade` — a D10 mexe só no eyebrow.
    expect(el.querySelector('.alerta__titulo')?.textContent?.trim()).toBe('Excluir cor');
  });
});
