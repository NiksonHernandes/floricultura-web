import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { Fornecedores } from './fornecedores';
import { FornecedoresService } from './fornecedores.service';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse } from '../../core/models/produto.model';
import { Fornecedor } from '../../core/models/fornecedor.model';

/**
 * Fornecedores em TABELA (T-M6-08c — ajuste 8 do dono; SPEC-M6 §3.11, CA-31/CA-37). Espelho fiel de
 * `clientes.tabela.spec.ts` (T-M6-08b), mais o caso do estado-vazio SOB FILTRO (P2 do review).
 *
 * Arquivo NOVO: `fornecedores.spec.ts` (M5) segue intocado e continua verde — é ele que prova que os
 * hooks herdados sobreviveram ao redesenho. Aqui trava-se o que a tabela ADICIONA: as 5 colunas, os
 * dois filtros tri-estado virando params do back (§3.7), a ordenação por cabeçalho com `aria-sort` e
 * `pagina=0`, a marcação do clamp de observações e a mensagem honesta do vazio filtrado.
 *
 * Dados FICTÍCIOS (LGPD): "Flores do Vale"/"Sítio Raiz", `@exemplo.com.br`, `(11) 90000-0000`.
 */
describe('Fornecedores em tabela (T-M6-08c, CA-31)', () => {
  let httpMock: HttpTestingController;
  let ehAdmin: WritableSignal<boolean>;
  const BASE = 'http://localhost:8080/api/v1/fornecedores';

  const vale: Fornecedor = {
    id: 7,
    nome: 'Flores do Vale',
    telefone: '(11) 90000-0000',
    email: 'contato@exemplo.com.br',
    observacoes: 'Entrega às terças e sextas.',
    produtoIds: null,
    criadoEm: '2026-09-04T14:05:00Z',
    atualizadoEm: '2026-09-04T14:05:00Z',
  };

  const semContato: Fornecedor = {
    ...vale,
    id: 9,
    nome: 'Sítio Raiz',
    telefone: null,
    email: null,
    observacoes: null,
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Fornecedor[]): PaginaResponse<Fornecedor> {
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

  beforeEach(() => {
    ehAdmin = signal(true);
    const dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
    TestBed.configureTestingModule({
      imports: [Fornecedores],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        FornecedoresService,
        { provide: AuthService, useValue: { ehAdmin } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function iniciar(conteudo: Fornecedor[] = [vale]): ComponentFixture<Fornecedores> {
    const fixture = TestBed.createComponent(Fornecedores);
    fixture.detectChanges(); // ngOnInit → carregar()
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo)));
    fixture.detectChanges();
    return fixture;
  }

  /** O `<th>` da coluna (o texto do ordenado carrega junto a ligadura do mat-icon). */
  function thDe(fixture: ComponentFixture<Fornecedores>, rotulo: string): HTMLElement {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('thead th')).find(
      (el) => el.textContent?.trim().startsWith(rotulo),
    ) as HTMLElement;
  }

  /** Clica no botão de ordenação da coluna. */
  function ordenarPor(fixture: ComponentFixture<Fornecedores>, rotulo: string): void {
    (thDe(fixture, rotulo).querySelector('.tabela__ord') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  /** Clica numa das 3 opções (`0` Todos · `1` Com · `2` Sem) do filtro `grupo` (0 telefone, 1 e-mail). */
  function filtrar(
    fixture: ComponentFixture<Fornecedores>,
    grupo: number,
    opcao: number,
  ): void {
    const botoes = (fixture.nativeElement as HTMLElement)
      .querySelectorAll('.filtro')
      [grupo].querySelectorAll('.filtro__op');
    (botoes[opcao] as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  // --- Estrutura da tabela ---

  it('renderiza uma <table> com as 5 colunas do §3.11, na ordem', () => {
    const el = iniciar().nativeElement as HTMLElement;
    expect(el.querySelector('table.tabela')).toBeTruthy();
    // O rótulo mora no <span>; o texto do <th> ordenado carrega junto a ligadura do mat-icon.
    const cabecalhos = Array.from(el.querySelectorAll('thead th')).map((th) =>
      (th.querySelector('.tabela__ord span') ?? th).textContent?.trim(),
    );
    expect(cabecalhos).toEqual(['Nome', 'Telefone', 'E-mail', 'Observações', 'Ações']);
  });

  it('uma linha por fornecedor, com rótulo por célula para o celular (data-rotulo)', () => {
    const el = iniciar([vale, semContato]).nativeElement as HTMLElement;
    const linhas = el.querySelectorAll('tbody tr.ficha');
    expect(linhas.length).toBe(2);

    const celulas = linhas[0].querySelectorAll('td');
    expect(celulas.length).toBe(5);
    expect(celulas[0].textContent).toContain('Flores do Vale');
    expect(celulas[1].getAttribute('data-rotulo')).toBe('Telefone');
    expect(celulas[1].textContent).toContain('(11) 90000-0000');
    expect(celulas[2].getAttribute('data-rotulo')).toBe('E-mail');
    expect(celulas[2].textContent).toContain('contato@exemplo.com.br');
  });

  it('telefone e e-mail ausentes viram travessão (dado que não existe não é inventado)', () => {
    const el = iniciar([semContato]).nativeElement as HTMLElement;
    const vazios = el.querySelectorAll('tbody .tabela__vazio');
    expect(vazios.length).toBe(2);
    expect(vazios[0].textContent?.trim()).toBe('—');
    // O hook herdado do M5 continua dizendo a verdade para o leitor de tela.
    expect(el.querySelector('.ficha__linha--sem')?.textContent).toContain('Sem telefone ou e-mail');
    // Sem observação, a célula não ganha rótulo (não se anuncia rótulo de campo vazio no celular).
    expect(el.querySelectorAll('tbody td')[3].getAttribute('data-rotulo')).toBeNull();
  });

  it('observação vive num <span> dentro do <td> — o clamp de 1 linha depende disso', () => {
    // Armadilha real (P2 do review da T-M6-03): `.tabela td` declara `display` com especificidade
    // MAIOR que `.tabela__apoio`, nos dois breakpoints. Se a classe fosse posta no próprio <td>, o
    // `-webkit-line-clamp` seria descartado em silêncio e a observação longa estouraria a linha.
    const el = iniciar().nativeElement as HTMLElement;
    expect(el.querySelector('td.tabela__apoio')).toBeNull();
    const obs = el.querySelector('td > .tabela__apoio') as HTMLElement;
    expect(obs).toBeTruthy();
    expect(obs.classList).toContain('ficha__obs');
    expect(obs.getAttribute('title')).toBe(vale.observacoes!); // texto completo no title
  });

  // --- Filtros tri-estado → params do back (§3.7) ---

  it('filtro "Telefone: Com" faz UMA requisição com comTelefone=true e pagina=0', () => {
    const fixture = iniciar();
    const botoes = (fixture.nativeElement as HTMLElement)
      .querySelectorAll('.filtro')[0]
      .querySelectorAll('.filtro__op');
    expect(Array.from(botoes).map((b) => b.textContent?.trim())).toEqual(['Todos', 'Com', 'Sem']);

    filtrar(fixture, 0, 1);

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('comTelefone')).toBe('true');
    expect(req.request.params.get('pagina')).toBe('0');
    expect(req.request.params.has('comEmail')).toBeFalse();
    req.flush(envelope(pagina([vale])));
    fixture.detectChanges();
    expect(botoes[1].getAttribute('aria-pressed')).toBe('true');
    expect(botoes[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('"E-mail: Sem" manda comEmail=false e combina com o filtro de telefone (E)', () => {
    const fixture = iniciar();

    filtrar(fixture, 0, 2);
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([semContato])));
    fixture.detectChanges();

    filtrar(fixture, 1, 2);

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('comTelefone')).toBe('false'); // "Sem" é filtro, não ausência
    expect(req.request.params.get('comEmail')).toBe('false');
    req.flush(envelope(pagina([semContato])));
  });

  it('voltar para "Todos" tira o param da requisição (tri-estado)', () => {
    const fixture = iniciar();

    filtrar(fixture, 1, 1);
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([vale])));
    fixture.detectChanges();

    filtrar(fixture, 1, 0);
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.has('comEmail')).toBeFalse();
    req.flush(envelope(pagina([vale])));
  });

  it('vazio SOB FILTRO não mente dizendo que a agenda está vazia (P2 do review)', () => {
    const fixture = iniciar();

    filtrar(fixture, 0, 2); // "Telefone: Sem"
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([])));
    fixture.detectChanges();

    const vazio = (fixture.nativeElement as HTMLElement).querySelector('.estado--vazio');
    expect(vazio?.textContent).toContain('Nenhum fornecedor com esses filtros.');
    expect(vazio?.textContent).not.toContain('A agenda ainda está vazia');
  });

  it('sem filtro nenhum, a página vazia continua dizendo que a agenda está vazia', () => {
    const el = iniciar([]).nativeElement as HTMLElement;
    expect(el.querySelector('.estado--vazio')?.textContent).toContain('A agenda ainda está vazia');
  });

  // --- Ordenação pelo cabeçalho (§3.11) ---

  it('a lista nasce ordenada por nome asc e anuncia isso em aria-sort', () => {
    const fixture = TestBed.createComponent(Fornecedores);
    fixture.detectChanges();
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('ordenarPor')).toBe('nome');
    expect(req.request.params.get('direcao')).toBe('asc');
    req.flush(envelope(pagina([vale])));
    fixture.detectChanges();

    expect(thDe(fixture, 'Nome').getAttribute('aria-sort')).toBe('ascending');
    expect(thDe(fixture, 'Telefone').getAttribute('aria-sort')).toBe('none');
  });

  it('clicar em "Nome" inverte a direção, recarrega do back e volta para pagina=0', () => {
    const fixture = iniciar();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).aoPaginar({ pageIndex: 2, pageSize: 12 });
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([vale])));
    fixture.detectChanges();

    ordenarPor(fixture, 'Nome');

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('ordenarPor')).toBe('nome');
    expect(req.request.params.get('direcao')).toBe('desc');
    expect(req.request.params.get('pagina')).toBe('0');
    req.flush(envelope(pagina([vale])));
    fixture.detectChanges();
    expect(thDe(fixture, 'Nome').getAttribute('aria-sort')).toBe('descending');
  });

  it('clicar numa coluna nova começa em asc e move o aria-sort de coluna', () => {
    const fixture = iniciar();
    ordenarPor(fixture, 'Telefone');

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('ordenarPor')).toBe('telefone');
    expect(req.request.params.get('direcao')).toBe('asc');
    req.flush(envelope(pagina([vale])));
    fixture.detectChanges();

    expect(thDe(fixture, 'Telefone').getAttribute('aria-sort')).toBe('ascending');
    expect(thDe(fixture, 'Nome').getAttribute('aria-sort')).toBe('none');
    expect(thDe(fixture, 'E-mail').getAttribute('aria-sort')).toBe('none');
  });

  it('Observações e Ações não são ordenáveis (não têm botão nem aria-sort)', () => {
    const fixture = iniciar();
    expect(thDe(fixture, 'Observações').querySelector('.tabela__ord')).toBeNull();
    expect(thDe(fixture, 'Observações').getAttribute('aria-sort')).toBeNull();
    expect(thDe(fixture, 'Ações').querySelector('.tabela__ord')).toBeNull();
  });

  // --- Hooks herdados + RBAC de UX dentro da tabela ---

  it('a busca herdada (.busca input) sobrevive ao redesenho, dentro de .controles', () => {
    const el = iniciar().nativeElement as HTMLElement;
    expect(el.querySelector('.controles .busca input')).toBeTruthy();
    expect(el.querySelector('.ficha__monograma')?.textContent?.trim()).toBe('F');
  });

  it('USER lê a tabela inteira, mas sem as ações de escrita (FC-07)', () => {
    ehAdmin.set(false);
    const el = iniciar().nativeElement as HTMLElement;
    expect(el.querySelectorAll('tbody tr.ficha').length).toBe(1);
    expect(el.querySelector('.ficha__editar')).toBeNull();
    expect(el.querySelector('.ficha__excluir')).toBeNull();
    // A coluna "Ações" permanece no cabeçalho: o que é RBAC é o conteúdo, não a estrutura.
    expect(el.querySelectorAll('thead th')[4].textContent?.trim()).toBe('Ações');
    expect(el.querySelectorAll('tbody td')[4].children.length).toBe(0);
  });
});
