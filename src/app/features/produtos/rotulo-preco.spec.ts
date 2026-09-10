import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { Produtos } from './produtos';
import { ProdutoForm } from './produto-form/produto-form';
import { ProdutosService } from './produtos.service';
import { VisualizarProduto, VisualizarProdutoDados } from './visualizar-produto/visualizar-produto';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import {
  Movimentacao,
  PaginaResponse,
  Produto,
  ProdutoRelacionamentos,
} from '../../core/models/produto.model';

/**
 * T-M6-04 (CA-27 — SPEC-M6 §3.9, ajuste 3 do dono). Spec NOVO (anti-burla: nenhum spec herdado
 * tocado). Prova os 3 fatos textuais/estruturais da task:
 *   (1) o rótulo do preço é "Preço de venda" no modal, no card e no "Visualizar produto" (P9);
 *   (2) o campo de preço usa subscript DINÂMICO — a caixa de altura fixa do Material era a causa
 *       do hint invadir o campo "URL da imagem" a 375px;
 *   (3) a dica da foto diz "até 2 MB" (teto real do back desde o M5.2/AD-SQ-77), sem "5 MB".
 * Dados fictícios (LGPD).
 */
const ROTULO = 'Preço de venda';

const rosa: Produto = {
  id: 5,
  nome: 'Rosa Vermelha',
  descricao: null,
  unidadeMedida: 'un',
  estoqueMinimo: 10,
  estoqueAtual: 25,
  preco: 12.5,
  imagemUrl: null,
  estoqueBaixo: false,
  ativo: true,
  criadoEm: '2026-09-02T14:00:00Z',
  atualizadoEm: '2026-09-02T14:00:00Z',
  temImagem: false,
};

function envelope<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null, timestamp: '', path: '' };
}

function pagina<T>(conteudo: T[]): PaginaResponse<T> {
  return {
    conteudo,
    pagina: 0,
    tamanho: 12,
    totalElementos: conteudo.length,
    totalPaginas: 1,
    primeira: true,
    ultima: true,
  };
}

describe('T-M6-04/CA-27 — "Preço de venda" no card (lista de produtos)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/produtos';

  beforeEach(() => {
    const dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
    TestBed.configureTestingModule({
      imports: [Produtos],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { ehAdmin: signal(false) } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('o <dt> do preço no card diz "Preço de venda" (não "Preço")', () => {
    const fixture: ComponentFixture<Produtos> = TestBed.createComponent(Produtos);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([rosa])));
    fixture.detectChanges();

    const rotulos = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.vaso__meta dt'),
    ).map((dt) => dt.textContent?.trim());
    expect(rotulos).toContain(ROTULO);
    expect(rotulos).not.toContain('Preço');
  });
});

describe('T-M6-04/CA-27 — modal de produto: rótulo, subscript dinâmico e teto de 2 MB', () => {
  let el: HTMLElement;

  beforeEach(() => {
    const servico = jasmine.createSpyObj<
      Pick<ProdutosService, 'criar' | 'atualizar' | 'urlImagem' | 'imagemBlob'>
    >('ProdutosService', ['criar', 'atualizar', 'urlImagem', 'imagemBlob']);
    servico.urlImagem.and.returnValue('http://localhost:8080/api/v1/produtos/5/imagem');
    servico.imagemBlob.and.returnValue(of(new Blob()));
    TestBed.configureTestingModule({
      imports: [ProdutoForm],
      providers: [provideNoopAnimations(), { provide: ProdutosService, useValue: servico }],
    });
    const fixture = TestBed.createComponent(ProdutoForm);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  function campoPreco(): HTMLElement {
    const input = el.querySelector('input[formControlName="preco"]');
    expect(input).withContext('campo de preço no formulário').toBeTruthy();
    return input!.closest('mat-form-field') as HTMLElement;
  }

  it('o <mat-label> do preço diz "Preço de venda" (P9)', () => {
    expect(campoPreco().querySelector('mat-label')?.textContent?.trim()).toBe(ROTULO);
  });

  it('o campo de preço usa subscript DINÂMICO — o hint deixa de ter caixa de altura fixa', () => {
    // `subscriptSizing="dynamic"` marca o wrapper do subscript com a classe -dynamic-size do Material.
    expect(campoPreco().querySelector('[class*="subscript-dynamic-size"]')).toBeTruthy();
    expect(campoPreco().querySelector('mat-hint')?.textContent).toContain(
      'Deixe em branco se ainda não há preço definido.',
    );
  });

  it('em caixa estreita o hint do preço NÃO invade o campo "URL da imagem"', () => {
    el.style.display = 'block';
    el.style.width = '375px'; // caixa estreita: força o hint a quebrar em 2 linhas, como no print

    // Medição geométrica: com o subscript de altura FIXA do Material o hint de 2 linhas transborda
    // a caixa reservada e o seu rodapé cai DENTRO do campo de baixo (≈20px de invasão no print do
    // dono). Com `dynamic` + row-gap, o hint termina antes do topo do campo "URL da imagem".
    const hint = campoPreco().querySelector('mat-hint') as HTMLElement;
    const campoUrl = el
      .querySelector('input[formControlName="imagemUrl"]')!
      .closest('mat-form-field') as HTMLElement;
    expect(hint.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      campoUrl.getBoundingClientRect().top,
    );
  });

  it('a dica da foto anuncia o teto real de 2 MB (AD-SQ-77), sem "5 MB"', () => {
    const dica = el.querySelector('.foto__dica')?.textContent ?? '';
    expect(dica).toContain('até 2 MB');
    expect(dica).not.toContain('5 MB');
  });
});

describe('T-M6-04/CA-27 — "Preço de venda" no modal "Visualizar produto"', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/produtos';

  beforeEach(() => {
    const dados: VisualizarProdutoDados = { produtoId: 5 };
    TestBed.configureTestingModule({
      imports: [VisualizarProduto],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MatDialogRef,
          useValue: jasmine.createSpyObj<MatDialogRef<VisualizarProduto>>('MatDialogRef', ['close']),
        },
        { provide: MAT_DIALOG_DATA, useValue: dados },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('o <dt> do preço na ficha diz "Preço de venda"', () => {
    const fixture = TestBed.createComponent(VisualizarProduto);
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/5`).flush(envelope(rosa));
    const relac: ProdutoRelacionamentos = { eventos: [], fornecedores: [], clientes: [] };
    httpMock.expectOne(`${BASE}/5/relacionamentos`).flush(envelope(relac));
    httpMock
      .expectOne((r) => r.url === `${BASE}/5/movimentacoes`)
      .flush(envelope(pagina<Movimentacao>([])));
    fixture.detectChanges();

    const rotulos = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.dado dt'),
    ).map((dt) => dt.textContent?.trim());
    expect(rotulos).toContain(ROTULO);
    expect(rotulos).not.toContain('Preço');
  });
});
