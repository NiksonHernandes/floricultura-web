import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';

import { Movimentacoes } from './movimentacoes';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { Movimentacao, PaginaResponse, Produto } from '../../core/models/produto.model';

/**
 * T-M7-08 — visão "Por produto" (SPEC-M7 §3.6/§3.11-a, CA-42/CA-43/CA-44, §10 #17).
 *
 * Spec NOVO: não toca nenhum herdado (§12 #0 — zero liberação neste marco). O que ele trava é o
 * invariante que o §3.6 comprou ao recusar um endpoint de saldo: **o extrato exibe
 * `quantidadeResultante` GRAVADO, e o navegador não soma nada.**
 *
 * ⚠️ `registerLocaleData(localePt, 'pt-BR')` não é decoração (§12 #30/AD-SQ-178): num
 * `--include` isolado o `registerLocaleData` do `app.config.ts` não entra no bundle e todo
 * `| date: … : 'pt-BR'` estoura com `NG02100`. Sem esta linha, o §10 #17 seria falso-VERMELHO.
 *
 * Dados FICTÍCIOS (LGPD): nomes de planta.
 */
describe('Movimentacoes — visão "Por produto" (T-M7-08, §3.6/§3.11-a)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/movimentacoes';
  const PRODUTOS = 'http://localhost:8080/api/v1/produtos';
  const EXTRATO = `${PRODUTOS}/5/movimentacoes`;

  registerLocaleData(localePt, 'pt-BR');

  const base: Movimentacao = {
    id: 87,
    produtoId: 5,
    produtoNome: 'Rosa Vermelha',
    tipo: 'SAIDA',
    quantidade: 12,
    quantidadeResultante: 88,
    motivo: 'Venda balcão',
    usuarioId: 3,
    usuarioNome: 'Ana',
    criadoEm: '2026-09-03T17:05:00Z',
  };

  /**
   * Duas linhas do MESMO produto, e os números são escolhidos para DISCRIMINAR (§12 #24 aplicada
   * fora da aritmética decimal): saldos gravados `88` e `100`, com quantidades `12` e `12`.
   * Um acumulado ingênuo no navegador (`+=` / `reduce` sobre `quantidade`) exibiria `12` e `24` —
   * com uma linha só, como nas fixtures vizinhas, os dois mundos **coincidiriam** e o caso não teria
   * dente nenhum.
   */
  const extrato: Movimentacao[] = [
    { ...base, id: 90, quantidade: 12, quantidadeResultante: 100, tipo: 'ENTRADA' },
    { ...base, id: 87, quantidade: 12, quantidadeResultante: 88 },
  ];

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina<T>(conteudo: T[]): PaginaResponse<T> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 20,
      totalElementos: conteudo.length,
      totalPaginas: 1,
      primeira: true,
      ultima: true,
    };
  }

  /** Só os campos que a tela lê (id/nome) — o resto do `Produto` não participa do extrato. */
  function produto(id: number, nome: string): Produto {
    return {
      id,
      nome,
      descricao: null,
      unidadeMedida: 'un',
      estoqueMinimo: 0,
      estoqueAtual: 10,
      preco: null,
      imagemUrl: null,
      estoqueBaixo: false,
      ativo: true,
      criadoEm: '2026-09-01T12:00:00Z',
      atualizadoEm: '2026-09-01T12:00:00Z',
      temImagem: false,
    };
  }

  function iniciar(conteudo: Movimentacao[] = [base]): ComponentFixture<Movimentacoes> {
    const fixture = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo)));
    fixture.detectChanges();
    return fixture;
  }

  /** Clica no alternador da visão "Por produto". */
  function porProduto(fixture: ComponentFixture<Movimentacoes>): HTMLElement {
    const el = fixture.nativeElement as HTMLElement;
    const botoes = el.querySelectorAll<HTMLButtonElement>('.visao');
    botoes[1].click();
    fixture.detectChanges();
    return el;
  }

  /** Foca o `<select>` (carga sob demanda) e escolhe o produto de id 5. */
  function escolherProduto5(fixture: ComponentFixture<Movimentacoes>): void {
    const el = fixture.nativeElement as HTMLElement;
    const select = el.querySelector('#extrato-produto') as HTMLSelectElement;
    select.dispatchEvent(new Event('focus'));
    httpMock
      .expectOne((r) => r.url === PRODUTOS)
      .flush(envelope(pagina([produto(5, 'Rosa Vermelha'), produto(9, 'Tulipa Amarela')])));
    fixture.detectChanges();
    select.value = '5';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Movimentacoes],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        // `@Injectable()` SEM `providedIn:'root'` (§12 #31): a tela pode montar o painel de filtros,
        // e sem esta linha o primeiro erro seria `NullInjectorError` — o caso reprovaria pelo motivo
        // errado, que é pior do que passar.
        FornecedoresService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('CA-41: ativar "Por produto" NÃO dispara requisição nenhuma', () => {
    const fixture = iniciar();
    const el = porProduto(fixture);
    // `httpMock.verify()` no afterEach fecha a perna: nem catálogo, nem extrato, nem nada.
    expect(el.querySelectorAll('.visao')[1].getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('#extrato-produto')).toBeTruthy();
  });

  it('CA-44: sem produto escolhido, a tela CONVIDA — e não finge extrato vazio', () => {
    const el = porProduto(iniciar());
    expect(el.querySelector('.estado--vazio')?.textContent).toContain('Escolha um produto');
    expect(el.querySelector('table.tabela')).toBeNull();
  });

  it('CA-42: o catálogo do select só é buscado NO FOCO, e uma vez só', () => {
    const fixture = iniciar();
    const el = porProduto(fixture);
    const select = el.querySelector('#extrato-produto') as HTMLSelectElement;

    select.dispatchEvent(new Event('focus'));
    httpMock.expectOne((r) => r.url === PRODUTOS).flush(envelope(pagina([produto(5, 'Rosa Vermelha')])));
    fixture.detectChanges();

    select.dispatchEvent(new Event('focus')); // 2º foco não repete a viagem
    expect(el.querySelectorAll('#extrato-produto option').length).toBe(2); // convite + 1 produto
  });

  it('CA-42: escolher o produto chama GET /produtos/{id}/movimentacoes — e só então', () => {
    const fixture = iniciar();
    porProduto(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const select = el.querySelector('#extrato-produto') as HTMLSelectElement;

    select.dispatchEvent(new Event('focus'));
    httpMock.expectOne((r) => r.url === PRODUTOS).flush(envelope(pagina([produto(5, 'Rosa Vermelha')])));
    fixture.detectChanges();
    httpMock.expectNone((r) => r.url === EXTRATO); // ainda ninguém escolheu

    select.value = '5';
    select.dispatchEvent(new Event('change'));
    const req = httpMock.expectOne((r) => r.url === EXTRATO);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('pagina')).toBe('0');
    req.flush(envelope(pagina(extrato)));
    fixture.detectChanges();
    expect(el.querySelectorAll('tr.lancamento').length).toBe(2);
  });

  it('CA-42: a coluna Saldo exibe o `quantidadeResultante` de CADA linha — sem soma no navegador', () => {
    const fixture = iniciar();
    porProduto(fixture);
    escolherProduto5(fixture);
    httpMock.expectOne((r) => r.url === EXTRATO).flush(envelope(pagina(extrato)));
    fixture.detectChanges();

    const saldos = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('td[data-rotulo="Saldo"]'),
    ).map((td) => td.textContent!.trim());
    // GRAVADO pelo back, linha a linha (§3.6). Um acumulado local daria ['12','24'].
    expect(saldos).toEqual(['100', '88']);
  });

  it('CA-44: produto sem movimentações → vazio honesto, sem tabela fantasma', () => {
    const fixture = iniciar();
    porProduto(fixture);
    escolherProduto5(fixture);
    httpMock.expectOne((r) => r.url === EXTRATO).flush(envelope(pagina<Movimentacao>([])));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('table.tabela')).toBeNull();
    expect(el.querySelector('thead')).toBeNull(); // nem cabeçalho órfão
    expect(el.querySelector('.estado--vazio')?.textContent).toContain(
      'Este produto ainda não tem movimentações',
    );
  });

  it('CA-43: clicar no nome do produto abre o extrato DAQUELE produto, sem recarregar a página', () => {
    const fixture = iniciar();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.lancamento__extrato') as HTMLButtonElement).click();

    const req = httpMock.expectOne((r) => r.url === EXTRATO);
    req.flush(envelope(pagina(extrato)));
    fixture.detectChanges();

    expect(el.querySelectorAll('.visao')[1].getAttribute('aria-pressed')).toBe('true');
    // O `<select>` mostra o produto aberto mesmo sem catálogo carregado (`opcoes()` do filho).
    const select = el.querySelector('#extrato-produto') as HTMLSelectElement;
    expect(select.value).toBe('5');
    expect(select.selectedOptions[0].textContent!.trim()).toBe('Rosa Vermelha');
  });

  it('CA-43 (o outro lado): linha órfã de produto excluído NÃO oferece o clique', () => {
    // Produto hard-deletado (FC-08): não há extrato a abrir, e um botão que só pode falhar é
    // promessa falsa. O nome (snapshot) continua na tela.
    const el = iniciar([{ ...base, produtoId: null }]).nativeElement as HTMLElement;
    expect(el.querySelector('.lancamento__extrato')).toBeNull();
    expect(el.querySelector('.lancamento__produto')!.textContent).toContain('Rosa Vermelha');
  });

  it('no extrato, o nome do produto NÃO é gatilho (não há para onde ir)', () => {
    const fixture = iniciar();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.lancamento__extrato') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.url === EXTRATO).flush(envelope(pagina(extrato)));
    fixture.detectChanges();
    expect(el.querySelector('.lancamento__extrato')).toBeNull();
  });

  it('§3.6: busca `q` e painel de filtros somem no extrato — o endpoint não os aceita', () => {
    const fixture = iniciar();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.busca')).toBeTruthy();
    expect(el.querySelector('.controles__filtros')).toBeTruthy();

    porProduto(fixture);
    expect(el.querySelector('.busca')).toBeNull();
    expect(el.querySelector('.controles__filtros')).toBeNull();
  });

  it('voltar para "Todas" DEPOIS de um extrato pede a lista global de novo, não o extrato', () => {
    // O caminho realista: abre o extrato pelo nome, volta para "Todas". Quem manda na fonte é a
    // VISÃO, não o produto que ficou guardado — senão a volta continuaria puxando o extrato.
    const fixture = iniciar();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.lancamento__extrato') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.url === EXTRATO).flush(envelope(pagina(extrato)));
    fixture.detectChanges();

    el.querySelectorAll<HTMLButtonElement>('.visao')[0].click();
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base])));
    fixture.detectChanges();

    expect(el.querySelector('.busca')).toBeTruthy();
    expect(el.querySelectorAll('tr.lancamento').length).toBe(1);
  });

  it('a paginação do extrato pede a página NOVA do mesmo produto (0-based)', () => {
    const fixture = iniciar();
    porProduto(fixture);
    escolherProduto5(fixture);
    httpMock.expectOne((r) => r.url === EXTRATO).flush(envelope(pagina(extrato)));
    fixture.detectChanges();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).aoPaginar({ pageIndex: 2, pageSize: 40 });
    const req = httpMock.expectOne(
      (r) => r.url === EXTRATO && r.params.get('pagina') === '2' && r.params.get('tamanho') === '40',
    );
    expect(req.request.method).toBe('GET'); // expectativa explícita: `expectOne` não conta p/ o Jasmine
    req.flush(envelope(pagina<Movimentacao>([])));
  });
});
