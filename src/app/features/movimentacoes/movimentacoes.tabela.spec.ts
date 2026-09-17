import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';

import { Movimentacoes } from './movimentacoes';
import { ApiResponse } from '../../core/models/api-response.model';
import { Movimentacao, PaginaResponse } from '../../core/models/produto.model';

/**
 * T-M7-07 — tabela densa de Movimentações, visão "Todas" (SPEC-M7 §3.11-b/c, CA-36/CA-37/CA-38/CA-41).
 *
 * Spec NOVO: não toca `movimentacoes.spec.ts` nem `movimentacoes.contraparte.spec.ts` (§12 #0 — zero
 * liberação de teste herdado neste marco). O que ele trava é o **contrato de marcação** do §3.11-c, que
 * é justamente o que permite trocar o cartão pela tabela SEM pedir liberação.
 *
 * ⚠️ `registerLocaleData(localePt, 'pt-BR')` aqui NÃO é decoração. O `registerLocaleData` do app mora em
 * `app.config.ts` e só roda se aquele módulo entrar no bundle; num `npm test --include='…tabela.spec.ts'`
 * ele não entra, e todo `| date: … : 'pt-BR'` explode com `NG02100 / NG0701: Missing locale data`.
 * Medido: o mesmo `--include` no código ORIGINAL (`64d9ca7`, antes desta task) já dava
 * `13 FAILED, 3 SUCCESS` — o defeito é do recorte de bundle, não da tela. Registrar aqui é o que torna
 * o §10 #14 executável isoladamente, como a rubrica manda.
 *
 * Dados FICTÍCIOS (LGPD): "Sítio Boa Flor" / nomes de planta.
 */
