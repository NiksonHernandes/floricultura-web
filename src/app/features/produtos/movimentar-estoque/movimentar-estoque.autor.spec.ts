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
 * T-M4-12 (CA-21/CA-25): o diálogo de estoque passa a exibir o AUTOR (`usuarioNome`) em cada linha
 * de "Últimas movimentações", ou `—` quando nulo. Spec NOVO — não toca o movimentar-estoque.spec.
 */
describe('MovimentarEstoque — autor no histórico (T-M4-12, CA-21/CA-25)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/produtos';

  const produto: Produto = {
    id: 10,
    nome: 'Rosa Vermelha',
    descricao: null,
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 20,
    preco: null,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-02T14:00:00Z',
    atualizadoEm: '2026-09-02T14:00:00Z',
    temImagem: false,
  };

  const mov: Movimentacao = {
    id: 100,
    produtoId: 10,
    produtoNome: 'Rosa Vermelha',
    tipo: 'SAIDA',
    quantidade: 5,
    quantidadeResultante: 15,
    motivo: null,
    usuarioId: 3,
    usuarioNome: 'Ana',
    criadoEm: '2026-09-02T14:05:00Z',
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

  function iniciar(historico: Movimentacao[]): ComponentFixture<MovimentarEstoque> {
    const ref = jasmine.createSpyObj<MatDialogRef<MovimentarEstoque, Movimentacao>>('MatDialogRef', [
      'close',
    ]);
    const dados: MovimentarEstoqueDados = { produto };
    TestBed.configureTestingModule({
      imports: [MovimentarEstoque],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        // FornecedoresService deixou de ser `providedIn:'root'` (AD-SQ-72) → provider explícito no teste.
        FornecedoresService,
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: dados },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MovimentarEstoque);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === `${BASE}/10/movimentacoes`).flush(envelope(paginaMov(historico)));
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('exibe o autor (usuarioNome) na linha do histórico (CA-25)', () => {
    const el = iniciar([mov]).nativeElement as HTMLElement;
    expect(el.querySelector('.historico__autor')?.textContent).toContain('Ana');
  });

  it('autor nulo (linha pré-V7) exibe "—" sem quebrar (CA-21)', () => {
    const el = iniciar([{ ...mov, usuarioNome: null }]).nativeElement as HTMLElement;
    expect(el.querySelector('.historico__autor')?.textContent).toContain('—');
  });
});
