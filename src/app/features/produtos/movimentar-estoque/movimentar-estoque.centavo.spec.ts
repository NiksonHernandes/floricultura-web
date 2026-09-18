import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { MovimentarEstoque, MovimentarEstoqueDados } from './movimentar-estoque';
import { FornecedoresService } from '../../fornecedores/fornecedores.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { Movimentacao, PaginaResponse, Produto } from '../../../core/models/produto.model';

/**
 * BUG-002 — **tela e banco divergiam 1 centavo, numa linha imutável.**
 *
 * `normalizar2` conserta a representação decimal de um **literal digitado**, mas rodava **depois** da
 * multiplicação binária: `1.5 × 0.15` dá `0.22499999999999998` (medido em `node`, sobre a fonte
 * real), o empate **já se perdeu** e a tela mostrava **R$ 0,22** enquanto o banco grava **R$ 0,23**
 * — o `CalculoFinanceiroTest:130` do back crava `0.23` para exatamente este par. Só se corrige com
 * estorno, porque a linha é imutável.
 *
 * **Por que os 628 casos anteriores não viam:** os 3 casos de CA-53 usam valores discriminantes na
 * ENTRADA (`8.165`, `10.005`, `33.335`) mas **quantidade INTEIRA** (2, 2 e 100) — e a multiplicação
 * binária só perde o empate com **quantidade fracionária**. É a AD-SQ-164 uma camada adiante: **o
 * valor discriminava, o PAR não.** Varredura do QA: 735 combinações divergentes com quantidade
 * fracionária, **0** com quantidade inteira em 1 000 000 de combinações.
 *
 * ⚠️ Arquivo NOVO: `movimentar-estoque.valores.spec.ts` está **rastreado** (§12 #27) e **nenhuma
 * liberação está aberta** — não se pede uma por isto. Os 3 herdados do modal seguem intocados.
 *
 * O produto é vendido por peso (`kg`): `step="0.001"` no campo e `NUMERIC(14,3)` na coluna. **Meio
 * quilo de qualquer coisa já entra nesta faixa** — não é caso de laboratório.
 */
