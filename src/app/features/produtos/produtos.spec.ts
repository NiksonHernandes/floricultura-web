import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { Produtos } from './produtos';
import { ConfirmarExclusao } from './confirmar-exclusao/confirmar-exclusao';
import { MovimentarEstoque } from './movimentar-estoque/movimentar-estoque';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { Movimentacao, PaginaResponse, Produto } from '../../core/models/produto.model';

describe('Produtos (lista — T-M2-7, CA-19/CA-15)', () => {
  let httpMock: HttpTestingController;
  // RBAC de UX (T-M2-8): controla `authService.ehAdmin` por teste (default = USER/não-admin).
  let ehAdmin: WritableSignal<boolean>;
  // Diálogos de exclusão/movimentação abrem via MatDialog (T-M2-9): stub controla o afterClosed.
  let dialog: jasmine.SpyObj<MatDialog>;

  const BASE = 'http://localhost:8080/api/v1/produtos';

  const base: Produto = {
    id: 1,
    nome: 'Rosa Vermelha',
    descricao: 'Maço com 12 hastes',
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 25,
    preco: 4.5,
    imagemUrl: 'https://exemplo.local/rosa.jpg',
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-02T14:00:00Z',
    atualizadoEm: '2026-09-02T14:00:00Z',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Produto[], total = conteudo.length): PaginaResponse<Produto> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 12,
      totalElementos: total,
      totalPaginas: Math.max(1, Math.ceil(total / 12)),
      primeira: true,
      ultima: total <= 12,
    };
  }

  beforeEach(() => {
    ehAdmin = signal(false);
    dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    // Default: diálogo fecha sem resultado (cancelar) — cada teste sobrescreve o afterClosed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
    TestBed.configureTestingModule({
      imports: [Produtos],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        // Stub só do que a tela usa do AuthService: o signal `ehAdmin` (RBAC de UX).
        { provide: AuthService, useValue: { ehAdmin } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Cria a tela, atende o GET inicial com `conteudo` e retorna o fixture pronto. */
  function iniciar(conteudo: Produto[], total = conteudo.length): ComponentFixture<Produtos> {
    const fixture = TestBed.createComponent(Produtos);
    fixture.detectChanges(); // dispara ngOnInit → carregar()
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo, total)));
    fixture.detectChanges();
    return fixture;
  }

  it('cria a Home de produtos', () => {
    const fixture = iniciar([base]);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renderiza um único <h1> "Produtos" (a11y — um h1 por página; guard herdado da T-M2-6)', () => {
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;
    const titulos = el.querySelectorAll('h1');
    expect(titulos.length).toBe(1);
    expect(titulos[0].textContent).toContain('Produtos');
  });

  it('mostra um card por produto com estoque e unidade (m3 → m³)', () => {
    const fixture = iniciar([{ ...base, unidadeMedida: 'm3', estoqueAtual: 3 }]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.vaso').length).toBe(1);
    expect(el.textContent).toContain('3 m³');
  });

  it('exibe o selo "estoque baixo" quando estoqueBaixo é true (CA-15)', () => {
    const fixture = iniciar([{ ...base, estoqueBaixo: true }]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.selo-baixo')).toBeTruthy();
  });

  it('NÃO exibe o selo quando estoqueBaixo é false', () => {
    const fixture = iniciar([{ ...base, estoqueBaixo: false }]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.selo-baixo')).toBeNull();
  });

  it('usa placeholder quando imagemUrl é null (fallback AD-SQ-32)', () => {
    const fixture = iniciar([{ ...base, imagemUrl: null }]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.vaso__placeholder')).toBeTruthy();
    expect(el.querySelector('.vaso__img')).toBeNull();
  });

  it('cai no placeholder quando o <img> dispara (error) (fallback AD-SQ-32)', () => {
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;
    const img = el.querySelector('.vaso__img') as HTMLImageElement;
    expect(img).toBeTruthy();
    img.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(el.querySelector('.vaso__img')).toBeNull();
    expect(el.querySelector('.vaso__placeholder')).toBeTruthy();
  });

  it('exibe "a definir" quando preco é null (empty-state honesto, sem R$ 0,00 fake)', () => {
    const fixture = iniciar([{ ...base, preco: null }]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.meta__vazio')?.textContent).toContain('a definir');
  });

  it('filtro por nome com debounce (~300ms) refaz a busca com o param nome', fakeAsync(() => {
    const fixture = iniciar([base]);
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '.busca input',
    ) as HTMLInputElement;

    input.value = 'ro';
    input.dispatchEvent(new Event('input'));

    tick(150);
    httpMock.expectNone((r) => r.url === BASE); // ainda dentro do debounce

    tick(200); // passa dos 300ms
    const req = httpMock.expectOne((r) => r.url === BASE && r.params.get('nome') === 'ro');
    expect(req.request.params.get('pagina')).toBe('0'); // filtro reinicia na 1ª página
    req.flush(envelope(pagina([base])));
    fixture.detectChanges();
  }));

  it('trocar de página chama o serviço com pagina/tamanho (MatPaginator 0-based)', () => {
    const fixture = iniciar(Array.from({ length: 12 }, (_, i) => ({ ...base, id: i + 1 })), 40);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).aoPaginar({ pageIndex: 2, pageSize: 24 });

    const req = httpMock.expectOne(
      (r) => r.url === BASE && r.params.get('pagina') === '2' && r.params.get('tamanho') === '24',
    );
    expect(req.request.method).toBe('GET');
    req.flush(envelope(pagina([], 40)));
  });

  it('empty-state quando a página vem vazia', () => {
    const fixture = iniciar([]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.estado--vazio')).toBeTruthy();
    expect(el.querySelectorAll('.vaso').length).toBe(0);
  });

  it('error-state com "Tentar de novo" que recarrega a lista', () => {
    const fixture = TestBed.createComponent(Produtos);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === BASE)
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const erro = el.querySelector('.estado--erro');
    expect(erro).toBeTruthy();

    const botao = erro?.querySelector('button') as HTMLButtonElement;
    expect(botao.textContent).toContain('Tentar de novo');
    botao.click();

    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base])));
    fixture.detectChanges();
    expect(el.querySelector('.estado--erro')).toBeNull();
    expect(el.querySelectorAll('.vaso').length).toBe(1);
  });

  // --- Integração do form + RBAC das ações de escrita (T-M2-8, CA-20) ---

  it('USER não vê as ações de escrita "Novo produto"/"Editar" (RBAC — CA-20)', () => {
    ehAdmin.set(false);
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.placa__acao')).toBeNull();
    expect(el.querySelector('.vaso__editar')).toBeNull();
  });

  it('ADMIN vê "Novo produto" na placa e "Editar" no card (RBAC — CA-20)', () => {
    ehAdmin.set(true);
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.placa__acao')?.textContent).toContain('Novo produto');
    expect(el.querySelector('.vaso__editar')).toBeTruthy();
    // Guard herdado: mesmo com as ações, segue existindo um único <h1>.
    expect(el.querySelectorAll('h1').length).toBe(1);
  });

  it('ADMIN abre o diálogo do form ao clicar em "Novo produto"', () => {
    ehAdmin.set(true);
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-produto-form')).toBeNull();

    (el.querySelector('.placa__acao') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('.veu')).toBeTruthy();
    expect(el.querySelector('app-produto-form')).toBeTruthy();
  });

  it('ao salvar, o form fecha e a lista recarrega (nova chamada ao back)', () => {
    ehAdmin.set(true);
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;

    (el.querySelector('.placa__acao') as HTMLButtonElement).click();
    fixture.detectChanges();

    // Simula o emit `salvo` do form filho → a lista deve refazer o GET e fechar o diálogo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).aoSalvar({ ...base, nome: 'Novo' });
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base])));
    fixture.detectChanges();

    expect(el.querySelector('app-produto-form')).toBeNull();
  });

  // --- T-M2-9: exclusão (hard delete) + movimentação (CA-20 delete/mov, CA-11) ---

  it('USER não vê as ações "Movimentar"/"Excluir" no card (RBAC — CA-20)', () => {
    ehAdmin.set(false);
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.vaso__movimentar')).toBeNull();
    expect(el.querySelector('.vaso__excluir')).toBeNull();
  });

  it('ADMIN vê "Movimentar" e "Excluir" no card (RBAC — CA-20)', () => {
    ehAdmin.set(true);
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.vaso__movimentar')).toBeTruthy();
    expect(el.querySelector('.vaso__excluir')).toBeTruthy();
    // Guard herdado: as ações novas não introduzem um segundo <h1>.
    expect(el.querySelectorAll('h1').length).toBe(1);
  });

  it('Excluir abre a confirmação com o NOME e, confirmando, faz DELETE + recarrega (CA-20/FC-08)', () => {
    ehAdmin.set(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(true) } as any);
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;

    (el.querySelector('.vaso__excluir') as HTMLButtonElement).click();

    // Abriu o diálogo de confirmação passando o nome do produto (FC-08).
    expect(dialog.open).toHaveBeenCalledWith(
      ConfirmarExclusao,
      jasmine.objectContaining({ data: { nome: base.nome } }),
    );
    // Confirmado (afterClosed=true) → DELETE e recarga da lista.
    httpMock.expectOne((r) => r.url === `${BASE}/${base.id}` && r.method === 'DELETE').flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    httpMock.expectOne((r) => r.url === BASE && r.method === 'GET').flush(envelope(pagina([])));
  });

  it('Excluir cancelado (afterClosed=false) NÃO faz DELETE', () => {
    ehAdmin.set(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(false) } as any);
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;

    (el.querySelector('.vaso__excluir') as HTMLButtonElement).click();

    expect(dialog.open).toHaveBeenCalledWith(ConfirmarExclusao, jasmine.anything());
    httpMock.expectNone((r) => r.method === 'DELETE');
  });

  it('Movimentar abre o diálogo com o produto e, ao concluir, recarrega a lista (CA-20)', () => {
    ehAdmin.set(true);
    const mov: Movimentacao = {
      id: 100,
      produtoId: base.id,
      produtoNome: base.nome,
      tipo: 'ENTRADA',
      quantidade: 5,
      quantidadeResultante: 30,
      motivo: null,
      usuarioId: 3,
      criadoEm: '2026-09-02T14:05:00Z',
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(mov) } as any);
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;

    (el.querySelector('.vaso__movimentar') as HTMLButtonElement).click();

    expect(dialog.open).toHaveBeenCalledWith(
      MovimentarEstoque,
      jasmine.objectContaining({ data: { produto: base } }),
    );
    // Movimentação concluída → a lista recarrega o estoque.
    httpMock.expectOne((r) => r.url === BASE && r.method === 'GET').flush(envelope(pagina([base])));
  });
});
