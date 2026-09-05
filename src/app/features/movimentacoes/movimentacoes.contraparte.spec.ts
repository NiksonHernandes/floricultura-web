import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';

import { Movimentacoes } from './movimentacoes';
import { VisualizarLancamento } from './visualizar-lancamento/visualizar-lancamento';
import { ApiResponse } from '../../core/models/api-response.model';
import { Movimentacao, PaginaResponse } from '../../core/models/produto.model';

/**
 * RF-3 (REVISÃO 2026-09-04/AD-SQ-67) — contraparte no card + ação "Visualizar". Spec NOVO: não toca o
 * `movimentacoes.spec` (M4/T-M4-11). Testa contra o CONTRATO §R3.3 (o `GET /movimentacoes` passa a
 * expor `fornecedorNome`/`clienteNome`; back RB-3 ainda não pronto) com `HttpTestingController`.
 * Dados FICTÍCIOS (LGPD): "Sítio Boa Flor" / "Maria Flores".
 */
describe('Movimentacoes — contraparte + visualizar (RF-3, R-CA-11)', () => {
  let httpMock: HttpTestingController;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  const BASE = 'http://localhost:8080/api/v1/movimentacoes';

  const entradaComFornecedor: Movimentacao = {
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

  const saidaComCliente: Movimentacao = {
    id: 2,
    produtoId: 5,
    produtoNome: 'Tulipa Amarela',
    tipo: 'SAIDA',
    quantidade: 4,
    quantidadeResultante: 26,
    motivo: null,
    usuarioId: 3,
    usuarioNome: 'Ana',
    fornecedorId: null,
    fornecedorNome: null,
    clienteId: 8,
    clienteNome: 'Maria Flores',
    criadoEm: '2026-09-03T18:00:00Z',
  };

  const ajusteSemContraparte: Movimentacao = {
    id: 3,
    produtoId: 5,
    produtoNome: 'Girassol',
    tipo: 'AJUSTE',
    quantidade: 12,
    quantidadeResultante: 12,
    motivo: null,
    usuarioId: 3,
    usuarioNome: 'Ana',
    fornecedorId: null,
    fornecedorNome: null,
    clienteId: null,
    clienteNome: null,
    criadoEm: '2026-09-03T19:00:00Z',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
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

  function iniciar(conteudo: Movimentacao[], total = conteudo.length): ComponentFixture<Movimentacoes> {
    const fixture = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo, total)));
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    dialogSpy = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    TestBed.configureTestingModule({
      imports: [Movimentacoes],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: dialogSpy },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('(a) ENTRADA com fornecedor mostra o campo "Fornecedor" no card', () => {
    const el = iniciar([entradaComFornecedor]).nativeElement as HTMLElement;
    const cp = el.querySelector('.campo--contraparte');
    expect(cp).toBeTruthy();
    expect(cp?.querySelector('dt')?.textContent).toContain('Fornecedor');
    expect(cp?.querySelector('dd')?.textContent).toContain('Sítio Boa Flor');
  });

  it('(a) SAÍDA com cliente mostra o campo "Cliente" no card', () => {
    const el = iniciar([saidaComCliente]).nativeElement as HTMLElement;
    const cp = el.querySelector('.campo--contraparte');
    expect(cp?.querySelector('dt')?.textContent).toContain('Cliente');
    expect(cp?.querySelector('dd')?.textContent).toContain('Maria Flores');
  });

  it('(c) lançamento sem contraparte (AJUSTE) NÃO mostra o campo', () => {
    const el = iniciar([ajusteSemContraparte]).nativeElement as HTMLElement;
    expect(el.querySelector('.campo--contraparte')).toBeNull();
    // e ainda há o card normal com autor/quantidade
    expect(el.querySelectorAll('.lancamento').length).toBe(1);
  });

  it('(b) clicar "Visualizar" abre o diálogo com a movimentação (R-CA-11)', () => {
    const fixture = iniciar([entradaComFornecedor]);
    const btn = (fixture.nativeElement as HTMLElement).querySelector(
      '.lancamento__ver',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    expect(dialogSpy.open).toHaveBeenCalledWith(
      VisualizarLancamento,
      jasmine.objectContaining({ data: { movimentacao: entradaComFornecedor } }),
    );
  });

  it('(d) paginação não regride: trocar de página refaz o GET com pagina/tamanho', () => {
    const fixture = iniciar(
      Array.from({ length: 20 }, (_, i) => ({ ...entradaComFornecedor, id: i + 1 })),
      80,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).aoPaginar({ pageIndex: 2, pageSize: 40 });
    const req = httpMock.expectOne(
      (r) => r.url === BASE && r.params.get('pagina') === '2' && r.params.get('tamanho') === '40',
    );
    expect(req.request.method).toBe('GET');
    req.flush(envelope(pagina([], 80)));
  });
});
