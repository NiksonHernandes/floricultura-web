import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { VisualizarProduto, VisualizarProdutoDados } from './visualizar-produto';
import { ApiResponse } from '../../../core/models/api-response.model';
import {
  Movimentacao,
  PaginaResponse,
  Produto,
  ProdutoRelacionamentos,
} from '../../../core/models/produto.model';

/**
 * CA-34 (SPEC-M6 §3.12, T-M6-09b) — seção "Ficha botânica" do modal "Visualizar produto".
 *
 * Testa o modal INTEIRO (não o filho isolado): é assim que o operador vê. Dados FICTÍCIOS.
 * O ponto central é o TRI-ESTADO da toxicidade (R8): ausente = "não informado", que NÃO é
 * "Não tóxica" — e "não informado" se exibe **não exibindo linha** (CA-34: atributo ausente não
 * vira linha "—").
 */
describe('VisualizarProduto — ficha botânica (CA-34)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/produtos';

  /** Produto pré-M6: nenhum atributo botânico (R7 — os 5 são opcionais). */
  const base: Produto = {
    id: 5,
    nome: 'Costela-de-adão',
    descricao: null,
    unidadeMedida: 'un',
    estoqueMinimo: 2,
    estoqueAtual: 9,
    preco: null,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-11T14:00:00Z',
    atualizadoEm: '2026-09-11T14:00:00Z',
    temImagem: false,
  };

  const relacVazio: ProdutoRelacionamentos = { eventos: [], fornecedores: [], clientes: [] };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function paginaVazia(): PaginaResponse<Movimentacao> {
    return {
      conteudo: [],
      pagina: 0,
      tamanho: 3,
      totalElementos: 0,
      totalPaginas: 0,
      primeira: true,
      ultima: true,
    };
  }

  function montar(detalhe: Produto): ComponentFixture<VisualizarProduto> {
    const fixture = TestBed.createComponent(VisualizarProduto);
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/5`).flush(envelope(detalhe));
    httpMock.expectOne(`${BASE}/5/relacionamentos`).flush(envelope(relacVazio));
    httpMock.expectOne((r) => r.url === `${BASE}/5/movimentacoes`).flush(envelope(paginaVazia()));
    fixture.detectChanges();
    return fixture;
  }

  /** Rótulo → valor das linhas da ficha, na ordem do DOM. */
  function linhas(el: HTMLElement): Record<string, string> {
    const mapa: Record<string, string> = {};
    el.querySelectorAll('.botanica__item').forEach((item) => {
      const rotulo = item.querySelector('dt')!.textContent!.trim();
      mapa[rotulo] = item.querySelector('dd')!.textContent!.replace(/\s+/g, ' ').trim();
    });
    return mapa;
  }

  beforeEach(() => {
    const ref = jasmine.createSpyObj<MatDialogRef<VisualizarProduto>>('MatDialogRef', ['close']);
    const dados: VisualizarProdutoDados = { produtoId: 5 };
    TestBed.configureTestingModule({
      imports: [VisualizarProduto],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: dados },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('CA-34: produto completo exibe os 5 atributos com os rótulos do cadastro', () => {
    const el = montar({
      ...base,
      cores: [
        { id: 4, nome: 'VERDE', hex: '#2E7D32' },
        { id: 7, nome: 'ROSA', hex: '#E91E63' },
      ],
      caracteristica: 'ADULTA',
      alturaCm: 120,
      toxicidade: 'TOXICA',
      necessidadeLuz: ['MEIA_SOMBRA', 'SOMBRA'],
    }).nativeElement as HTMLElement;

    expect(el.querySelector('.botanica')).toBeTruthy();
    expect(linhas(el)).toEqual({
      Cores: 'VERDE ROSA',
      Característica: 'Adulta',
      Altura: '1,20 m', // R16: >= 100 cm em metros pt-BR
      Toxicidade: 'Tóxica',
      'Necessidade de luz': 'Meia-sombra · Sombra',
    });
  });

  it('CA-34: cada cor tem a pastilha de tinta com o hex do back; sem hex ela fica vazada', () => {
    const el = montar({
      ...base,
      cores: [
        { id: 4, nome: 'VERDE', hex: '#2E7D32' },
        { id: 9, nome: 'LILÁS', hex: null },
      ],
    }).nativeElement as HTMLElement;

    const pastilhas = Array.from(el.querySelectorAll<HTMLElement>('.botanica__cores .tinta'));
    expect(pastilhas.length).toBe(2);
    expect(pastilhas[0].style.backgroundColor).toBe('rgb(46, 125, 50)');
    expect(pastilhas[0].classList).not.toContain('tinta--sem');
    // Sem hex: nada de cor inventada — a pastilha é vazada e não pinta fundo.
    expect(pastilhas[1].classList).toContain('tinta--sem');
    expect(pastilhas[1].style.backgroundColor).toBe('');
  });

  it('CA-34: produto SEM nenhum atributo não renderiza a seção', () => {
    const el = montar(base).nativeElement as HTMLElement;
    expect(el.querySelector('.botanica')).toBeNull();
    expect(el.textContent).not.toContain('Ficha botânica');
    // e a ficha herdada continua de pé (sem regressão do M5/M5.2)
    expect(el.querySelector('.ficha__titulo')?.textContent).toContain('Costela-de-adão');
  });

  it('CA-34: coleções nulas (contrato da LISTA, R11) não renderizam a seção', () => {
    const el = montar({ ...base, cores: null, necessidadeLuz: null }).nativeElement as HTMLElement;
    expect(el.querySelector('.botanica')).toBeNull();
  });

  it('CA-34: só os atributos preenchidos viram linha (sem "—" nem linha vazia)', () => {
    const el = montar({ ...base, caracteristica: 'MUDA' }).nativeElement as HTMLElement;
    expect(Object.keys(linhas(el))).toEqual(['Característica']);
    expect(el.querySelectorAll('.botanica__item').length).toBe(1);
    expect(el.textContent).not.toContain('—');
  });

  it('R8 (tri-estado): toxicidade AUSENTE não é "Não tóxica" — não há linha de Toxicidade', () => {
    const el = montar({ ...base, caracteristica: 'JOVEM', toxicidade: null })
      .nativeElement as HTMLElement;
    expect(el.querySelector('.botanica')).toBeTruthy(); // a seção existe (a característica veio)
    expect(Object.keys(linhas(el))).not.toContain('Toxicidade');
    expect(el.textContent).not.toContain('Não tóxica');
    expect(el.textContent).not.toContain('Tóxica');
  });

  it('R8 (tri-estado): NAO_TOXICA é um dado afirmado e aparece como "Não tóxica"', () => {
    const el = montar({ ...base, toxicidade: 'NAO_TOXICA' }).nativeElement as HTMLElement;
    expect(linhas(el)).toEqual({ Toxicidade: 'Não tóxica' });
  });

  it('R16: altura abaixo de 100 cm fica em centímetros inteiros', () => {
    const el = montar({ ...base, caracteristica: 'JOVEM', alturaCm: 45 })
      .nativeElement as HTMLElement;
    expect(linhas(el)['Altura']).toBe('45 cm');
  });

  it('R16: 100 cm já é o primeiro valor em metros', () => {
    const el = montar({ ...base, caracteristica: 'ADULTA', alturaCm: 100 })
      .nativeElement as HTMLElement;
    expect(linhas(el)['Altura']).toBe('1,00 m');
  });

  it('CA-34: característica sem altura não inventa linha de Altura', () => {
    const el = montar({ ...base, caracteristica: 'MUDA', alturaCm: null })
      .nativeElement as HTMLElement;
    expect(Object.keys(linhas(el))).not.toContain('Altura');
  });

  it('CA-34: uma única condição de luz aparece sem o separador "·"', () => {
    const el = montar({ ...base, necessidadeLuz: ['SOL_PLENO'] }).nativeElement as HTMLElement;
    expect(linhas(el)).toEqual({ 'Necessidade de luz': 'Sol pleno' });
  });
});
