import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { WritableSignal, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';

import { Cores } from './cores';
import { CoresService } from './cores.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { PaginaResponse } from '../../../core/models/produto.model';
import { Cor } from '../../../core/models/cor.model';

/**
 * Configurações → Cores, LISTA (T-M6-06a — SPEC-M6 §3.15, CA-30/CA-40/CA-37).
 *
 * Fronteira desta task: a tela lista o catálogo em tabela densa com amostra + nome canônico +
 * `produtosVinculados`, busca por nome server-side e paginação. Criar/editar/excluir e a coluna
 * "Ações" são da T-M6-06b — e os casos abaixo travam a AUSÊNCIA deles de propósito: entregar um
 * botão que não faz nada seria UI desonesta no print de evidência.
 */
describe('Configurações → Cores — lista (T-M6-06a, CA-30)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/cores';

  const cinza: Cor = {
    id: 7,
    nome: 'CINZA-ESCURO',
    hex: '#C4326B',
    produtosVinculados: 3,
    criadoEm: '2026-09-11T13:02:11Z',
    atualizadoEm: '2026-09-11T13:02:11Z',
  };

  const azul: Cor = { ...cinza, id: 9, nome: 'AZUL', hex: null, produtosVinculados: 0 };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Cor[]): PaginaResponse<Cor> {
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
    TestBed.configureTestingModule({
      imports: [Cores],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        CoresService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function iniciar(conteudo: Cor[] = [cinza]): ComponentFixture<Cores> {
    const fixture = TestBed.createComponent(Cores);
    fixture.detectChanges(); // ngOnInit → carregar()
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo)));
    fixture.detectChanges();
    return fixture;
  }

  // --- Estrutura da tabela (§3.15) ---

  it('renderiza a tabela dentro do cartão, com as DUAS colunas desta task', () => {
    const el = iniciar().nativeElement as HTMLElement;
    expect(el.querySelector('.tabela-cartao > table.tabela')).toBeTruthy();

    const cabecalhos = Array.from(el.querySelectorAll('thead th')).map((th) =>
      th.textContent?.trim(),
    );
    expect(cabecalhos).toEqual(['Cor', 'Produtos vinculados']);
  });

  it('uma linha por cor, com amostra pintada no hex do back e rótulo p/ o celular', () => {
    const el = iniciar([cinza, azul]).nativeElement as HTMLElement;
    const linhas = el.querySelectorAll('tbody tr.cor');
    expect(linhas.length).toBe(2);

    const amostra = linhas[0].querySelector('.cor__amostra') as HTMLElement;
    // `rgb(196, 50, 107)` é o `#C4326B` que o back devolveu — nenhuma cor é escolhida no front.
    expect(amostra.style.backgroundColor).toBe('rgb(196, 50, 107)');
    expect(amostra.getAttribute('title')).toBe('#C4326B');
    expect(linhas[0].querySelectorAll('td')[1].getAttribute('data-rotulo')).toBe(
      'Produtos vinculados',
    );
  });

  it('cor sem hex NÃO ganha cor inventada: pastilha vazada + aviso para leitor de tela', () => {
    const el = iniciar([azul]).nativeElement as HTMLElement;
    const amostra = el.querySelector('.cor__amostra') as HTMLElement;

    expect(amostra.classList).toContain('cor__amostra--sem');
    expect(amostra.style.backgroundColor).toBe('');
    expect(amostra.getAttribute('title')).toBe('Sem amostra cadastrada');
    expect(el.querySelector('.sr')?.textContent).toContain('Sem amostra de cor cadastrada');
  });

  it('produtos vinculados mostra a contagem do back; 0 vira "Nenhum" (apoio), não um zero solto', () => {
    const el = iniciar([cinza, azul]).nativeElement as HTMLElement;
    const celulas = el.querySelectorAll('tbody td[data-rotulo]');

    expect(celulas[0].textContent?.trim()).toBe('3');
    expect(celulas[1].querySelector('.tabela__vazio')?.textContent?.trim()).toBe('Nenhum');
  });

  it('exibe o nome CANÔNICO exatamente como veio, sem re-embelezar (CA-40/R1d)', () => {
    const el = iniciar([cinza]).nativeElement as HTMLElement;
    const nome = el.querySelector('.cor__nome') as HTMLElement;

    expect(nome.textContent?.trim()).toBe('CINZA-ESCURO');
    // A prova contra `titlecase`/`text-transform`: o texto pintado é idêntico ao dado do back.
    expect(getComputedStyle(nome).textTransform).toBe('none');
  });

  // --- Busca server-side (§3.2) ---

  it('digitar na busca faz UMA requisição com o termo cru e volta para pagina=0', fakeAsync(() => {
    const fixture = iniciar();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).aoPaginar({ pageIndex: 2, pageSize: 12 });
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([cinza])));
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '.busca input',
    ) as HTMLInputElement;
    input.value = 'cinza escuro';
    input.dispatchEvent(new Event('input'));
    tick(300); // debounce

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('nome')).toBe('cinza escuro');
    expect(req.request.params.get('pagina')).toBe('0');
    req.flush(envelope(pagina([cinza])));
    fixture.detectChanges();
  }));

  // --- Estados honestos ---

  it('catálogo vazio e busca sem resultado dizem coisas diferentes', fakeAsync(() => {
    const fixture = iniciar([]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.estado--vazio')?.textContent).toContain(
      'O catálogo ainda está vazio',
    );

    const input = el.querySelector('.busca input') as HTMLInputElement;
    input.value = 'roxo';
    input.dispatchEvent(new Event('input'));
    tick(300);
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([])));
    fixture.detectChanges();

    expect(el.querySelector('.estado--vazio')?.textContent).toContain('Nenhuma cor encontrada');
  }));

  it('falha de rede vira erro com "tentar de novo" — nunca lista vazia silenciosa', () => {
    const fixture = TestBed.createComponent(Cores);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === BASE)
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.estado--erro')?.textContent).toContain(
      'Não foi possível carregar o catálogo de cores',
    );
    expect(el.querySelector('table.tabela')).toBeNull();
  });

  // --- Fronteira da task: o que a 06b traz NÃO pode aparecer aqui ---

  it('a lista não promete o que ainda não faz: sem "Nova cor", sem "Ações", sem ordenação', () => {
    const el = iniciar([cinza, azul]).nativeElement as HTMLElement;

    expect(el.querySelector('.placa__acao')).toBeNull();
    expect(el.textContent).not.toContain('Nova cor');
    expect(Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).not.toContain(
      'Ações',
    );
    // Sem afordance de ordenação em NENHUM breakpoint (§10 #30e): nem `<th>` clicável, nem select.
    expect(el.querySelector('.tabela__ord')).toBeNull();
    expect(el.querySelector('.tabela-ordenar')).toBeNull();
    expect(el.querySelector('select')).toBeNull();
  });
});

