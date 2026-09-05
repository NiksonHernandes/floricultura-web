import { TestBed } from '@angular/core/testing';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { VisualizarLancamento, VisualizarLancamentoDados } from './visualizar-lancamento';
import { Movimentacao } from '../../../core/models/produto.model';

// O DatePipe com locale explícito 'pt-BR' exige a locale data registrada (app.config faz em runtime).
registerLocaleData(localePt, 'pt-BR');

/**
 * RF-3 (R-CA-11) — ficha "Visualizar lançamento". Spec NOVO. Mostra produto, tipo, quantidade, autor,
 * data pt-BR e a contraparte QUANDO houver. Dados FICTÍCIOS (LGPD): "Sítio Boa Flor" / "Maria Flores".
 */
describe('VisualizarLancamento (RF-3, R-CA-11)', () => {
  let ref: jasmine.SpyObj<MatDialogRef<VisualizarLancamento>>;

  const base: Movimentacao = {
    id: 1,
    produtoId: 5,
    produtoNome: 'Rosa Vermelha',
    tipo: 'ENTRADA',
    quantidade: 10,
    quantidadeResultante: 30,
    motivo: 'Compra semanal',
    usuarioId: 3,
    usuarioNome: 'Ana',
    fornecedorId: 3,
    fornecedorNome: 'Sítio Boa Flor',
    clienteId: null,
    clienteNome: null,
    criadoEm: '2026-09-03T17:05:00Z',
  };

  function montar(m: Movimentacao): HTMLElement {
    ref = jasmine.createSpyObj<MatDialogRef<VisualizarLancamento>>('MatDialogRef', ['close']);
    const dados: VisualizarLancamentoDados = { movimentacao: m };
    TestBed.configureTestingModule({
      imports: [VisualizarLancamento],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: dados },
      ],
    });
    const fixture = TestBed.createComponent(VisualizarLancamento);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('mostra produto, tipo, quantidade, autor e data pt-BR (America/Sao_Paulo)', () => {
    const el = montar(base);
    expect(el.textContent).toContain('Rosa Vermelha');
    expect(el.querySelector('.ficha__tipo')?.textContent).toContain('Entrada');
    expect(el.textContent).toContain('30'); // quantidade resultante
    expect(el.textContent).toContain('Ana'); // autor
    // 17:05Z → 14:05 em America/Sao_Paulo
    expect(el.querySelector('time')?.textContent).toContain('03/09/2026 14:05');
  });

  it('ENTRADA com fornecedor mostra o campo "Fornecedor" + nome', () => {
    const el = montar(base);
    const cp = el.querySelector('.ficha__campo--contraparte');
    expect(cp?.querySelector('dt')?.textContent).toContain('Fornecedor');
    expect(cp?.querySelector('dd')?.textContent).toContain('Sítio Boa Flor');
  });

  it('SAÍDA com cliente mostra o campo "Cliente" + nome', () => {
    const el = montar({
      ...base,
      tipo: 'SAIDA',
      fornecedorId: null,
      fornecedorNome: null,
      clienteId: 8,
      clienteNome: 'Maria Flores',
    });
    const cp = el.querySelector('.ficha__campo--contraparte');
    expect(cp?.querySelector('dt')?.textContent).toContain('Cliente');
    expect(cp?.querySelector('dd')?.textContent).toContain('Maria Flores');
  });

  it('AJUSTE (sem contraparte) NÃO mostra o campo de contraparte', () => {
    const el = montar({
      ...base,
      tipo: 'AJUSTE',
      fornecedorId: null,
      fornecedorNome: null,
      clienteId: null,
      clienteNome: null,
    });
    expect(el.querySelector('.ficha__campo--contraparte')).toBeNull();
  });

  it('autor nulo exibe "—" sem quebrar', () => {
    const el = montar({ ...base, usuarioNome: null });
    expect(el.textContent).toContain('—');
  });

  it('o botão Fechar chama ref.close()', () => {
    const el = montar(base);
    const botao = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Fechar'),
    ) as HTMLButtonElement;
    botao.click();
    expect(ref.close).toHaveBeenCalled();
  });
});
