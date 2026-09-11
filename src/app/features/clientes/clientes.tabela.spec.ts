import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { Clientes } from './clientes';
import { ClientesService } from './clientes.service';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse } from '../../core/models/produto.model';
import { Cliente } from '../../core/models/cliente.model';

/**
 * Clientes em TABELA (T-M6-08b — ajuste 8 do dono; SPEC-M6 §3.11, CA-31/CA-37).
 *
 * Arquivo NOVO: `clientes.spec.ts` (M5) segue intocado e continua verde — é ele que prova que os
 * hooks herdados sobreviveram ao redesenho. Aqui trava-se o que a tabela ADICIONA: as 5 colunas,
 * os dois filtros tri-estado virando params do back (§3.7), a ordenação por cabeçalho com
 * `aria-sort` e `pagina=0`, e a marcação do clamp de observações.
 *
 * Dados FICTÍCIOS (LGPD): "Maria Flores"/"Joana Raiz", `@exemplo.com.br`, `(11) 90000-0000`.
 */
describe('Clientes em tabela (T-M6-08b, CA-31)', () => {
  let httpMock: HttpTestingController;
  let ehAdmin: WritableSignal<boolean>;
  const BASE = 'http://localhost:8080/api/v1/clientes';

  const maria: Cliente = {
    id: 7,
    nome: 'Maria Flores',
    telefone: '(11) 90000-0000',
    email: 'maria@exemplo.com.br',
    observacoes: 'Prefere arranjos de outono.',
    produtoIds: null,
    criadoEm: '2026-09-04T14:05:00Z',
    atualizadoEm: '2026-09-04T14:05:00Z',
  };

  const semContato: Cliente = {
    ...maria,
    id: 9,
    nome: 'Joana Raiz',
    telefone: null,
    email: null,
    observacoes: null,
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Cliente[]): PaginaResponse<Cliente> {
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

  function iniciar(conteudo: Cliente[] = [maria]): ComponentFixture<Clientes> {
    const fixture = TestBed.createComponent(Clientes);
    fixture.detectChanges(); // ngOnInit → carregar()
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo)));
    fixture.detectChanges();
    return fixture;
  }

  /** O `<th>` da coluna (o texto do ordenado carrega junto a ligadura do mat-icon). */
  function thDe(fixture: ComponentFixture<Clientes>, rotulo: string): HTMLElement {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('thead th')).find(
      (el) => el.textContent?.trim().startsWith(rotulo),
    ) as HTMLElement;
  }

  /** Clica no botão de ordenação da coluna. */
  function ordenarPor(fixture: ComponentFixture<Clientes>, rotulo: string): void {
    (thDe(fixture, rotulo).querySelector('.tabela__ord') as HTMLButtonElement).click();
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

  it('uma linha por cliente, com rótulo por célula para o celular (data-rotulo)', () => {
    const el = iniciar([maria, semContato]).nativeElement as HTMLElement;
    const linhas = el.querySelectorAll('tbody tr.ficha');
    expect(linhas.length).toBe(2);

    const celulas = linhas[0].querySelectorAll('td');
    expect(celulas.length).toBe(5);
    expect(celulas[0].textContent).toContain('Maria Flores');
    expect(celulas[1].getAttribute('data-rotulo')).toBe('Telefone');
    expect(celulas[1].textContent).toContain('(11) 90000-0000');
    expect(celulas[2].getAttribute('data-rotulo')).toBe('E-mail');
    expect(celulas[2].textContent).toContain('maria@exemplo.com.br');
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
    expect(obs.getAttribute('title')).toBe(maria.observacoes!); // texto completo no title
  });

  // --- Filtros tri-estado → params do back (§3.7): 4 casos REMOVIDOS na T-M6-A2 ---
  //
  // O dono REVOGOU o comportamento por escrito ("Remova os filtros de clientes e fornecedores,
  // deixe somente a busca por nome") — CA-31 (cláusula dos filtros) e AD-SQ-107. Os controles não
  // existem mais, então os casos "Telefone: Com", "E-mail: Sem", "voltar para Todos" e "vazio SOB
  // FILTRO" testavam DOM inexistente. Removidos inteiros (nada de `xit`, que só deixa código
  // morto), com autorização humana registrada em `squad/.permitir-edicao-teste` (AD-SQ-109).
  // O que ficou coberto no lugar: `features/contatos-consulta.service.spec.ts` (CA-44), que prova
  // o mapeamento dos 2 params direto no serviço — a capacidade do §3.7 segue viva e testada.

  // --- Ordenação pelo cabeçalho (§3.11) ---

  it('a lista nasce ordenada por nome asc e anuncia isso em aria-sort', () => {
    const fixture = TestBed.createComponent(Clientes);
    fixture.detectChanges();
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('ordenarPor')).toBe('nome');
    expect(req.request.params.get('direcao')).toBe('asc');
    req.flush(envelope(pagina([maria])));
    fixture.detectChanges();

    expect(thDe(fixture, 'Nome').getAttribute('aria-sort')).toBe('ascending');
    expect(thDe(fixture, 'Telefone').getAttribute('aria-sort')).toBe('none');
  });

  it('clicar em "Nome" inverte a direção, recarrega do back e volta para pagina=0', () => {
    const fixture = iniciar();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).aoPaginar({ pageIndex: 2, pageSize: 12 });
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([maria])));
    fixture.detectChanges();

    ordenarPor(fixture, 'Nome');

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('ordenarPor')).toBe('nome');
    expect(req.request.params.get('direcao')).toBe('desc');
    expect(req.request.params.get('pagina')).toBe('0');
    req.flush(envelope(pagina([maria])));
    fixture.detectChanges();
    expect(thDe(fixture, 'Nome').getAttribute('aria-sort')).toBe('descending');
  });

  it('clicar numa coluna nova começa em asc e move o aria-sort de coluna', () => {
    const fixture = iniciar();
    ordenarPor(fixture, 'Telefone');

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('ordenarPor')).toBe('telefone');
    expect(req.request.params.get('direcao')).toBe('asc');
    req.flush(envelope(pagina([maria])));
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
    expect(el.querySelector('.ficha__monograma')?.textContent?.trim()).toBe('M');
  });

  // --- Layout do print + ação única (T-M6-A2, §3.11.2 / CA-45 / CA-46) ---

  it('a tabela vive dentro do cartão e cada linha tem UM gatilho, com os 2 hooks fechados dentro', () => {
    const el = iniciar([maria, semContato]).nativeElement as HTMLElement;

    // CA-45: o cartão branco do print é o pai direto da tabela.
    expect(el.querySelector('.tabela-cartao > table.tabela')).toBeTruthy();

    // CA-46: um único gatilho visível por linha, rotulado para o leitor de tela.
    const gatilhos = el.querySelectorAll('tbody .ficha__mais > summary');
    expect(gatilhos.length).toBe(2);
    expect(gatilhos[0].getAttribute('aria-label')).toBe('Ações de Maria Flores');
    expect(gatilhos[0].querySelector('mat-icon')?.textContent?.trim()).toBe('menu');

    // ...e Editar/Excluir seguem no DOM com o <details> FECHADO, agora rotulados por extenso.
    const expansor = el.querySelector('tbody .ficha__mais') as HTMLDetailsElement;
    expect(expansor.open).toBeFalse();
    expect(expansor.querySelector('.ficha__editar')?.textContent).toContain('Editar');
    expect(expansor.querySelector('.ficha__excluir')?.textContent).toContain('Excluir');
  });

  // --- O menu aberto não pode ser recortado (§10 #45 / AD-SQ-112, CA-46) ---

  /**
   * Abre o menu de UMA linha e mede se o "Excluir" recebe o clique de verdade.
   *
   * O defeito que este caso trava não é de marcação, é de pintura: o `.tabela-cartao` tinha
   * `overflow: hidden` e clipava o `.ficha__mais__lista`, que é `position: absolute` dentro dele.
   * Nenhum `querySelector` percebe isso — o botão continua no DOM, só que ninguém consegue clicar.
   */
  function medirMenuDe(el: HTMLElement, indice: number) {
    const detalhes = Array.from(el.querySelectorAll('.ficha__mais')) as HTMLDetailsElement[];
    // Um menu por vez: o `<details>` aberto de outra linha (`z-index: 5`) cobriria o alvo.
    detalhes.forEach((d) => (d.open = false));
    const alvo = detalhes[indice];
    alvo.open = true;

    const cartao = el.querySelector('.tabela-cartao') as HTMLElement;
    const excluir = alvo.querySelector('.ficha__excluir') as HTMLElement;

    // A janela do Karma é pequena: sem rolar a PÁGINA (o que o usuário faz) a última linha cai fora
    // da viewport e o `elementFromPoint` devolveria `null` por motivo alheio ao recorte.
    (alvo.querySelector('.ficha__mais__gatilho') as HTMLElement).scrollIntoView({ block: 'center' });
    // ⚠️ Obrigatório, e DEPOIS do `scrollIntoView` (§10 #45 exige `cartao.scrollTop === 0`): com
    // `overflow: hidden` o cartão vira contêiner de rolagem e o próprio `scrollIntoView` o rolaria
    // por dentro, trazendo o menu de volta para o campo visível e MASCARANDO o bug.
    cartao.scrollTop = 0;

    const re = excluir.getBoundingClientRect();
    const x = Math.round(re.left + re.width / 2);

    // Alvo EFETIVO: varre o botão de cima a baixo e conta os pixels em que o clique chega NELE. Com
    // o cartão recortando, os pixels de fora pertencem a quem está por baixo (o paginador) — é
    // assim que "44px de altura" viram "0px clicáveis" sem que a geometria do botão mude.
    let clicaveis = 0;
    for (let y = Math.ceil(re.top) + 1; y < Math.floor(re.bottom); y++) {
      const px = document.elementFromPoint(x, y);
      if (px && excluir.contains(px)) clicaveis++;
    }
    const centro = document.elementFromPoint(x, Math.round(re.top + re.height / 2));

    return {
      clicaveis,
      cliqueChegaNoBotao: !!centro && excluir.contains(centro),
      quemRecebeOClique: centro ? `${centro.tagName}.${(centro as HTMLElement).className}` : 'null',
    };
  }

  it('o menu da última linha não é recortado: o clique no "Excluir" chega ao próprio botão', () => {
    // ≥3 registros porque o defeito só aparece no FIM da página, onde o menu passa do cartão.
    const cinco: Cliente[] = [1, 2, 3, 4, 5].map((i) => ({
      ...maria,
      id: i,
      nome: `Contato Fictício ${i}`,
    }));
    const el = iniciar(cinco).nativeElement as HTMLElement;

    // Precondição: a janela do Karma tem de estar no layout de tabela (>= $bp-sm, 640px). Abaixo
    // disso o cartão do print nem existe e o caso passaria à toa.
    expect(getComputedStyle(el.querySelector('table.tabela')!).display).toBe('table');

    const ultima = medirMenuDe(el, 4);
    const penultima = medirMenuDe(el, 3);

    // ⚠️ O critério NÃO é geométrico. Com o recorte fora, o menu transborda o cartão de propósito
    // (~87px, medido) e fica VISÍVEL e clicável por cima do que vier abaixo — cobrar
    // `lista.bottom <= cartao.bottom` seria reprovar a própria correção. Quem discrimina é o
    // `elementFromPoint`: no estado reprovado (`e34b8af`) o centro do "Excluir" da última linha
    // devolvia o `mat-mdc-paginator-navigation-previous`, ou seja, o clique virava "página anterior".
    expect(ultima.cliqueChegaNoBotao)
      .withContext(`última linha, clique recebido por: ${ultima.quemRecebeOClique}`)
      .toBeTrue();
    // Piso do FC-02 é 44px de alvo; recortado sobravam 0px na última e 32px na penúltima.
    expect(ultima.clicaveis).toBeGreaterThanOrEqual(40);
    expect(penultima.cliqueChegaNoBotao)
      .withContext(`penúltima linha, clique recebido por: ${penultima.quemRecebeOClique}`)
      .toBeTrue();
    expect(penultima.clicaveis).toBeGreaterThanOrEqual(40);
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
