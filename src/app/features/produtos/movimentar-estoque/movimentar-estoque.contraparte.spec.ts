import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { MovimentarEstoque, MovimentarEstoqueDados } from './movimentar-estoque';
import { ApiResponse } from '../../../core/models/api-response.model';
import { Movimentacao, PaginaResponse, Produto } from '../../../core/models/produto.model';
import { Cliente } from '../../../core/models/cliente.model';
import { Fornecedor } from '../../../core/models/fornecedor.model';

/**
 * RF-2 (REVISÃO 2026-09-04/AD-SQ-64) — contraparte OPCIONAL na movimentação. Spec NOVO: não toca o
 * `movimentar-estoque.spec` (M2) nem o `.autor.spec` (M4). Testa contra o CONTRATO §R3.3 (back RB-3
 * ainda não pronto) com `HttpTestingController`. Dados FICTÍCIOS (LGPD): "Sítio Boa Flor"/"Maria Flores".
 *
 * Invariante anti-burla (R5.5): as opções carregam SÓ ao abrir o select; quando o select não é aberto,
 * nenhum `GET /fornecedores`/`/clientes` é disparado (por isso as suítes herdadas seguem com o
 * `httpMock.verify()` limpo).
 */
describe('MovimentarEstoque — contraparte por tipo (RF-2, R-CA-13)', () => {
  let fixture: ComponentFixture<MovimentarEstoque>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let probe: any;
  let httpMock: HttpTestingController;
  let ref: jasmine.SpyObj<MatDialogRef<MovimentarEstoque, Movimentacao>>;

  const PRODUTOS = 'http://localhost:8080/api/v1/produtos';
  const FORNECEDORES = 'http://localhost:8080/api/v1/fornecedores';
  const CLIENTES = 'http://localhost:8080/api/v1/clientes';

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

  const fornecedores = [
    { id: 3, nome: 'Sítio Boa Flor' },
    { id: 4, nome: 'Flores do Vale' },
  ] as unknown as Fornecedor[];

  const clientes = [
    { id: 8, nome: 'Maria Flores' },
    { id: 9, nome: 'Buquê & Cia' },
  ] as unknown as Cliente[];

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function paginaMov(conteudo: Movimentacao[]): PaginaResponse<Movimentacao> {
    return { conteudo, pagina: 0, tamanho: 5, totalElementos: conteudo.length, totalPaginas: 1, primeira: true, ultima: true };
  }

  function pagina<T>(conteudo: T[]): PaginaResponse<T> {
    return { conteudo, pagina: 0, tamanho: 100, totalElementos: conteudo.length, totalPaginas: 1, primeira: true, ultima: true };
  }

  const movBase: Movimentacao = {
    id: 100,
    produtoId: 10,
    produtoNome: 'Rosa Vermelha',
    tipo: 'ENTRADA',
    quantidade: 10,
    quantidadeResultante: 30,
    motivo: null,
    usuarioId: 3,
    criadoEm: '2026-09-02T14:05:00Z',
  };

  /** Cria o diálogo e atende o GET de histórico inicial. */
  function iniciar(): void {
    ref = jasmine.createSpyObj<MatDialogRef<MovimentarEstoque, Movimentacao>>('MatDialogRef', ['close']);
    const dados: MovimentarEstoqueDados = { produto };
    TestBed.configureTestingModule({
      imports: [MovimentarEstoque],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
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

  afterEach(() => httpMock.verify());

  it('AJUSTE não mostra contraparte (tipoContraparte = null)', () => {
    iniciar();
    probe.form.controls.tipo.setValue('AJUSTE');
    expect(probe.tipoContraparte()).toBeNull();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Fornecedor');
    expect(el.textContent).not.toContain('Cliente');
  });

  it('(a) ENTRADA carrega fornecedores ao abrir (?tamanho=100) e envia fornecedorId no payload', () => {
    iniciar();
    probe.form.controls.tipo.setValue('ENTRADA');
    expect(probe.tipoContraparte()).toBe('FORNECEDOR');

    // Opções carregam SÓ ao abrir o select (load-on-open — anti-burla).
    probe.aoAbrirFornecedores(true);
    const opt = httpMock.expectOne((r) => r.url === FORNECEDORES);
    expect(opt.request.method).toBe('GET');
    expect(opt.request.params.get('pagina')).toBe('0');
    expect(opt.request.params.get('tamanho')).toBe('100');
    opt.flush(envelope(pagina(fornecedores)));
    expect(probe.fornecedores().length).toBe(2);

    probe.contraparteId.setValue(3);
    probe.form.controls.quantidade.setValue(10);
    probe.registrar();

    const req = httpMock.expectOne(`${PRODUTOS}/10/movimentacoes`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ tipo: 'ENTRADA', quantidade: 10, motivo: null, fornecedorId: 3 });
    req.flush(envelope({ ...movBase, fornecedorId: 3, fornecedorNome: 'Sítio Boa Flor' }));
    expect(ref.close).toHaveBeenCalled();
  });

  it('(b) SAÍDA carrega clientes ao abrir (?tamanho=100) e envia clienteId no payload', () => {
    iniciar();
    probe.form.controls.tipo.setValue('SAIDA');
    expect(probe.tipoContraparte()).toBe('CLIENTE');

    probe.aoAbrirClientes(true);
    const opt = httpMock.expectOne((r) => r.url === CLIENTES);
    expect(opt.request.params.get('tamanho')).toBe('100');
    opt.flush(envelope(pagina(clientes)));
    expect(probe.clientes().length).toBe(2);

    probe.contraparteId.setValue(8);
    probe.form.controls.quantidade.setValue(5);
    probe.registrar();

    const req = httpMock.expectOne(`${PRODUTOS}/10/movimentacoes`);
    expect(req.request.body).toEqual({ tipo: 'SAIDA', quantidade: 5, motivo: null, clienteId: 8 });
    req.flush(envelope({ ...movBase, tipo: 'SAIDA', quantidade: 5, clienteId: 8, clienteNome: 'Maria Flores' }));
    expect(ref.close).toHaveBeenCalled();
  });

  it('(c) trocar o tipo limpa a contraparte do outro tipo', () => {
    iniciar();
    probe.form.controls.tipo.setValue('ENTRADA');
    probe.aoAbrirFornecedores(true);
    httpMock.expectOne((r) => r.url === FORNECEDORES).flush(envelope(pagina(fornecedores)));
    probe.contraparteId.setValue(3);
    expect(probe.contraparteId.value).toBe(3);

    // Troca ENTRADA → SAÍDA: a seleção de fornecedor é zerada; a contraparte vira cliente.
    probe.form.controls.tipo.setValue('SAIDA');
    expect(probe.contraparteId.value).toBeNull();
    expect(probe.tipoContraparte()).toBe('CLIENTE');
    // Sem abrir o select de clientes, nenhum GET /clientes dispara (verify fica limpo).
  });

  it('(d) sem seleção de contraparte → payload sem fornecedorId/clienteId (preserva a forma do M2)', () => {
    iniciar();
    probe.form.controls.tipo.setValue('ENTRADA');
    probe.form.controls.quantidade.setValue(10);
    probe.registrar();

    const req = httpMock.expectOne(`${PRODUTOS}/10/movimentacoes`);
    expect(req.request.body).toEqual({ tipo: 'ENTRADA', quantidade: 10, motivo: null });
    const corpo = req.request.body as Record<string, unknown>;
    expect('fornecedorId' in corpo).toBeFalse();
    expect('clienteId' in corpo).toBeFalse();
    req.flush(envelope(movBase));
  });
});
