import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { Produtos } from './produtos';
import { FiltrosProdutos } from './filtros-produtos/filtros-produtos';
import { CoresService } from '../configuracoes/cores/cores.service';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse, Produto } from '../../core/models/produto.model';
import { Cor } from '../../core/models/cor.model';

/**
 * T-M6-11 — a lista traduz a barra em UMA `GET /produtos` com os params do §3.6 (CA-36; §10 #29).
 *
 * Montagem igual à dos specs herdados (M2/M3), com UM acréscimo: `CoresService` é provido para
 * provar que a lista-mãe carrega o catálogo do filtro de cor. `EventosService` segue de fora — sem
 * ele o `<app-proximos-eventos>` fica inerte e nenhum GET de evento sai (anti-burla).
 */
describe('Produtos — barra de filtros → GET /produtos (T-M6-11, CA-36)', () => {
  let httpMock: HttpTestingController;
  let fixture: ComponentFixture<Produtos>;
  /** URL da PRIMEIRA carga (barra zerada) — o anti-regressão da URL do M2. */
  let urlInicial: string;

  const BASE = 'http://localhost:8080/api/v1/produtos';
  const CORES = 'http://localhost:8080/api/v1/cores';

  const rosa: Produto = {
    id: 1,
    nome: 'Rosa Vermelha',
    descricao: null,
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 25,
    preco: 4.5,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-11T10:00:00Z',
    atualizadoEm: '2026-09-11T10:00:00Z',
    temImagem: false,
  };

  const cor: Cor = {
    id: 3,
    nome: 'ROSA',
    hex: '#C4326B',
    produtosVinculados: 1,
    criadoEm: '',
    atualizadoEm: '',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina<T>(conteudo: T[], total = conteudo.length): PaginaResponse<T> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 12,
      totalElementos: total,
      totalPaginas: 1,
      primeira: true,
      ultima: true,
    };
  }

  /** Controles da barra, acessados pelo componente filho de verdade (não por stub). */
  interface Controle<T> {
    setValue(v: T): void;
  }
  interface BarraProbe {
    form: {
      controls: {
        corIds: Controle<number[]>;
        eventoIds: Controle<number[]>;
        caracteristica: Controle<string[]>;
        toxicidade: Controle<string[]>;
        luz: Controle<string[]>;
        estoque: Controle<string | null>;
        precoMin: Controle<number | null>;
        precoMax: Controle<number | null>;
        semPreco: Controle<boolean>;
        ordem: Controle<string>;
      };
    };
    limpar(): void;
  }

  beforeEach(() => {
    const dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
    TestBed.configureTestingModule({
      imports: [Produtos],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { ehAdmin: signal(true) } },
        { provide: MatDialog, useValue: dialog },
        CoresService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Produtos);
    fixture.detectChanges();
    const inicial = httpMock.expectOne((r) => r.url === BASE);
    urlInicial = inicial.request.urlWithParams;
    inicial.flush(envelope(pagina([rosa])));
    httpMock.expectOne((r) => r.url === CORES).flush(envelope(pagina([cor])));
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function barra(): BarraProbe {
    return fixture.debugElement.query(By.directive(FiltrosProdutos))
      .componentInstance as unknown as BarraProbe;
  }

  it('carrega o catálogo de cores e o repassa para a barra (GET /cores?tamanho=100)', () => {
    const opcoes = (fixture.debugElement.query(By.directive(FiltrosProdutos)).componentInstance as {
      cores(): Cor[];
    }).cores();
    expect(opcoes).toEqual([cor]);
  });

  it('manda os multivalorados REPETIDOS (?corIds=3&corIds=7), nunca CSV', fakeAsync(() => {
    barra().form.controls.corIds.setValue([3, 7]);
    tick(300);

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.getAll('corIds')).toEqual(['3', '7']);
    expect(req.request.urlWithParams).toContain('corIds=3&corIds=7');
    req.flush(envelope(pagina([rosa])));
  }));

  it('manda os enums em CAIXA EXATA (BAIXO, MUDA, TOXICA, SOL_PLENO) — §3.6/AD-SQ-127', fakeAsync(() => {
    const c = barra().form.controls;
    c.estoque.setValue('BAIXO');
    c.caracteristica.setValue(['MUDA']);
    c.toxicidade.setValue(['TOXICA']);
    c.luz.setValue(['SOL_PLENO', 'SOMBRA']);
    c.eventoIds.setValue([5]);
    tick(300);

    const req = httpMock.expectOne((r) => r.url === BASE);
    const p = req.request.params;
    expect(p.get('estoque')).toBe('BAIXO');
    expect(p.getAll('caracteristica')).toEqual(['MUDA']);
    expect(p.getAll('toxicidade')).toEqual(['TOXICA']);
    expect(p.getAll('luz')).toEqual(['SOL_PLENO', 'SOMBRA']);
    expect(p.getAll('eventoIds')).toEqual(['5']);
    req.flush(envelope(pagina([rosa])));
  }));

  it('faz UMA requisição quando dois controles mudam no mesmo gesto, com pagina=0', fakeAsync(() => {
    // Vai para a 2ª página primeiro: mudar filtro TEM de voltar para a 1ª (senão cai em página vazia).
    (fixture.componentInstance as unknown as { aoPaginar(e: { pageIndex: number; pageSize: number }): void }).aoPaginar(
      { pageIndex: 1, pageSize: 12 },
    );
    httpMock.expectOne((r) => r.url === BASE && r.params.get('pagina') === '1').flush(
      envelope(pagina([rosa])),
    );

    barra().form.controls.estoque.setValue('COM_ESTOQUE');
    barra().form.controls.precoMax.setValue(50);
    tick(300);

    // `expectOne` já reprova se tivessem saído duas.
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('pagina')).toBe('0');
    expect(req.request.params.get('estoque')).toBe('COM_ESTOQUE');
    expect(req.request.params.get('precoMax')).toBe('50');
    req.flush(envelope(pagina([rosa])));
  }));

  it('a faixa de preço é inclusiva nos dois limites e viaja como precoMin/precoMax', fakeAsync(() => {
    barra().form.controls.precoMin.setValue(10);
    barra().form.controls.precoMax.setValue(49.9);
    tick(300);

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('precoMin')).toBe('10');
    expect(req.request.params.get('precoMax')).toBe('49.9');
    expect(req.request.params.has('semPreco')).toBeFalse();
    req.flush(envelope(pagina([rosa])));
  }));

  it('"somente sem preço" manda semPreco=true SEM a faixa (o par junto é 400 no back)', fakeAsync(() => {
    barra().form.controls.precoMin.setValue(10);
    tick(300);
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([rosa])));

    barra().form.controls.semPreco.setValue(true);
    tick(300);
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('semPreco')).toBe('true');
    expect(req.request.params.has('precoMin')).toBeFalse();
    expect(req.request.params.has('precoMax')).toBeFalse();
    req.flush(envelope(pagina([rosa])));
  }));

  it('NÃO manda ordenarPor/direcao no default, e manda quando o operador escolhe', fakeAsync(() => {
    barra().form.controls.luz.setValue(['SOMBRA']);
    tick(300);
    const padrao = httpMock.expectOne((r) => r.url === BASE);
    expect(padrao.request.params.has('ordenarPor')).toBeFalse();
    expect(padrao.request.params.has('direcao')).toBeFalse();
    padrao.flush(envelope(pagina([rosa])));

    barra().form.controls.ordem.setValue('preco-desc');
    tick(300);
    const escolhido = httpMock.expectOne((r) => r.url === BASE);
    expect(escolhido.request.params.get('ordenarPor')).toBe('preco');
    expect(escolhido.request.params.get('direcao')).toBe('desc');
    escolhido.flush(envelope(pagina([rosa])));
  }));

  it('sem filtro nenhum a URL fica IGUAL à do M2 (só pagina/tamanho) — anti-regressão', () => {
    // Barra zerada não acrescenta UM byte à URL: nem `ordenarPor=nome`, nem `semPreco=false`.
    expect(urlInicial).toBe(`${BASE}?pagina=0&tamanho=12`);
  });

  it('sem resultado mostra "Nenhum produto com esses filtros." com botão de limpar (CA-36)', fakeAsync(() => {
    barra().form.controls.estoque.setValue('SEM_ESTOQUE');
    tick(300);
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina<Produto>([])));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Nenhum produto com esses filtros.');

    const limpar = Array.from(el.querySelectorAll('.estado--vazio button')).find((b) =>
      (b.textContent ?? '').includes('Limpar filtros'),
    ) as HTMLButtonElement;
    expect(limpar).toBeTruthy();

    limpar.click();
    const semFiltro = httpMock.expectOne((r) => r.url === BASE);
    expect(semFiltro.request.params.has('estoque')).toBeFalse();
    semFiltro.flush(envelope(pagina([rosa])));
    fixture.detectChanges();
    tick(300); // a barra sincroniza pelo `valor` e NÃO reemite (nenhum request pendente no verify)
  }));

  /**
   * §10 #29 / armadilha §12 #39 (AD-SQ-139). O "Limpar filtros" do estado-vazio escreve a barra POR
   * FORA (`valor` → `setValue(..., { emitEvent: false })`). Se o filtro de reemissão comparasse
   * contra a ÚLTIMA EMISSÃO, reescolher o MESMO valor depois disso não emitiria nada: atalho com
   * `aria-pressed="true"`, zero requisição, zero pastilha e nenhum erro — a tela inerte do §12 #19.
   * Medido no estado reprovado de `7753360`: `requisicoes=0 pastilhas=0`. Tudo por componente real e
   * clique de verdade — o caso do `input valor` prova AUSÊNCIA de emissão e nunca pegaria isto.
   */
  it('reaplicar o MESMO filtro depois do "Limpar filtros" do estado-vazio volta a chamar o back', fakeAsync(() => {
    const el = fixture.nativeElement as HTMLElement;
    const atalhoBaixo = () =>
      Array.from(el.querySelectorAll('.atalho')).find((b) =>
        (b.textContent ?? '').includes('Estoque baixo'),
      ) as HTMLButtonElement;
    const pastilhas = () => el.querySelectorAll('.pastilha').length;

    // 1) estoque=BAIXO pelo atalho de verdade → página vazia.
    atalhoBaixo().click();
    tick(300);
    const comFiltro = httpMock.expectOne((r) => r.url === BASE);
    expect(comFiltro.request.params.get('estoque')).toBe('BAIXO');
    comFiltro.flush(envelope(pagina<Produto>([])));
    fixture.detectChanges();
    expect(pastilhas()).toBe(1);

    // 2) "Limpar filtros" do estado-vazio: a barra é reescrita POR FORA, sem emitir.
    (Array.from(el.querySelectorAll('.estado--vazio button')).find((b) =>
      (b.textContent ?? '').includes('Limpar filtros'),
    ) as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.url === BASE && !r.params.has('estoque')).flush(
      envelope(pagina([rosa])),
    );
    fixture.detectChanges();
    tick(300);
    expect(pastilhas()).toBe(0);

    // 3) o operador escolhe BAIXO DE NOVO — tem de sair 1 GET e a pastilha reaparecer.
    atalhoBaixo().click();
    tick(300);
    fixture.detectChanges();
    const reaplicado = httpMock.match((r) => r.url === BASE);
    expect(reaplicado.length).toBe(1);
    expect(reaplicado[0].request.params.get('estoque')).toBe('BAIXO');
    expect(reaplicado[0].request.params.get('pagina')).toBe('0');
    expect(pastilhas()).toBe(1);
    expect(atalhoBaixo().getAttribute('aria-pressed')).toBe('true');
    reaplicado[0].flush(envelope(pagina([rosa])));
  }));

  it('400 do §3.6 exibe a mensagem que veio no details[], uma por campo', fakeAsync(() => {
    barra().form.controls.precoMin.setValue(90);
    barra().form.controls.precoMax.setValue(10);
    tick(300);

    httpMock.expectOne((r) => r.url === BASE).flush(
      {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Requisição inválida.',
          details: [{ field: 'precoMin', message: 'precoMin não pode ser maior que precoMax.' }],
        },
        timestamp: '',
        path: '',
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('precoMin não pode ser maior que precoMax.');
  }));
  it('cancela a busca anterior quando os filtros mudam durante a resposta', fakeAsync(() => {
    barra().form.controls.estoque.setValue('BAIXO');
    tick(300);
    const antiga = httpMock.expectOne(r => r.url === BASE);
    barra().form.controls.estoque.setValue('COM_ESTOQUE');
    tick(300);
    expect(antiga.cancelled).toBeTrue();
    const atual = httpMock.expectOne(r => r.url === BASE);
    expect(atual.request.params.get('estoque')).toBe('COM_ESTOQUE');
    atual.flush(envelope(pagina([rosa])));
  }));

});
