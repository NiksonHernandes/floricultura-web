import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ConfirmarExclusao, ConfirmarExclusaoDados } from './confirmar-exclusao';

/**
 * Extensão ADITIVA do diálogo compartilhado (T-M6-06b — SPEC-M6 §3.15).
 *
 * Arquivo NOVO de propósito: `confirmar-exclusao.spec.ts` é herdado de `develop` e os 5 casos dele
 * não são tocados (anti-burla §10 #31). O que falta provar é justamente o que a extensão promete —
 * que o DEFAULT continua sendo o texto de produto para os 4 chamadores atuais, e que um chamador
 * novo consegue trocar o vocabulário sem tocar no componente.
 */
describe('ConfirmarExclusao — entidade/contexto opcionais (T-M6-06b)', () => {
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

  it('sem `entidade`, o texto é EXATAMENTE o de produto (os 4 chamadores não mudam)', () => {
    const el = montar({ nome: 'Rosa Vermelha' });

    expect(el.querySelector('.alerta__titulo')?.textContent?.trim()).toBe('Excluir produto');
    expect(el.querySelector('.acao-perigo')?.textContent).toContain('Excluir produto');
    expect(el.querySelector('.alerta__pergunta')?.textContent?.replace(/\s+/g, ' ')).toContain(
      'excluir Rosa Vermelha da prateleira?',
    );
    expect(el.querySelector('.alerta__aviso')?.textContent).toContain(
      'O histórico de movimentações é preservado, mas o produto não pode ser recuperado.',
    );
  });

  it('com `entidade`/`contexto`, fala de cor — e o aviso de irreversibilidade continua', () => {
    const el = montar({
      nome: 'CINZA-ESCURO',
      entidade: 'cor',
      contexto: 'Os produtos que usam esta cor impedem a exclusão.',
    });

    expect(el.querySelector('.alerta__titulo')?.textContent?.trim()).toBe('Excluir cor');
    const botao = el.querySelector('.acao-perigo')?.textContent ?? '';
    expect(botao).toContain('Excluir cor');
    expect(botao).not.toContain('produto');
    expect(el.querySelector('.alerta__nome')?.textContent).toBe('CINZA-ESCURO');
    // "da prateleira" é vocabulário de estoque e some; o nome canônico vai como veio (R1d).
    expect(el.querySelector('.alerta__pergunta')?.textContent).not.toContain('prateleira');
    const aviso = el.querySelector('.alerta__aviso')?.textContent ?? '';
    expect(aviso).toContain('irreversível');
    expect(aviso).toContain('Os produtos que usam esta cor impedem a exclusão.');
    expect(aviso).not.toContain('movimentações');
  });
});