describe('MovimentarEstoque — o centavo do par fracionário (BUG-002)', () => {
  let fixture: ComponentFixture<MovimentarEstoque>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let probe: any;
  let httpMock: HttpTestingController;

  const PRODUTOS = 'http://localhost:8080/api/v1/produtos';

  const produtoBase: Produto = {
    id: 10,
    nome: 'Musgo Esfagno',
    descricao: null,
    unidadeMedida: 'kg', // vendido por peso: é onde a quantidade fracionária é a regra, não a exceção
    estoqueMinimo: 1,
    estoqueAtual: 200,
    preco: null,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-16T14:00:00Z',
    atualizadoEm: '2026-09-16T14:00:00Z',
    temImagem: false,
  };

  /** Resposta do POST — a linha como o back a devolve (só o que o caso precisa fechar). */
  const movCriada: Movimentacao = {
    id: 100,
    produtoId: 10,
    produtoNome: 'Musgo Esfagno',
    tipo: 'SAIDA',
    quantidade: 1.5,
    quantidadeResultante: 198.5,
    motivo: null,
    usuarioId: 3,
    criadoEm: '2026-09-18T14:05:00Z',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function paginaMov(conteudo: Movimentacao[]): PaginaResponse<Movimentacao> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 5,
      totalElementos: conteudo.length,
      totalPaginas: 1,
      primeira: true,
      ultima: true,
    };
  }

  function iniciar(): void {
    const dados: MovimentarEstoqueDados = { produto: produtoBase };
    TestBed.configureTestingModule({
      imports: [MovimentarEstoque],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        FornecedoresService, // AD-SQ-72 / §12 #31
        { provide: MatDialogRef, useValue: jasmine.createSpyObj('MatDialogRef', ['close']) },
        { provide: MAT_DIALOG_DATA, useValue: dados },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MovimentarEstoque);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === `${PRODUTOS}/10/movimentacoes`)
      .flush(envelope(paginaMov([])));
    fixture.detectChanges();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    probe = fixture.componentInstance as any;
  }

  /**
   * Texto com o NBSP do pt-BR normalizado. ⚠️ O escape ` ` é deliberado: escrever o caractere
   * literal na regex é invisível na revisão e some em qualquer normalização de arquivo — o sintoma
   * é a mensagem cruel `Expected 'R$ 0,23' to be 'R$ 0,23'`, com os dois lados idênticos na tela
   * (aconteceu comigo na 1ª redação deste arquivo).
   */
  function texto(seletor: string): string {
    const el = (fixture.nativeElement as HTMLElement).querySelector(seletor);
    return (el?.textContent ?? '').replace(/ /g, ' ').trim();
  }

  afterEach(() => httpMock.verify());

  it('BUG-002 (bruto): 1,5 kg × R$ 0,15 exibe R$ 0,23 — o mesmo que o banco grava', () => {
    // Binário: 1.5 * 0.15 = 0.22499999999999998 -> arredondaria para 0,22 (o defeito).
    // Decimal:  15 × 15 = 225 (3 casas) -> empate decidido em inteiro -> 0,23 (o back, `:130`).
    iniciar();
    probe.form.controls.tipo.setValue('SAIDA');
    probe.form.controls.quantidade.setValue(1.5);
    probe.valorUnitario.setValue(0.15);
    fixture.detectChanges();

    expect(texto('.valores__bruto')).toBe('R$ 0,23');
  });

  it('BUG-002 (bruto, o outro par da varredura): 0,75 × R$ 0,30 exibe R$ 0,23', () => {
    // Mesmo produto exato (0,225) por outro caminho binário — prova que não é um valor mágico.
    iniciar();
    probe.form.controls.tipo.setValue('ENTRADA');
    probe.form.controls.quantidade.setValue(0.75);
    probe.valorUnitario.setValue(0.3);
    fixture.detectChanges();

    expect(texto('.valores__bruto')).toBe('R$ 0,23');
  });

  it('BUG-002 (desconto %): bruto R$ 0,70 a 45 % desconta R$ 0,32 e o final fica R$ 0,38', () => {
    // A 2ª porta, e ela precisa de prova PRÓPRIA (AD-SQ-167): 0.70*45/100 = 0.31499999999999995 em
    // binário -> descontava 0,31. Em decimal: 70 × 45 = 3150 (4 casas) -> empate sobe -> 0,32.
    iniciar();
    probe.form.controls.tipo.setValue('SAIDA');
    probe.form.controls.quantidade.setValue(1);
    probe.valorUnitario.setValue(0.7);
    probe.escolherDesconto('PERCENTUAL');
    probe.descontoValor.setValue(45);
    fixture.detectChanges();

    // O desconto efetivo não tem elemento próprio no DOM: quem o revela é o TOTAL FINAL — com o
    // defeito, 0,70 − 0,31 daria "R$ 0,39". Asserto o `computed` também, para nomear a porta exata.
    expect(texto('.valores__bruto')).toBe('R$ 0,70');
    expect(probe.descontoEfetivo()).toBe(0.32);
    expect(texto('.valores__final')).toBe('R$ 0,38');
  });

  it('o outro lado: quantidade inteira e os números do CA-31 seguem idênticos', () => {
    // O conserto não pode mexer no que já estava certo — 12 × 15,50 com 10 % continua 186,00/167,40.
    iniciar();
    probe.form.controls.tipo.setValue('SAIDA');
    probe.form.controls.quantidade.setValue(12);
    probe.valorUnitario.setValue(15.5);
    probe.escolherDesconto('PERCENTUAL');
    probe.descontoValor.setValue(10);
    fixture.detectChanges();

    expect(texto('.valores__bruto')).toBe('R$ 186,00');
    expect(texto('.valores__final')).toBe('R$ 167,40');
  });

  it('o outro lado: o PAYLOAD continua levando os literais normalizados, não os totais', () => {
    // §3.12-a: quem calcula é o back (§3.2-d). O conserto é de EXIBIÇÃO — se um total vazasse para o
    // corpo, o `toEqual` estrito dos 3 specs herdados cairia, e este caso avisa antes.
    iniciar();
    probe.form.controls.tipo.setValue('SAIDA');
    probe.form.controls.quantidade.setValue(1.5);
    probe.valorUnitario.setValue(0.15);
    fixture.detectChanges();
    probe.registrar();

    const req = httpMock.expectOne(`${PRODUTOS}/10/movimentacoes`);
    expect(req.request.body).toEqual({
      tipo: 'SAIDA',
      quantidade: 1.5,
      motivo: null,
      valorUnitario: 0.15,
    });
    const corpo = req.request.body as Record<string, unknown>;
    expect('totalBruto' in corpo).toBeFalse(); // total é EXIBIÇÃO; quem calcula é o back (§3.2-d)
    req.flush(envelope(movCriada));
  });
});