describe('Movimentacoes — tabela densa (T-M7-07, §3.11-b/c)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/movimentacoes';

  registerLocaleData(localePt, 'pt-BR');

  /** Linha "pobre": sem contraparte e sem dinheiro — é a forma das fixtures herdadas. */
  const base: Movimentacao = {
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
  };

  /** Linha "rica": contraparte + valores do §3.3, já em 2 casas como o back grava (NUMERIC(14,2)). */
  const comValores: Movimentacao = {
    ...base,
    id: 90,
    tipo: 'ENTRADA',
    produtoNome: 'Tulipa Amarela',
    fornecedorId: 3,
    fornecedorNome: 'Sítio Boa Flor',
    clienteId: null,
    clienteNome: null,
    valorUnitario: 15.5,
    descontoTipo: 'PERCENTUAL',
    descontoValor: 10,
    totalBruto: 186.0,
    totalFinal: 167.4,
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  /**
   * Texto da célula com o espaço DURO normalizado. `toLocaleString('pt-BR', {currency:'BRL'})` separa
   * "R$" do número com **U+00A0** (NBSP) — é a tipografia correta e a produção deve mantê-la; quem tem
   * de se adaptar é a asserção. Sem isto o caso falha com a mensagem cruel
   * `Expected 'R$ 0,00' to be 'R$ 0,00'` (medido), em que os dois lados parecem idênticos na tela.
   */
  function texto(el: Element | null): string {
    return (el?.textContent ?? '').replace(/ /g, ' ').trim();
  }

  function pagina(conteudo: Movimentacao[], total = conteudo.length): PaginaResponse<Movimentacao> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 20,
      totalElementos: total,
      totalPaginas: Math.max(1, Math.ceil(total / 20)),
      primeira: true,
      ultima: total <= 20,
    };
  }

  function iniciar(conteudo: Movimentacao[]): ComponentFixture<Movimentacoes> {
    const fixture = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo)));
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Movimentacoes],
      providers: [provideNoopAnimations(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('CA-36: a linha é um <tr class="lancamento"> DENTRO de table.tabela (tabela semântica)', () => {
    const el = iniciar([base]).nativeElement as HTMLElement;
    const linha = el.querySelector('.lancamento');
    expect(linha).toBeTruthy();
    expect(linha!.tagName).toBe('TR');
    expect(linha!.closest('table.tabela')).toBeTruthy();
    // O cartão do desktop (§3.11-b / AD-SQ-112) envolve a tabela, nunca a recorta.
    expect(el.querySelector('.tabela-cartao table.tabela')).toBeTruthy();
  });

  it('CA-36: as 10 colunas do §3.11-b, na ordem, com <th scope="col">', () => {
    const el = iniciar([base]).nativeElement as HTMLElement;
    const cabecalhos = Array.from(el.querySelectorAll('thead th')).map((t) =>
      t.textContent!.trim(),
    );
    expect(cabecalhos).toEqual([
      'Data/hora',
      'Produto',
      'Tipo',
      'Qtd',
      'Saldo',
      'Unitário',
      'Total',
      'Contraparte',
      'Autor',
      'Ações',
    ]);
    expect(el.querySelectorAll('thead th[scope="col"]').length).toBe(10);
    expect(el.querySelectorAll('tbody tr.lancamento td').length).toBe(10);
  });

  it('CA-36: os 10 ganchos herdados do §3.11-c continuam presentes na tabela nova', () => {
    const el = iniciar([{ ...comValores, produtoId: null }]).nativeElement as HTMLElement;
    expect(el.querySelectorAll('h1').length).toBe(1); // placa intacta
    expect(el.querySelector('tr.lancamento')).toBeTruthy();
    expect(el.querySelector('.lancamento__tipo--ENTRADA')).toBeTruthy();
    expect(el.querySelector('.lancamento__data')).toBeTruthy();
    expect(el.querySelector('.lancamento__ver')).toBeTruthy();
    expect(el.querySelector('.selo-excluido')).toBeTruthy();
    expect(el.querySelector('.campo--contraparte')).toBeTruthy();
    expect(el.querySelector('.lancamento__motivo')).toBeTruthy();
    expect(el.querySelectorAll('.campo dd').length).toBeGreaterThan(0);
  });

  it('CA-36: `.campo` SÓ nas 3 células do §3.11-c — e sem contraparte o `.campo dd`[1] é o AUTOR', () => {
    // É o invariante que `movimentacoes.spec.ts:80` lê. Explicitado aqui para que a regra seja
    // VISÍVEL a quem mexer na tabela depois — e é o que a mutação do §10 #14c derruba.
    const el = iniciar([{ ...base, usuarioNome: 'Ana' }]).nativeElement as HTMLElement;
    const campos = el.querySelectorAll('tbody .campo');
    expect(campos.length).toBe(2); // Qtd e Autor (sem contraparte nesta fixture)
    const dds = el.querySelectorAll('tbody .campo dd');
    expect(dds[0].textContent!.trim()).toBe('12'); // Qtd
    expect(dds[1].textContent!.trim()).toBe('Ana'); // Autor
    // Saldo/Unitário/Total NÃO podem ser `.campo`: entrariam no índice e deslocariam o autor.
    const saldo = el.querySelector('td[data-rotulo="Saldo"]')!;
    expect(saldo.classList.contains('campo')).toBeFalse();
  });

  it('CA-36: com contraparte, a ordem do DOM é Qtd → Contraparte → Autor', () => {
    const el = iniciar([comValores]).nativeElement as HTMLElement;
    const dds = el.querySelectorAll('tbody .campo dd');
    expect(dds.length).toBe(3);
    expect(dds[0].textContent!.trim()).toBe('12');
    expect(dds[1].textContent!.trim()).toBe('Sítio Boa Flor');
    expect(dds[2].textContent!.trim()).toBe('Ana');
  });

  it('CA-38: linha com estornaMovimentacaoId=87 mostra o selo "Estorno de #87"', () => {
    const el = iniciar([{ ...base, id: 91, estornaMovimentacaoId: 87 }])
      .nativeElement as HTMLElement;
    const selo = el.querySelector('.selo-estorno');
    expect(selo).toBeTruthy();
    expect(selo!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Estorno de #87');
  });

  it('CA-38 (o outro lado): lançamento comum NÃO mostra selo de estorno', () => {
    const el = iniciar([base]).nativeElement as HTMLElement;
    expect(el.querySelector('.selo-estorno')).toBeNull();
  });

  it('CA-37: o selo "Excluído" sobrevive à tabela e o nome (snapshot) permanece', () => {
    const el = iniciar([{ ...base, produtoId: null }]).nativeElement as HTMLElement;
    expect(el.querySelector('.selo-excluido')).toBeTruthy();
    expect(el.textContent).toContain('Rosa Vermelha');
  });

  it('§3.6: a coluna Saldo exibe `quantidadeResultante` do back — sem soma no navegador', () => {
    const el = iniciar([base]).nativeElement as HTMLElement;
    expect(el.querySelector('td[data-rotulo="Saldo"]')!.textContent!.trim()).toBe('88');
  });

  it('§3.11-b: Unitário e Total exibem o que o servidor gravou, sem recalcular', () => {
    // 12 × 15,50 = 186,00 bruto, com 10 % vira 167,40 (CA-31). A tela mostra o `totalFinal` do back —
    // se algum dia ela multiplicar aqui, este caso vira o alarme.
    const el = iniciar([comValores]).nativeElement as HTMLElement;
    expect(texto(el.querySelector('td[data-rotulo="Unitário"]'))).toBe('R$ 15,50');
    expect(texto(el.querySelector('td[data-rotulo="Total"]'))).toBe('R$ 167,40');
  });

  it('§4.4: totalFinal 0 exibe "R$ 0,00"; totalFinal null exibe "—" (R$ 0,00 ≠ sem valor)', () => {
    // Desconto de 100 % (brinde/doação) grava 0.00 — valor REAL. `null` é "sem dinheiro na linha" (P6).
    // Um `if (!valor)` colapsaria os dois e faria a tela mentir sobre o brinde.
    const el = iniciar([
      { ...comValores, id: 92, valorUnitario: 0, totalBruto: 0, totalFinal: 0 },
      { ...base, id: 93 },
    ]).nativeElement as HTMLElement;
    const totais = el.querySelectorAll('td[data-rotulo="Total"]');
    expect(texto(totais[0])).toBe('R$ 0,00');
    expect(texto(totais[1])).toBe('—');
  });

  it('CA-41: a tela recém-aberta faz EXATAMENTE uma requisição (GET /movimentacoes)', () => {
    const fixture = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    const pedidos = httpMock.match(() => true);
    expect(pedidos.length).toBe(1);
    expect(pedidos[0].request.method).toBe('GET');
    expect(pedidos[0].request.url).toBe(BASE);
    pedidos[0].flush(envelope(pagina([base])));
    fixture.detectChanges();
    // `httpMock.verify()` no afterEach fecha a perna: nada de /produtos, /clientes ou /fornecedores.
  });
});
