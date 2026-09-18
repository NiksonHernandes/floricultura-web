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
 * BUG-008 — **o passo 0 da QUANTIDADE**, que o back passou a aplicar em `5cdcae5` (decisão do dono,
 * 2026-09-18) e a tela ainda não aplicava.
 *
 * A quantidade tem escala **própria** — `NUMERIC(14,3)`, não 2 —, e a conta tem de usar o número que
 * a coluna guarda. Medido contra `CalculoFinanceiro.normalizarQuantidade` do back:
 *
 * | quantidade | unitário | BANCO (`5cdcae5`) | TELA (antes) |
 * |---|---|---|---|
 * | `1.0005` | `1000.00` | **R$ 1.001,00** | R$ 1.000,50 ← **R$ 0,50** numa linha imutável |
 * | `1.9999` | `100.00`  | **R$ 200,00**   | R$ 199,99 |
 * | `1.500`  | `0.15`    | **R$ 0,23**     | R$ 0,23 (BUG-002, e continua fechado) |
 *
 * **É alcançável pela tela:** `step="0.001"` **não impede** digitar 4 casas, e os validators do campo
 * só têm `required` e `min(0)`.
 *
 * ⚠️ **`1.5` não serve de prova aqui** — crua e normalizada são o mesmo número, e o caso ficaria
 * verde nos dois mundos. É a regra do par discriminante (AD-SQ-164/BUG-002) valendo para o **terceiro**
 * campo: a quantidade precisa de **4+ casas** para separar os mundos.
 *
 * ⚠️ Arquivo NOVO: `movimentar-estoque.centavo.spec.ts` e `.valores.spec.ts` estão **rastreados**
 * (§12 #27) e **zero liberação está aberta** — nenhuma foi pedida.
 */
describe('MovimentarEstoque — o passo 0 da quantidade (BUG-008)', () => {
  let fixture: ComponentFixture<MovimentarEstoque>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let probe: any;
  let httpMock: HttpTestingController;

  const PRODUTOS = 'http://localhost:8080/api/v1/produtos';

  const produtoBase: Produto = {
    id: 10,
    nome: 'Substrato Fibra de Coco',
    descricao: null,
    unidadeMedida: 'kg', // peso: é onde a quantidade fracionária é a regra
    estoqueMinimo: 1,
    estoqueAtual: 500,
    preco: null,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-18T14:00:00Z',
    atualizadoEm: '2026-09-18T14:00:00Z',
    temImagem: false,
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

  /** NBSP do pt-BR normalizado — o `toLocaleString` separa "R$" com U+00A0 (escape deliberado). */
  function texto(seletor: string): string {
    const el = (fixture.nativeElement as HTMLElement).querySelector(seletor);
    return (el?.textContent ?? '').replace(/ /g, ' ').trim();
  }

  /** Preenche uma ENTRADA com quantidade e unitário, sem desconto. */
  function lancar(quantidade: number, unitario: number): void {
    iniciar();
    probe.form.controls.tipo.setValue('ENTRADA');
    probe.form.controls.quantidade.setValue(quantidade);
    probe.valorUnitario.setValue(unitario);
    fixture.detectChanges();
  }

  afterEach(() => httpMock.verify());

  it('BUG-008: 1,0005 kg × R$ 1.000,00 exibe R$ 1.001,00 — o total que o banco grava', () => {
    // A coluna guarda `quantidade = 1.001`; multiplicar a crua daria R$ 1.000,50 e a linha não
    // fecharia consigo mesma. R$ 0,50 de diferença — e a linha é imutável.
    lancar(1.0005, 1000);
    expect(texto('.valores__bruto')).toBe('R$ 1.001,00');
  });

  it('BUG-008: 1,9999 × R$ 100,00 exibe R$ 200,00 (o empate da 4ª casa sobe, HALF_UP)', () => {
    lancar(1.9999, 100);
    expect(texto('.valores__bruto')).toBe('R$ 200,00');
  });

  it('BUG-008: 2,0004 × R$ 50,00 exibe R$ 100,00 — o empate que DESCE também', () => {
    // O outro lado do arredondamento: sem o passo 0 a tela mostraria R$ 100,02.
    lancar(2.0004, 50);
    expect(texto('.valores__bruto')).toBe('R$ 100,00');
  });

  it('NÃO-REGRESSÃO do BUG-002: 1,500 × R$ 0,15 continua R$ 0,23', () => {
    // O par do BUG-002 tem 3 casas: o passo 0 da quantidade não o altera, e o conserto anterior
    // (conta na representação decimal) continua sendo o que decide o empate.
    lancar(1.5, 0.15);
    expect(texto('.valores__bruto')).toBe('R$ 0,23');
  });

  it('NÃO-REGRESSÃO: quantidade inteira e os números do CA-31 seguem idênticos', () => {
    lancar(12, 15.5);
    probe.escolherDesconto('PERCENTUAL');
    probe.descontoValor.setValue(10);
    fixture.detectChanges();
    expect(texto('.valores__bruto')).toBe('R$ 186,00');
    expect(texto('.valores__final')).toBe('R$ 167,40');
  });

  it('o desconto % incide sobre o bruto JÁ com a quantidade normalizada', () => {
    // Encadeamento: bruto 1.001,00 (não 1.000,50) e 10 % disso = 100,10 → final 900,90.
    lancar(1.0005, 1000);
    probe.escolherDesconto('PERCENTUAL');
    probe.descontoValor.setValue(10);
    fixture.detectChanges();
    expect(probe.descontoEfetivo()).toBe(100.1);
    expect(texto('.valores__final')).toBe('R$ 900,90');
  });

  it('o PAYLOAD leva a quantidade COMO DIGITADA — quem normaliza é o back (§3.2-d)', () => {
    // A tela espelha a conta; ela não reescreve o que a pessoa digitou. O back aplica o mesmo passo 0
    // e a coluna `NUMERIC(14,3)` guarda 1.001 — normalizar aqui criaria uma segunda autoridade.
    lancar(1.0005, 1000);
    probe.registrar();

    const req = httpMock.expectOne(`${PRODUTOS}/10/movimentacoes`);
    expect(req.request.body).toEqual({
      tipo: 'ENTRADA',
      quantidade: 1.0005,
      motivo: null,
      valorUnitario: 1000,
    });
    req.flush(
      envelope({
        id: 101,
        produtoId: 10,
        produtoNome: 'Substrato Fibra de Coco',
        tipo: 'ENTRADA',
        quantidade: 1.001,
        quantidadeResultante: 501.001,
        motivo: null,
        usuarioId: 3,
        criadoEm: '2026-09-18T14:05:00Z',
      } as Movimentacao),
    );
  });
});
