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
 * T-M7-05 — valores no modal "Movimentar estoque" (SPEC-M7 §3.12, CA-31..CA-35 + a perna de front
 * da CA-53). Spec NOVO: não toca `movimentar-estoque.spec` (M2), `.autor.spec` (M4) nem
 * `.contraparte.spec` (M5) — os três invariantes herdados (`form.setValue` de 3 chaves, `toEqual`
 * estrito do corpo, `httpMock.verify()`) continuam valendo porque os 3 controles financeiros são
 * STANDALONE, fora do `form` group (§3.12-a).
 *
 * Testa contra o CONTRATO §3.2 (o back da onda 2 é escrito em paralelo), com dados fictícios (LGPD).
 */
describe('MovimentarEstoque — valores e desconto (T-M7-05, CA-31..CA-35/CA-53)', () => {
  let fixture: ComponentFixture<MovimentarEstoque>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let probe: any;
  let httpMock: HttpTestingController;
  let ref: jasmine.SpyObj<MatDialogRef<MovimentarEstoque, Movimentacao>>;

  const PRODUTOS = 'http://localhost:8080/api/v1/produtos';

  const produtoBase: Produto = {
    id: 10,
    nome: 'Rosa Vermelha',
    descricao: null,
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 200,
    preco: null,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-16T14:00:00Z',
    atualizadoEm: '2026-09-16T14:00:00Z',
    temImagem: false,
  };

  const movBase: Movimentacao = {
    id: 100,
    produtoId: 10,
    produtoNome: 'Rosa Vermelha',
    tipo: 'SAIDA',
    quantidade: 12,
    quantidadeResultante: 188,
    motivo: null,
    usuarioId: 3,
    criadoEm: '2026-09-16T14:05:00Z',
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

  /** Cria o diálogo (opcionalmente com preço de catálogo) e atende o GET de histórico inicial. */
  function iniciar(preco: number | null = null): void {
    ref = jasmine.createSpyObj<MatDialogRef<MovimentarEstoque, Movimentacao>>('MatDialogRef', [
      'close',
    ]);
    const dados: MovimentarEstoqueDados = { produto: { ...produtoBase, preco } };
    TestBed.configureTestingModule({
      imports: [MovimentarEstoque],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        FornecedoresService, // AD-SQ-72: não é mais `providedIn:'root'`.
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: dados },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MovimentarEstoque);
    fixture.detectChanges(); // ngOnInit → carrega histórico
    httpMock.expectOne((r) => r.url === `${PRODUTOS}/10/movimentacoes`).flush(envelope(paginaMov([])));
    fixture.detectChanges();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    probe = fixture.componentInstance as any;
  }

  /**
   * Texto do elemento com o NBSP do `toLocaleString` pt-BR normalizado para espaço comum —
   * mesmo tratamento do `filtros-produtos.spec.ts:209` (o pt-BR separa "R$" do número com U+00A0).
   */
  function texto(seletor: string): string {
    const el = (fixture.nativeElement as HTMLElement).querySelector(seletor);
    return (el?.textContent ?? '').replace(/ /g, ' ').trim();
  }

  afterEach(() => httpMock.verify());

  it('CA-31: SAÍDA 12 × R$ 15,50 com 10 % mostra "R$ 186,00" (bruto) e "R$ 167,40" (final) ANTES de salvar', () => {
    iniciar();
    probe.form.controls.tipo.setValue('SAIDA');
    probe.form.controls.quantidade.setValue(12);
    probe.valorUnitario.setValue(15.5);
    probe.escolherDesconto('PERCENTUAL');
    probe.descontoValor.setValue(10);
    fixture.detectChanges();

    expect(texto('.valores__bruto')).toBe('R$ 186,00');
    expect(texto('.valores__final')).toBe('R$ 167,40');
    // Nenhum POST foi disparado — o total é espelho de UX; o back continua sendo a autoridade (§3.2-d).
    httpMock.expectNone((r) => r.method === 'POST');
  });

  it('CA-32: bloco financeiro vazio → corpo do POST é EXATAMENTE {tipo, quantidade, motivo}', () => {
    iniciar();
    probe.form.controls.tipo.setValue('SAIDA');
    probe.form.controls.quantidade.setValue(12);
    probe.registrar();

    const req = httpMock.expectOne(`${PRODUTOS}/10/movimentacoes`);
    expect(req.request.body).toEqual({ tipo: 'SAIDA', quantidade: 12, motivo: null });
    const corpo = req.request.body as Record<string, unknown>;
    expect('valorUnitario' in corpo).toBeFalse();
    expect('descontoTipo' in corpo).toBeFalse();
    expect('descontoValor' in corpo).toBeFalse();
    req.flush(envelope(movBase));
  });

  it('CA-33: SAÍDA com preco=25 pré-preenche o unitário (editável) e o envia no payload', () => {
    iniciar(25);
    probe.form.controls.tipo.setValue('SAIDA');
    expect(probe.valorUnitario.value).toBe(25);

    // Editável: o operador sobrescreve e é o valor DELE que viaja.
    probe.valorUnitario.setValue(30);
    probe.form.controls.quantidade.setValue(2);
    probe.registrar();

    const req = httpMock.expectOne(`${PRODUTOS}/10/movimentacoes`);
    expect(req.request.body).toEqual({
      tipo: 'SAIDA',
      quantidade: 2,
      motivo: null,
      valorUnitario: 30,
    });
    req.flush(envelope(movBase));
  });

  it('CA-33: SAÍDA com preco=null nasce com o campo VAZIO e não envia valorUnitario', () => {
    iniciar(null);
    probe.form.controls.tipo.setValue('SAIDA');
    expect(probe.valorUnitario.value).toBeNull();
    fixture.detectChanges();
    // Sem unitário não há total honesto: a tela mostra "—", nunca R$ 0,00 fake.
    expect(texto('.valores__bruto')).toBe('—');
    expect(texto('.valores__final')).toBe('—');

    probe.form.controls.quantidade.setValue(5);
    probe.registrar();
    const req = httpMock.expectOne(`${PRODUTOS}/10/movimentacoes`);
    expect(req.request.body).toEqual({ tipo: 'SAIDA', quantidade: 5, motivo: null });
    req.flush(envelope(movBase));
  });

  it('CA-34: trocar o alternador de % para R$ LIMPA o descontoValor (10 % não vira R$ 10)', () => {
    iniciar();
    probe.form.controls.tipo.setValue('SAIDA');
    probe.form.controls.quantidade.setValue(12);
    probe.valorUnitario.setValue(15.5);
    probe.escolherDesconto('PERCENTUAL');
    probe.descontoValor.setValue(10);
    fixture.detectChanges();
    expect(texto('.valores__final')).toBe('R$ 167,40');

    probe.escolherDesconto('VALOR');
    fixture.detectChanges();
    expect(probe.descontoTipo.value).toBe('VALOR');
    expect(probe.descontoValor.value).toBeNull();
    // Sem valor de desconto, o final volta a ser o bruto (não fica "R$ 10 de desconto" fantasma).
    expect(texto('.valores__final')).toBe('R$ 186,00');

    // Os dois estados do alternador ficam declarados no DOM (aria-pressed).
    const opcoes = (fixture.nativeElement as HTMLElement).querySelectorAll('.valores__opcao');
    expect(opcoes.length).toBe(2);
    expect(opcoes[0].getAttribute('aria-pressed')).toBe('false');
    expect(opcoes[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('CA-35: AJUSTE esconde o bloco financeiro, limpa os 3 controles e não leva dinheiro no payload', () => {
    iniciar();
    probe.form.controls.tipo.setValue('SAIDA');
    probe.form.controls.quantidade.setValue(12);
    probe.valorUnitario.setValue(15.5);
    probe.escolherDesconto('VALOR');
    probe.descontoValor.setValue(5);
    fixture.detectChanges();
    expect(probe.mostrarFinanceiro()).toBeTrue();

    probe.form.controls.tipo.setValue('AJUSTE');
    fixture.detectChanges();
    expect(probe.mostrarFinanceiro()).toBeFalse();
    expect(probe.valorUnitario.value).toBeNull();
    expect(probe.descontoTipo.value).toBeNull();
    expect(probe.descontoValor.value).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.valores')).toBeNull();

    probe.registrar();
    const req = httpMock.expectOne(`${PRODUTOS}/10/movimentacoes`);
    expect(req.request.body).toEqual({ tipo: 'AJUSTE', quantidade: 12, motivo: null });
    req.flush(envelope({ ...movBase, tipo: 'AJUSTE' }));
  });

  it('CA-53: 10,005 × 2 exibe "R$ 20,02" — a MESMA normalização (HALF_UP, 2 casas) que o back grava', () => {
    iniciar();
    probe.form.controls.tipo.setValue('SAIDA');
    probe.form.controls.quantidade.setValue(2);
    probe.valorUnitario.setValue(10.005);
    fixture.detectChanges();

    // Sem o passo 0 do §3.2-b1 a tela mostraria R$ 20,01 e o banco gravaria R$ 20,02 — divergência
    // de 1 centavo descoberta DEPOIS de salvar, numa linha que ninguém pode corrigir.
    expect(texto('.valores__bruto')).toBe('R$ 20,02');
    expect(texto('.valores__final')).toBe('R$ 20,02');

    probe.registrar();
    const req = httpMock.expectOne(`${PRODUTOS}/10/movimentacoes`);
    // O que viaja é o valor JÁ normalizado: o que o operador viu é o que o servidor congela.
    expect(req.request.body).toEqual({
      tipo: 'SAIDA',
      quantidade: 2,
      motivo: null,
      valorUnitario: 10.01,
    });
    req.flush(envelope(movBase));
  });

  it('CA-53: 8,165 × 2 exibe "R$ 16,34" — o empate que a MULTIPLICAÇÃO binária perde', () => {
    iniciar();
    probe.form.controls.tipo.setValue('SAIDA');
    probe.form.controls.quantidade.setValue(2);
    probe.valorUnitario.setValue(8.165);
    fixture.detectChanges();

    // Medido (`node`): `8.165 * 100` = 816.4999999999999 ⇒ `Math.round(v*100)/100` devolve 8,16 e
    // `Number(v.toFixed(2))` também — os dois atalhos mostrariam R$ 16,32 na tela enquanto o back
    // (BigDecimal("8.165").setScale(2, HALF_UP) = 8.17) gravaria R$ 16,34. Este é o caso que separa
    // a normalização decimal do atalho binário; com `10.005` os três coincidem por acidente.
    expect(texto('.valores__bruto')).toBe('R$ 16,34');

    probe.registrar();
    const req = httpMock.expectOne(`${PRODUTOS}/10/movimentacoes`);
    expect(req.request.body).toEqual({
      tipo: 'SAIDA',
      quantidade: 2,
      motivo: null,
      valorUnitario: 8.17,
    });
    req.flush(envelope(movBase));
  });

  it('CA-53: o outro lado — 2 casas ficam INTACTAS e 10,004 desce (não é "arredondar tudo para cima")', () => {
    iniciar();
    probe.form.controls.tipo.setValue('SAIDA');
    probe.form.controls.quantidade.setValue(2);

    // (a) valor já com 2 casas: normalizar não pode mexer nele.
    probe.valorUnitario.setValue(10.01);
    fixture.detectChanges();
    expect(texto('.valores__bruto')).toBe('R$ 20,02');

    // (b) abaixo do empate DESCE (HALF_UP só sobe no empate) — mata a implementação "sempre ceil".
    probe.valorUnitario.setValue(10.004);
    fixture.detectChanges();
    expect(texto('.valores__bruto')).toBe('R$ 20,00');

    // (c) e o desconto percentual passa pela mesma normalização (33,335 → 33,34).
    probe.valorUnitario.setValue(10);
    probe.escolherDesconto('PERCENTUAL');
    probe.descontoValor.setValue(33.335);
    fixture.detectChanges();
    expect(texto('.valores__bruto')).toBe('R$ 20,00');
    expect(texto('.valores__final')).toBe('R$ 13,33'); // 20,00 − round2(20 × 33,34 ÷ 100) = 20,00 − 6,67

    probe.registrar();
    const req = httpMock.expectOne(`${PRODUTOS}/10/movimentacoes`);
    expect(req.request.body).toEqual({
      tipo: 'SAIDA',
      quantidade: 2,
      motivo: null,
      valorUnitario: 10,
      descontoTipo: 'PERCENTUAL',
      descontoValor: 33.34,
    });
    req.flush(envelope(movBase));
  });
});
