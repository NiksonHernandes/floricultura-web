import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { MovimentarEstoque, MovimentarEstoqueDados } from './movimentar-estoque';
import { ApiResponse } from '../../../core/models/api-response.model';
import { Movimentacao, PaginaResponse, Produto } from '../../../core/models/produto.model';

/** Probe do interno protegido — dirige o form e dispara o submit sem tocar no DOM do Material. */
interface Probe {
  form: {
    setValue(v: { tipo: string; quantidade: number | null; motivo: string }): void;
    patchValue(v: Partial<{ tipo: string; quantidade: number | null; motivo: string }>): void;
    readonly invalid: boolean;
  };
  registrar(): void;
  erroGeral(): string | null;
  historico(): Movimentacao[];
}

describe('MovimentarEstoque (T-M2-9 — CA-20 movimentação / CA-11)', () => {
  let fixture: ComponentFixture<MovimentarEstoque>;
  let probe: Probe;
  let httpMock: HttpTestingController;
  let ref: jasmine.SpyObj<MatDialogRef<MovimentarEstoque, Movimentacao>>;

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

  const movBase: Movimentacao = {
    id: 100,
    produtoId: 10,
    produtoNome: 'Rosa Vermelha',
    tipo: 'SAIDA',
    quantidade: 5,
    quantidadeResultante: 15,
    motivo: 'Venda no balcão',
    usuarioId: 3,
    criadoEm: '2026-09-02T14:05:00Z',
  };

  /** Cria o diálogo, atende o GET de histórico inicial e devolve o fixture pronto. */
  function iniciar(historico: Movimentacao[] = []): void {
    ref = jasmine.createSpyObj<MatDialogRef<MovimentarEstoque, Movimentacao>>('MatDialogRef', [
      'close',
    ]);
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
    httpMock
      .expectOne((r) => r.url === `${BASE}/10/movimentacoes`)
      .flush(envelope(paginaMov(historico)));
    fixture.detectChanges();
    probe = fixture.componentInstance as unknown as Probe;
  }

  afterEach(() => httpMock.verify());

  it('carrega as últimas movimentações no init (movimentacoes(id, 0, 5))', () => {
    iniciar([movBase]);
    expect(probe.historico()).toEqual([movBase]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.historico__item').length).toBe(1);
  });

  it('exibe o saldo atual do produto no cabeçalho', () => {
    iniciar();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.livro__saldo-num')?.textContent).toContain('20');
  });

  it('submit inválido (sem tipo/quantidade) NÃO chama o back nem fecha', () => {
    iniciar();
    probe.registrar();
    httpMock.expectNone((r) => r.method === 'POST');
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('ENTRADA válida → POST e fecha devolvendo a Movimentacao (a lista recarrega o estoque)', () => {
    iniciar();
    probe.form.setValue({ tipo: 'ENTRADA', quantidade: 30, motivo: '' });
    probe.registrar();

    const req = httpMock.expectOne(`${BASE}/10/movimentacoes`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ tipo: 'ENTRADA', quantidade: 30, motivo: null });
    const resultado: Movimentacao = { ...movBase, tipo: 'ENTRADA', quantidade: 30, quantidadeResultante: 50 };
    req.flush(envelope(resultado));

    expect(ref.close).toHaveBeenCalledOnceWith(resultado);
  });

  it('SAÍDA acima do estoque → 400 mostra a mensagem de bloqueio SEM fechar (CA-11)', () => {
    iniciar();
    probe.form.setValue({ tipo: 'SAIDA', quantidade: 999, motivo: '' });
    probe.registrar();

    const req = httpMock.expectOne(`${BASE}/10/movimentacoes`);
    const corpo: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Estoque insuficiente (20 em estoque).',
        details: [{ field: 'quantidade', message: 'Estoque insuficiente.' }],
      },
      timestamp: '',
      path: '',
    };
    req.flush(corpo, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    // A mensagem do back aparece no diálogo e ele NÃO fecha (não quebra a tela — CA-11).
    expect(probe.erroGeral()).toBe('Estoque insuficiente (20 em estoque).');
    expect(ref.close).not.toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.livro__erro')?.textContent).toContain('Estoque insuficiente (20 em estoque).');
  });

  it('403 → mensagem de permissão sem fechar', () => {
    iniciar();
    probe.form.setValue({ tipo: 'ENTRADA', quantidade: 5, motivo: '' });
    probe.registrar();

    httpMock.expectOne(`${BASE}/10/movimentacoes`).flush(null, {
      status: 403,
      statusText: 'Forbidden',
    });

    expect(probe.erroGeral()).toContain('permissão');
    expect(ref.close).not.toHaveBeenCalled();
  });
});
