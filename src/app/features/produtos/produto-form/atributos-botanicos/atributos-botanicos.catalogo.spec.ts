import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { of } from 'rxjs';

import { AtributosBotanicos } from './atributos-botanicos';
import { ProdutoForm } from '../produto-form';
import { ProdutosService } from '../../produtos.service';
import { CoresService } from '../../../configuracoes/cores/cores.service';
import { environment } from '../../../../../environments/environment';
import { Cor } from '../../../../core/models/cor.model';
import { Produto, ProdutoRequest } from '../../../../core/models/produto.model';

/**
 * T-M6.1-05 — catálogo de cores do formulário (SPEC-M6.1 §3.4-a e §3.6; §10 #6 e #7).
 *
 * Duas dívidas, o mesmo catálogo:
 * - **D4a (CA-14/CA-15):** a página do `GET /cores` é UNIÃO com a semente de `p.cores`, nunca
 *   substituição. Acima de 100 cores a página 1 não traz a cor do produto, e substituir a apagaria
 *   das opções — o `PUT` seguinte sairia sem ela (desvínculo silencioso).
 * - **D6 (CA-19/CA-20/CA-21):** catálogo que RESOLVE vazio desliga o box sozinho, em vez de travar o
 *   submit num estado que não é culpa do operador — mas SÓ quando houve resposta HTTP (CA-21).
 *
 * Arquivo NOVO por AD-SQ-147: caso novo não entra em spec herdado. A montagem é a mesma de
 * `atributos-botanicos.spec.ts` (o form REAL, não o filho isolado), porque o que os CAs prometem é o
 * que sai no `POST`/`PUT`.
 */
