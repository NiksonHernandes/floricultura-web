import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { VisualizarProduto, VisualizarProdutoDados } from './visualizar-produto';
import { ApiResponse } from '../../../core/models/api-response.model';
import { Produto, ProdutoRelacionamentos } from '../../../core/models/produto.model';

/**
 * RF-4 (REVISÃO 2026-09-04/AD-SQ-66) — modal "Visualizar produto". Spec NOVO. Testa contra o CONTRATO
 * (§R3.5: `GET /produtos/{id}` reaproveitado + `GET /produtos/{id}/relacionamentos` novo; back RB-4
 * ainda não pronto) com `HttpTestingController`. Dados FICTÍCIOS (LGPD): "Sítio Boa Flor"/"Maria Flores".
 *
 * `temImagem:false` nos fixtures → o `<app-imagem-produto>` cai no placeholder e NÃO dispara GET de
 * binário, mantendo o `httpMock.verify()` limpo (só a ficha e os relacionamentos trafegam).
 */
describe('VisualizarProduto (RF-4, R-CA-10)', () => {
  let httpMock: HttpTestingController;
  let ref: jasmine.SpyObj<MatDialogRef<VisualizarProduto>>;
  const BASE = 'http://localhost:8080/api/v1/produtos';

  const produto: Produto = {
    id: 5,
    nome: 'Rosa Vermelha',
    descricao: 'Rosa de haste longa, cor intensa.',
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 20,
    preco: 12.5,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-02T14:00:00Z',
    atualizadoEm: '2026-09-02T14:00:00Z',
    temImagem: false,
  };

  const relacFull: ProdutoRelacionamentos = {
    eventos: [{ id: 1, nome: 'Dia das Mães' }],
    fornecedores: [{ id: 3, nome: 'Sítio Boa Flor' }],
    clientes: [{ id: 8, nome: 'Maria Flores' }],
  };

  const relacVazio: ProdutoRelacionamentos = { eventos: [], fornecedores: [], clientes: [] };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function montar(
    detalhe: Produto = produto,
    relac: ProdutoRelacionamentos = relacVazio,
  ): ComponentFixture<VisualizarProduto> {
    const fixture = TestBed.createComponent(VisualizarProduto);
    fixture.detectChanges(); // ngOnInit → dispara ficha + relacionamentos
    httpMock.expectOne(`${BASE}/5`).flush(envelope(detalhe));
    httpMock.expectOne(`${BASE}/5/relacionamentos`).flush(envelope(relac));
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    ref = jasmine.createSpyObj<MatDialogRef<VisualizarProduto>>('MatDialogRef', ['close']);
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

  it('(a) busca a ficha (GET /produtos/{id}) e mostra os dados próprios', () => {
    const el = montar().nativeElement as HTMLElement;
    expect(el.querySelector('.ficha__titulo')?.textContent).toContain('Rosa Vermelha');
    expect(el.textContent).toContain('Rosa de haste longa, cor intensa.'); // descrição
    expect(el.textContent).toContain('20 un'); // estoque + unidade
    expect(el.textContent).toContain('mín. 10'); // estoque mínimo
    expect(el.textContent).toContain('R$'); // preço presente
    expect(el.querySelector('app-imagem-produto')).toBeTruthy(); // foto pelo mesmo caminho do card
  });

  it('(b) mostra eventos, fornecedores e clientes quando relacionamentos retorna', () => {
    const el = montar(produto, relacFull).nativeElement as HTMLElement;
    expect(el.querySelector('.relacoes')).toBeTruthy();
    const chips = Array.from(el.querySelectorAll('.chip')).map((c) => c.textContent?.trim());
    expect(chips).toContain('Dia das Mães');
    expect(chips).toContain('Sítio Boa Flor');
    expect(chips).toContain('Maria Flores');
    expect(el.textContent).toContain('Eventos');
    expect(el.textContent).toContain('Fornecedores');
    expect(el.textContent).toContain('Clientes');
  });

  it('(c) seções vazias não aparecem (relacionamentos todos vazios)', () => {
    const el = montar(produto, relacVazio).nativeElement as HTMLElement;
    expect(el.querySelector('.relacoes')).toBeNull();
    expect(el.querySelectorAll('.chip').length).toBe(0);
  });

  it('(c) mostra só a seção que tem dados (só eventos)', () => {
    const el = montar(produto, {
      eventos: [{ id: 1, nome: 'Dia das Mães' }],
      fornecedores: [],
      clientes: [],
    }).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Eventos');
    expect(el.textContent).not.toContain('Fornecedores');
    expect(el.textContent).not.toContain('Clientes');
  });

  it('(d) preço nulo NÃO renderiza o campo de preço', () => {
    const el = montar({ ...produto, preco: null }).nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Preço');
    expect(el.textContent).not.toContain('R$');
  });

  it('erro na ficha mostra estado de erro com "Tentar de novo"', () => {
    const fixture = TestBed.createComponent(VisualizarProduto);
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/5`).flush(null, { status: 500, statusText: 'Server Error' });
    // relacionamentos ainda dispara no init; atende para manter o verify limpo.
    httpMock.expectOne(`${BASE}/5/relacionamentos`).flush(envelope(relacVazio));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.ficha__estado--erro')).toBeTruthy();
  });

  it('falha nos relacionamentos degrada em silêncio (ficha aparece, sem seções)', () => {
    const fixture = TestBed.createComponent(VisualizarProduto);
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/5`).flush(envelope(produto));
    httpMock
      .expectOne(`${BASE}/5/relacionamentos`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.ficha__titulo')?.textContent).toContain('Rosa Vermelha');
    expect(el.querySelector('.relacoes')).toBeNull();
  });

  it('o botão Fechar chama ref.close()', () => {
    const el = montar().nativeElement as HTMLElement;
    const botao = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Fechar'),
    ) as HTMLButtonElement;
    botao.click();
    expect(ref.close).toHaveBeenCalled();
  });
});
