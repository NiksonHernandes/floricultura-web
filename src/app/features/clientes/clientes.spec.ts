import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { Clientes } from './clientes';
import { ClientesService } from './clientes.service';
import { ConfirmarExclusao } from '../produtos/confirmar-exclusao/confirmar-exclusao';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse } from '../../core/models/produto.model';
import { Cliente } from '../../core/models/cliente.model';

/**
 * Lista de Clientes (T-M5-7, CA-11/CA-13/CA-14). Espelha `eventos.spec.ts`. Dados FICTÍCIOS
 * (LGPD, §3.3): "Maria Flores", `@exemplo.com.br`, `(11) 90000-0000` — nunca PII real.
 */
describe('Clientes (lista — T-M5-7, CA-11/CA-13/CA-14)', () => {
  let httpMock: HttpTestingController;
  let ehAdmin: WritableSignal<boolean>;
  let dialog: jasmine.SpyObj<MatDialog>;
  const BASE = 'http://localhost:8080/api/v1/clientes';

  // Item de LISTA: produtoIds vem null (AD-SQ-38/44).
  const base: Cliente = {
    id: 7,
    nome: 'Maria Flores',
    telefone: '(11) 90000-0000',
    email: 'maria@exemplo.com.br',
    observacoes: 'Prefere arranjos de outono.',
    produtoIds: null,
    criadoEm: '2026-09-04T14:05:00Z',
    atualizadoEm: '2026-09-04T14:05:00Z',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Cliente[], total = conteudo.length): PaginaResponse<Cliente> {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
    TestBed.configureTestingModule({
      imports: [Clientes],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        ClientesService,
        { provide: AuthService, useValue: { ehAdmin } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function iniciar(conteudo: Cliente[], total = conteudo.length): ComponentFixture<Clientes> {
    const fixture = TestBed.createComponent(Clientes);
    fixture.detectChanges(); // ngOnInit → carregar()
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo, total)));
    fixture.detectChanges();
    return fixture;
  }

  // --- CA-11: render de lista / paginação / filtro / estados ---

  it('renderiza um único <h1> "Clientes" (a11y — um h1 por página)', () => {
    const el = iniciar([base]).nativeElement as HTMLElement;
    const titulos = el.querySelectorAll('h1');
    expect(titulos.length).toBe(1);
    expect(titulos[0].textContent).toContain('Clientes');
  });

  it('um card por cliente com monograma, nome, telefone e e-mail', () => {
    const el = iniciar([base]).nativeElement as HTMLElement;
    expect(el.querySelectorAll('.ficha').length).toBe(1);
    expect(el.querySelector('.ficha__monograma')?.textContent?.trim()).toBe('M'); // inicial
    expect(el.textContent).toContain('Maria Flores');
    expect(el.textContent).toContain('(11) 90000-0000');
    expect(el.textContent).toContain('maria@exemplo.com.br');
    expect(el.querySelector('.ficha__obs')?.textContent).toContain('arranjos de outono');
  });

  it('sem telefone e sem e-mail mostra a linha honesta de "sem contato"', () => {
    const semContato: Cliente = { ...base, telefone: null, email: null };
    const el = iniciar([semContato]).nativeElement as HTMLElement;
    expect(el.querySelector('.ficha__linha--sem')?.textContent).toContain('Sem telefone ou e-mail');
  });

  it('empty-state quando a página vem vazia', () => {
    const el = iniciar([]).nativeElement as HTMLElement;
    expect(el.querySelector('.estado--vazio')).toBeTruthy();
    expect(el.querySelectorAll('.ficha').length).toBe(0);
  });

  it('error-state com "Tentar de novo" que recarrega a lista', () => {
    const fixture = TestBed.createComponent(Clientes);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === BASE)
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.estado--erro')).toBeTruthy();
    (el.querySelector('.estado--erro button') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base])));
    fixture.detectChanges();
    expect(el.querySelector('.estado--erro')).toBeNull();
    expect(el.querySelectorAll('.ficha').length).toBe(1);
  });

  it('filtro por nome com debounce (~300ms) refaz a busca com o param nome (CA-11)', fakeAsync(() => {
    const fixture = iniciar([base]);
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '.busca input',
    ) as HTMLInputElement;

    input.value = 'ma';
    input.dispatchEvent(new Event('input'));

    tick(150);
    httpMock.expectNone((r) => r.url === BASE); // ainda no debounce

    tick(200); // passa dos 300ms
    const req = httpMock.expectOne((r) => r.url === BASE && r.params.get('nome') === 'ma');
    expect(req.request.params.get('pagina')).toBe('0'); // reinicia na 1ª página
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

  // --- CA-13: RBAC de UX ---

  it('USER não vê "Novo cliente"/Editar/Excluir (só lê — CA-13)', () => {
    ehAdmin.set(false);
    const el = iniciar([base]).nativeElement as HTMLElement;
    expect(el.querySelector('.placa__acao')).toBeNull();
    expect(el.querySelector('.ficha__editar')).toBeNull();
    expect(el.querySelector('.ficha__excluir')).toBeNull();
  });

  it('ADMIN vê "Novo cliente" na placa e Editar/Excluir no card (CA-13)', () => {
    ehAdmin.set(true);
    const el = iniciar([base]).nativeElement as HTMLElement;
    expect(el.querySelector('.placa__acao')?.textContent).toContain('Novo cliente');
    expect(el.querySelector('.ficha__editar')).toBeTruthy();
    expect(el.querySelector('.ficha__excluir')).toBeTruthy();
    expect(el.querySelectorAll('h1').length).toBe(1);
  });

  it('ADMIN clicando em "Novo cliente" arma o gancho do form (T-M5-8) sem quebrar', () => {
    ehAdmin.set(true);
    const fixture = iniciar([base]);
    (fixture.nativeElement.querySelector('.placa__acao') as HTMLButtonElement).click();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = fixture.componentInstance as any;
    expect(comp.formAberto()).toBeTrue();
    expect(comp.clienteEmEdicao()).toBeNull();
    // o overlay <app-cliente-form> só chega na T-M5-8: ainda não renderiza nada.
    expect(fixture.nativeElement.querySelector('app-cliente-form')).toBeNull();
  });

  // --- CA-14: hard delete com confirmação ---

  it('Excluir abre a confirmação com o NOME e, confirmando, faz DELETE + recarrega (CA-14/FC-08)', () => {
    ehAdmin.set(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(true) } as any);
    const el = iniciar([base]).nativeElement as HTMLElement;

    (el.querySelector('.ficha__excluir') as HTMLButtonElement).click();

    expect(dialog.open).toHaveBeenCalledWith(
      ConfirmarExclusao,
      jasmine.objectContaining({ data: { nome: base.nome } }),
    );
    httpMock.expectOne((r) => r.url === `${BASE}/${base.id}` && r.method === 'DELETE').flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    httpMock.expectOne((r) => r.url === BASE && r.method === 'GET').flush(envelope(pagina([])));
  });

  it('Excluir cancelado (afterClosed=false) NÃO faz DELETE (CA-14)', () => {
    ehAdmin.set(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(false) } as any);
    const el = iniciar([base]).nativeElement as HTMLElement;
    (el.querySelector('.ficha__excluir') as HTMLButtonElement).click();
    expect(dialog.open).toHaveBeenCalledWith(ConfirmarExclusao, jasmine.anything());
    httpMock.expectNone((r) => r.method === 'DELETE');
  });
});
