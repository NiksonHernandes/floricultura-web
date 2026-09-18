import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ConfirmarEstorno, ConfirmarEstornoDados } from './confirmar-estorno';
import { Movimentacao } from '../../../core/models/produto.model';

/**
 * BUG-004 — o diálogo de estorno nunca foi medido a 375 px.
 *
 * Ele é o gatilho que **grava no ledger imutável** (§3.11-d): errar o toque aqui custa uma linha que
 * só se corrige com outro estorno. A folha declara `min-height: 44px` nos dois botões — e
 * **declaração não é medida** (AD-SQ-174: `min-height` no host já foi padding morto uma vez).
 *
 * ⚠️ Sentinela contra harness mudo: `.alerta__corpo` tem `padding: 0 1.5rem` (regra **fora** de
 * qualquer asserção). Sem folha, ela lê `0px` e o arquivo reprova antes de mentir verde.
 */
describe('ConfirmarEstorno — alvos de toque a 375px (BUG-004, CA-51/FC-02)', () => {
  const TOQUE_MINIMO = 44;

  const movimentacao: Movimentacao = {
    id: 87,
    produtoId: 5,
    produtoNome: 'Rosa Vermelha',
    tipo: 'SAIDA',
    quantidade: 12,
    quantidadeResultante: 88,
    motivo: 'Venda balcão',
    usuarioId: 3,
    usuarioNome: 'Ana',
    criadoEm: '2026-09-03T17:05:00Z',
    valorUnitario: 15.5,
    descontoTipo: 'PERCENTUAL',
    descontoValor: 10,
    totalBruto: 186.0,
    totalFinal: 167.4,
  };

  function iniciar(): ComponentFixture<ConfirmarEstorno> {
    const dados: ConfirmarEstornoDados = { movimentacao };
    TestBed.configureTestingModule({
      imports: [ConfirmarEstorno],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: jasmine.createSpyObj('MatDialogRef', ['close']) },
        { provide: MAT_DIALOG_DATA, useValue: dados },
      ],
    });
    const fixture = TestBed.createComponent(ConfirmarEstorno);
    fixture.detectChanges();
    return fixture;
  }

  function medir(fixture: ComponentFixture<ConfirmarEstorno>) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:375px;height:667px;border:0;position:absolute;left:-9999px';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write('<!DOCTYPE html><html><head></head><body></body></html>');
    doc.close();
    for (const folha of Array.from(document.querySelectorAll('style'))) {
      doc.head.appendChild(folha.cloneNode(true));
    }
    doc.body.appendChild((fixture.nativeElement as HTMLElement).cloneNode(true));
    void doc.body.offsetHeight;

    const altura = (sel: string) => {
      const el = doc.querySelector(sel) as HTMLElement | null;
      return el ? el.getBoundingClientRect().height : 0;
    };
    const corpo = doc.querySelector('.alerta__corpo') as HTMLElement | null;
    const medida = {
      folhas: doc.styleSheets.length,
      sentinelaPadding: corpo ? doc.defaultView!.getComputedStyle(corpo).paddingLeft : '',
      cancelar: altura('.botao-secundario'),
      confirmar: altura('.estorno__confirmar'),
      larguraTotal: (doc.querySelector('.alerta') as HTMLElement).getBoundingClientRect().width,
    };
    iframe.remove();
    return medida;
  }

  it('o harness ENXERGA estilo (sentinela contra harness mudo)', () => {
    const m = medir(iniciar());
    expect(m.folhas).toBeGreaterThan(0);
    expect(m.sentinelaPadding).toBe('24px'); // 1.5rem — regra fora de asserção
  });

  it('BUG-004: "Cancelar" e "Estornar" medem >= 44px, e o diálogo cabe em 375px', () => {
    const m = medir(iniciar());
    expect(m.cancelar).toBeGreaterThanOrEqual(TOQUE_MINIMO);
    expect(m.confirmar).toBeGreaterThanOrEqual(TOQUE_MINIMO);
    // Sem rolagem horizontal (CA-51): o diálogo não pode ser mais largo que a tela.
    expect(m.larguraTotal).toBeLessThanOrEqual(375);
  });
});