describe('AtributosBotanicos — catálogo de cores (T-M6.1-05, D4a/D6)', () => {
  let serviceSpy: jasmine.SpyObj<
    Pick<ProdutosService, 'criar' | 'atualizar' | 'movimentar' | 'urlImagem' | 'imagemBlob'>
  >;

  const criado: Produto = {
    id: 7,
    nome: 'Costela-de-adão',
    descricao: null,
    unidadeMedida: 'un',
    estoqueMinimo: 1,
    estoqueAtual: 0,
    preco: null,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-11T10:00:00Z',
    atualizadoEm: '2026-09-11T10:00:00Z',
    temImagem: false,
  };

  /** Produto em edição vinculado à cor 9 — a cor que o cenário "acima de 100" deixa fora da página. */
  const comCorForaDaPagina: Produto = {
    ...criado,
    id: 12,
    cores: [{ id: 9, nome: 'ROSA', hex: null }],
  };

  const minimo = {
    nome: 'Costela-de-adão',
    descricao: '',
    unidadeMedida: 'un' as const,
    estoqueMinimo: 1,
    preco: null,
    imagemUrl: '',
  };

  interface Sinal<T> {
    (): T;
    set(valor: T): void;
  }

  interface FormProbe {
    form: { setValue(v: typeof minimo): void };
    salvar(): void;
  }

  interface BoxProbe {
    boxCores: Sinal<boolean>;
    corIds: { readonly value: number[]; readonly disabled: boolean };
    catalogo(): { id: number; nome: string; hex: string | null }[];
    alternarCores(ligado: boolean): void;
    erros(): Record<string, string>;
  }

  /**
   * Página 1 de um catálogo com 137 cores: 100 itens (o `TAMANHO_MAX` do back — pedir mais devolve
   * 400, R4) com ids 100..199. A cor 9 do produto NÃO está aqui: é exatamente o cenário da D4a.
   */
  function paginaDeCem(extras: Cor[] = []): { success: boolean; data: unknown } {
    const conteudo: Cor[] = [
      ...extras,
      ...Array.from({ length: 100 - extras.length }, (_, i) => ({
        id: 100 + i,
        nome: `COR-${100 + i}`,
        hex: null,
        produtosVinculados: 0,
        criadoEm: '2026-09-11T10:00:00Z',
        atualizadoEm: '2026-09-11T10:00:00Z',
      })),
    ];
    return {
      success: true,
      data: {
        conteudo,
        pagina: 0,
        tamanho: 100,
        totalElementos: 137,
        totalPaginas: 2,
        primeira: true,
        ultima: false,
      },
    };
  }

  function paginaVazia(): { success: boolean; data: unknown } {
    return {
      success: true,
      data: {
        conteudo: [],
        pagina: 0,
        tamanho: 100,
        totalElementos: 0,
        totalPaginas: 0,
        primeira: true,
        ultima: true,
      },
    };
  }

  function montarForm(produto?: Produto): {
    fixture: ComponentFixture<ProdutoForm>;
    form: FormProbe;
    box: BoxProbe;
  } {
    const fixture = TestBed.createComponent(ProdutoForm);
    if (produto) {
      fixture.componentRef.setInput('produto', produto);
    }
    fixture.detectChanges();
    const filho = fixture.debugElement.query(By.directive(AtributosBotanicos));
    return {
      fixture,
      form: fixture.componentInstance as unknown as FormProbe,
      box: filho.componentInstance as unknown as BoxProbe,
    };
  }

  /**
   * Probes SEMPRE escopados ao filho: o `produto-form` tem select e chave PRÓPRIOS antes dele (o de
   * unidade de medida, o box de entrada inicial), e um índice global pegaria o componente errado.
   */
  function botanicos(fixture: ComponentFixture<ProdutoForm>) {
    return fixture.debugElement.query(By.directive(AtributosBotanicos));
  }

  /** Chave do box de cores — a 1ª das 4 DENTRO de `app-atributos-botanicos`. */
  function chaveDeCores(fixture: ComponentFixture<ProdutoForm>): MatSlideToggle {
    return botanicos(fixture).queryAll(By.directive(MatSlideToggle))[0].componentInstance;
  }

  /** Select de cores — o 1º DENTRO do filho (o de unidade de medida é do form-mãe). */
  function selectDeCores(fixture: ComponentFixture<ProdutoForm>): MatSelect {
    return botanicos(fixture).queryAll(By.directive(MatSelect))[0].componentInstance;
  }

  function dicaDeCores(fixture: ComponentFixture<ProdutoForm>): string {
    const dicas: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('app-atributos-botanicos .caixa__dica'),
    );
    return dicas[0].textContent ?? '';
  }

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<
      Pick<ProdutosService, 'criar' | 'atualizar' | 'movimentar' | 'urlImagem' | 'imagemBlob'>
    >('ProdutosService', ['criar', 'atualizar', 'movimentar', 'urlImagem', 'imagemBlob']);
    serviceSpy.criar.and.returnValue(of(criado));
    serviceSpy.atualizar.and.returnValue(of(criado));
    serviceSpy.urlImagem.and.returnValue('http://localhost/imagem');
    serviceSpy.imagemBlob.and.returnValue(of(new Blob()));
    TestBed.configureTestingModule({
      imports: [ProdutoForm],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProdutosService, useValue: serviceSpy },
      ],
    });
  });

  // --- D4a: união, nunca substituição (CA-14/CA-15) ----------------------------------------------

  it('D4a/CA-14: cor vinculada que a página 1 NÃO traz continua no catálogo, na seleção e no PUT', async () => {
    TestBed.configureTestingModule({ providers: [CoresService] });
    const httpMock = TestBed.inject(HttpTestingController);
    const { fixture, box, form } = montarForm(comCorForaDaPagina);

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cores?pagina=0&tamanho=100`);
    req.flush(paginaDeCem()); // 100 de 137 cores, e a 9 não está entre elas
    fixture.detectChanges();

    const ids = box.catalogo().map((c) => c.id);
    expect(ids.length).toBe(101); // as 100 da página + a semeada que ficou de fora
    expect(ids).toContain(9);
    expect(ids.filter((id) => id === 9).length).toBe(1); // sem duplicata
    expect(ids.slice(0, 100)).toEqual(
      Array.from({ length: 100 }, (_, i) => 100 + i), // a ordem canônica do back é preservada
    );
    expect(ids[100]).toBe(9); // a semeada ausente vai ao FIM (R5)
    expect(box.corIds.value).toEqual([9]);

    // Leitura null-safe de propósito: sem a união a lista `.selecao` nem existe, e um TypeError
    // abortaria o caso ANTES das asserções do `PUT` — a prova por mutação precisa chegar ao fim.
    const selecao: HTMLElement | null = fixture.nativeElement.querySelector(
      'app-atributos-botanicos .selecao',
    );
    expect(selecao?.textContent).toContain('ROSA'); // a pastilha da cor "invisível" continua à vista

    // É AQUI que o desvínculo silencioso se consumava: o operador abre o painel e mexe na seleção,
    // e o `mat-select` reescreve o controle **só com o que casou com as opções** — a cor que a
    // página 1 não trouxe evaporaria do `PUT` sem ninguém pedir. Com a união ela está nas opções.
    selectDeCores(fixture).open();
    fixture.detectChanges();
    // O `mat-select` casa valor × opções num MICROTASK; sem esperá-lo o teste clicaria antes de a
    // cor 9 estar marcada no painel e mediria um artefato do harness, não o comportamento real.
    await fixture.whenStable();
    fixture.detectChanges();
    const opcoes: HTMLElement[] = Array.from(document.querySelectorAll('mat-option'));
    expect(opcoes.length).toBe(101); // o painel mostra as 100 da página MAIS a cor 9 do produto
    const opcaoDaPagina = opcoes.find((o) => o.textContent?.includes('COR-100'))!;
    opcaoDaPagina.click(); // o operador marca também a 1ª cor da página (id 100)
    fixture.detectChanges();
    expect(box.corIds.value).toContain(9); // o vínculo antigo sobrevive à edição
    expect(box.corIds.value).toContain(100); // e a cor recém-marcada entrou

    form.form.setValue(minimo);
    form.salvar();
    const enviado = serviceSpy.atualizar.calls.mostRecent().args[1] as ProdutoRequest;
    expect(enviado.corIds).toContain(9); // editar NÃO derruba o vínculo que a página não trouxe
    expect(enviado.corIds).toContain(100);
    httpMock.verify();
  });

  it('D4a/CA-15: cor semeada que a página TRAZ aparece uma única vez (sem duplicar)', () => {
    TestBed.configureTestingModule({ providers: [CoresService] });
    const httpMock = TestBed.inject(HttpTestingController);
    const semeadaNaPagina: Produto = {
      ...criado,
      id: 12,
      cores: [{ id: 4, nome: 'VERDE', hex: '#2E7D32' }],
    };
    const { fixture, box } = montarForm(semeadaNaPagina);

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cores?pagina=0&tamanho=100`);
    req.flush(
      paginaDeCem([
        {
          id: 4,
          nome: 'VERDE',
          hex: '#2E7D32',
          produtosVinculados: 1,
          criadoEm: '2026-09-11T10:00:00Z',
          atualizadoEm: '2026-09-11T10:00:00Z',
        },
      ]),
    );
    fixture.detectChanges();

    expect(box.catalogo().filter((c) => c.id === 4).length).toBe(1);
    expect(box.catalogo().length).toBe(100); // nada foi acrescentado: a página já a continha
    expect(box.catalogo()[0].id).toBe(4); // e ela vem na posição da PÁGINA, não no fim
    expect(box.corIds.value).toEqual([4]);
    httpMock.verify();
  });

  // --- D6: o beco sem saída deixa de existir (CA-19/CA-20/CA-21) ---------------------------------

  it('D6/CA-19: catálogo que responde VAZIO desliga o box, deixa a chave inerte e o submit passa', () => {
    TestBed.configureTestingModule({ providers: [CoresService] });
    const httpMock = TestBed.inject(HttpTestingController);
    const { fixture, box, form } = montarForm();

    box.alternarCores(true);
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cores?pagina=0&tamanho=100`);
    req.flush(paginaVazia());
    fixture.detectChanges();

    expect(box.boxCores()).toBeFalse(); // o vazio é do sistema: o box não prende o operador
    expect(box.corIds.disabled).toBeTrue();
    expect(chaveDeCores(fixture).disabled).toBeTrue();
    expect(dicaDeCores(fixture)).toContain('Nenhuma cor cadastrada em Configurações → Cores.');

    form.form.setValue(minimo);
    form.salvar();

    expect(serviceSpy.criar).toHaveBeenCalled(); // submit NÃO trava
    expect(box.erros()['cores']).toBeUndefined();
    const enviado = serviceSpy.criar.calls.mostRecent().args[0] as ProdutoRequest;
    expect('corIds' in enviado).toBeFalse(); // nada a limpar na criação ⇒ campo omitido
    httpMock.verify();
  });

  it('D6/CA-20: GET /cores que FALHA desliga o box com a dica do erro (estado distinto do vazio)', () => {
    TestBed.configureTestingModule({ providers: [CoresService] });
    const httpMock = TestBed.inject(HttpTestingController);
    const { fixture, box, form } = montarForm();

    box.alternarCores(true);
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cores?pagina=0&tamanho=100`);
    req.flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(box.boxCores()).toBeFalse();
    expect(chaveDeCores(fixture).disabled).toBeTrue();
    expect(dicaDeCores(fixture)).toContain('Não foi possível carregar o catálogo de cores agora.');
    expect(dicaDeCores(fixture)).not.toContain('Nenhuma cor cadastrada'); // R6: não é o mesmo estado

    form.form.setValue(minimo);
    form.salvar();
    expect(serviceSpy.criar).toHaveBeenCalled();
    httpMock.verify();
  });

  it('D6/CA-21: SEM CoresService nada muda — nenhum GET, box segue ligado e o vazio bloqueia', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const { fixture, box, form } = montarForm();

    box.alternarCores(true);
    fixture.detectChanges();
    httpMock.verify(); // inject opcional devolveu null: superfície HTTP zero (anti-burla)

    expect(box.boxCores()).toBeTrue(); // sem resposta HTTP não há "catálogo vazio" provado
    expect(box.corIds.disabled).toBeTrue();

    form.form.setValue(minimo);
    form.salvar();

    expect(serviceSpy.criar).not.toHaveBeenCalled();
    expect(box.erros()['cores']).toBe('Escolha ao menos uma opção ou desligue este item.');
  });
});