/**
 * Configurações → Cores, AÇÕES (T-M6-06b — SPEC-M6 §3.15, CA-30/CA-40).
 *
 * ⚠️ LEIA JUNTO COM O `describe` ACIMA. O bloco da 06a monta a tela SEM `AuthService` de ADMIN, e
 * por isso continua verde sem uma linha alterada: "Nova cor" e a coluna "Ações" vivem sob
 * `@if (ehAdmin())`. O que aquele caso assere mudou de significado — de "a 06b ainda não chegou"
 * para "quem não é ADMIN não vê ação nenhuma" —, e as duas leituras são verdadeiras e desejadas
 * (o caso "USER não vê ação" abaixo torna isso EXPLÍCITO em vez de acidental).
 */
describe('Configurações → Cores — ações (T-M6-06b, CA-30)', () => {
  let httpMock: HttpTestingController;
  let dialog: jasmine.SpyObj<MatDialog>;
  let snack: jasmine.SpyObj<MatSnackBar>;
  let ehAdmin: WritableSignal<boolean>;
  const BASE = 'http://localhost:8080/api/v1/cores';

  const cinza: Cor = {
    id: 7,
    nome: 'CINZA-ESCURO',
    hex: '#C4326B',
    produtosVinculados: 3,
    criadoEm: '2026-09-11T13:02:11Z',
    atualizadoEm: '2026-09-11T13:02:11Z',
  };
  const azul: Cor = { ...cinza, id: 9, nome: 'AZUL', hex: null, produtosVinculados: 0 };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Cor[]): PaginaResponse<Cor> {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Probe = any;

  beforeEach(() => {
    ehAdmin = signal(true);
    dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    snack = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);

    TestBed.configureTestingModule({
      imports: [Cores],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        CoresService,
        { provide: AuthService, useValue: { ehAdmin } },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snack },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function iniciar(conteudo: Cor[] = [cinza, azul]): ComponentFixture<Cores> {
    const fixture = TestBed.createComponent(Cores);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo)));
    fixture.detectChanges();
    return fixture;
  }

  /** Confirmação do diálogo compartilhado: `true` confirma, `false` cancela. */
  function dialogoResponde(confirmado: boolean): void {
    dialog.open.and.returnValue({ afterClosed: () => of(confirmado) } as never);
  }

  // --- A tela fechada: 3 colunas e a ação primária ---

  it('ADMIN vê as TRÊS colunas do §3.15 e o botão "Nova cor"', () => {
    const el = iniciar().nativeElement as HTMLElement;

    expect(Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toEqual([
      'Cor',
      'Produtos vinculados',
      'Ações',
    ]);
    expect(el.querySelector('.placa__acao')?.textContent).toContain('Nova cor');
    // Uma linha, dois alvos nomeados pelo dado (nada de "Editar" solto na árvore de a11y).
    const linha = el.querySelectorAll('tbody tr.cor')[0];
    expect(linha.querySelector('.cor__editar')?.getAttribute('aria-label')).toBe(
      'Editar CINZA-ESCURO',
    );
    expect(linha.querySelector('.cor__excluir')?.getAttribute('title')).toBe('Excluir CINZA-ESCURO');
  });

  it('USER não vê ação nenhuma — nem a coluna, nem o botão (RBAC de UX, FC-07)', () => {
    ehAdmin.set(false);
    const el = iniciar().nativeElement as HTMLElement;

    expect(el.querySelector('.placa__acao')).toBeNull();
    expect(el.querySelector('.cor__editar')).toBeNull();
    expect(Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toEqual([
      'Cor',
      'Produtos vinculados',
    ]);
  });

  // --- Criar e editar ---

  it('"Nova cor" abre o form vazio; o salvo recarrega a lista e anuncia o nome do BACK', () => {
    const fixture = iniciar();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.placa__acao') as HTMLButtonElement).click();
    fixture.detectChanges();

    const form = el.querySelector('app-cor-form');
    expect(form).toBeTruthy();
    expect((fixture.componentInstance as Probe).corEmEdicao()).toBeNull();

    (fixture.componentInstance as Probe).aoSalvar({ ...cinza, id: 11, nome: 'ROSA' });
    fixture.detectChanges();
    // Recarrega do servidor: a lista nunca "adivinha" a nova linha.
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([cinza, azul])));

    expect(snack.open.calls.mostRecent().args[0]).toBe('ROSA entrou na cartela.');
    expect(el.querySelector('app-cor-form')).toBeNull();
  });

  it('"Editar" abre o form com a cor da linha', () => {
    const fixture = iniciar();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.cor__editar') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect((fixture.componentInstance as Probe).corEmEdicao()).toEqual(cinza);
    expect(el.querySelector('app-cor-form')).toBeTruthy();
  });

  // --- Exclusão (§3.15 / R3) ---

  it('excluir confirma no diálogo compartilhado, com o vocabulário de COR', () => {
    dialogoResponde(true);
    const fixture = iniciar();
    ((fixture.nativeElement as HTMLElement).querySelector('.cor__excluir') as HTMLButtonElement)
      .click();

    expect(dialog.open.calls.mostRecent().args[1]?.data).toEqual({
      nome: 'CINZA-ESCURO',
      entidade: 'cor',
      contexto: 'Os produtos que usam esta cor impedem a exclusão.',
    });

    const req = httpMock.expectOne(`${BASE}/7`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([azul])));

    expect(snack.open.calls.mostRecent().args[0]).toBe('CINZA-ESCURO saiu da cartela.');
  });

  it('cancelar no diálogo não chama o DELETE', () => {
    dialogoResponde(false);
    const fixture = iniciar();
    ((fixture.nativeElement as HTMLElement).querySelector('.cor__excluir') as HTMLButtonElement)
      .click();

    expect(dialog.open).toHaveBeenCalledTimes(1);
    httpMock.expectNone(`${BASE}/7`);
  });

  it('409 de cor em uso: exibe a mensagem do back e a linha PERMANECE na lista', () => {
    dialogoResponde(true);
    const fixture = iniciar();
    ((fixture.nativeElement as HTMLElement).querySelector('.cor__excluir') as HTMLButtonElement)
      .click();

    httpMock.expectOne(`${BASE}/7`).flush(
      {
        success: false,
        data: null,
        error: {
          code: 'CONFLICT',
          message: 'Cor em uso por 3 produto(s) — desvincule dos produtos antes de excluir.',
          details: [],
        },
        timestamp: '',
        path: '',
      },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    const [mensagem, , config] = snack.open.calls.mostRecent().args;
    expect(mensagem).toBe('Cor em uso por 3 produto(s) — desvincule dos produtos antes de excluir.');
    expect(config?.duration).toBe(6000);
    // A linha continua lá porque NADA foi recarregado: é o estado real do servidor.
    httpMock.expectNone((r) => r.url === BASE);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr.cor').length,
    ).toBe(2);
  });

  it('409 SEM a contagem na frase: a UI exibe o que veio, sem inventar o número', () => {
    dialogoResponde(true);
    const fixture = iniciar();
    ((fixture.nativeElement as HTMLElement).querySelector('.cor__excluir') as HTMLButtonElement)
      .click();

    httpMock.expectOne(`${BASE}/7`).flush(
      {
        success: false,
        data: null,
        error: {
          code: 'CONFLICT',
          message: 'Cor em uso — desvincule dos produtos antes de excluir.',
          details: [],
        },
        timestamp: '',
        path: '',
      },
      { status: 409, statusText: 'Conflict' },
    );

    expect(snack.open.calls.mostRecent().args[0]).toBe(
      'Cor em uso — desvincule dos produtos antes de excluir.',
    );
  });

  it('falha sem mensagem utilizável cai num texto neutro, nunca num palpite de causa', () => {
    dialogoResponde(true);
    const fixture = iniciar();
    ((fixture.nativeElement as HTMLElement).querySelector('.cor__excluir') as HTMLButtonElement)
      .click();

    httpMock.expectOne(`${BASE}/7`).flush(null, { status: 500, statusText: 'Server Error' });

    expect(snack.open.calls.mostRecent().args[0]).toBe(
      'Não foi possível excluir a cor. Tente novamente.',
    );
  });
});
