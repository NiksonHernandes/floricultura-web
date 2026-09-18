import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';

import { Movimentacoes } from './movimentacoes';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { Movimentacao, PaginaResponse } from '../../core/models/produto.model';

/**
 * T-M7-08 (delta) — **P1 da review: a resposta EM VOO da visão anterior não podia pousar.**
 *
 * `recomecar()` esvaziava o array, mas quem chegava depois **escrevia nele**: a aba "Por produto"
 * aparecia com `<select>` em "Escolha um produto…" e a tabela listando lançamentos de **outros
 * produtos** — exatamente a mentira que o comentário do próprio `recomecar()` promete impedir, numa
 * tela de auditoria ("as linhas são verdadeiras, só que de outra pergunta").
 *
 * **Não é corrida de milissegundos:** o cold start do host grátis é de 30–50 s (`HISTORICO.md`), e a
 * janela é "tocar na aba nova enquanto a página carrega" — o que o dono faz na primeira vez que abre.
 *
 * ⚠️ Arquivo NOVO porque `movimentacoes.extrato.spec.ts` **nasceu no delta anterior e já está
 * rastreado** (§12 #27): o hook o protege inclusive do autor. **Nenhuma liberação pedida.**
 *
 * ⚠️ **Nenhum dos 622 casos anteriores separava os dois mundos** (medido pelo reviewer: com e sem o
 * conserto, 622 SUCCESS). Por isso cada caso daqui assere o **conteúdo** da tela, nunca "não
 * estourou" — uma asserção dessas ficaria verde dos dois lados.
 *
 * Dados FICTÍCIOS (LGPD): nomes de planta.
 */
describe('Movimentacoes — respostas vencidas não pintam a tela (T-M7-08 delta, P1)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/movimentacoes';
  const EXTRATO = 'http://localhost:8080/api/v1/produtos/5/movimentacoes';

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

  /** A resposta da visão GLOBAL: dois produtos diferentes — é o que não pode pousar no extrato. */
  const global: Movimentacao[] = [
    base,
    { ...base, id: 90, produtoId: 9, produtoNome: 'Tulipa Amarela', tipo: 'ENTRADA' },
  ];

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Movimentacao[]): PaginaResponse<Movimentacao> {
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

  function visoes(el: HTMLElement): NodeListOf<HTMLButtonElement> {
    return el.querySelectorAll<HTMLButtonElement>('.visao');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Movimentacoes],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        FornecedoresService, // §12 #31
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('P1: a resposta GLOBAL que pousa depois da troca de visão NÃO pinta o extrato', () => {
    // Carga inicial EM VOO (cold start): a requisição sai e fica pendurada de propósito.
    const fixture: ComponentFixture<Movimentacoes> = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    const emVoo = httpMock.expectOne((r) => r.url === BASE);

    // O operador toca na aba nova enquanto a página ainda carrega.
    const el = fixture.nativeElement as HTMLElement;
    visoes(el)[1].click();
    fixture.detectChanges();

    // ...e SÓ ENTÃO a resposta antiga chega.
    emVoo.flush(envelope(pagina(global)));
    fixture.detectChanges();

    // A tela é a da pergunta NOVA: convite, nenhuma linha, e nada de "Tulipa Amarela".
    expect(el.querySelectorAll('tr.lancamento').length).toBe(0);
    expect(el.querySelector('table.tabela')).toBeNull();
    expect(el.querySelector('.estado--vazio')?.textContent).toContain('Escolha um produto');
    expect(el.textContent).not.toContain('Tulipa Amarela');
  });

  it('P1 (efeito irmão): trocar de visão durante a carga mostra o CONVITE, não o spinner preso', () => {
    const fixture = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    const emVoo = httpMock.expectOne((r) => r.url === BASE);

    const el = fixture.nativeElement as HTMLElement;
    visoes(el)[1].click();
    fixture.detectChanges();

    // ANTES de a resposta antiga chegar: sem produto não há o que carregar, então não há spinner.
    expect(el.querySelector('mat-progress-spinner')).toBeNull();
    expect(el.textContent).not.toContain('Carregando o livro-caixa');
    expect(el.querySelector('.estado--vazio')?.textContent).toContain('Escolha um produto');

    emVoo.flush(envelope(pagina(global))); // o `verify()` do afterEach exige fechar a requisição
  });

  it('P1: a resposta do EXTRATO vencida não pinta a lista global (a corrida do outro lado)', () => {
    const fixture = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base])));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.lancamento__extrato') as HTMLButtonElement).click();
    const extratoEmVoo = httpMock.expectOne((r) => r.url === EXTRATO);

    // Desiste e volta para "Todas" antes de o extrato responder.
    visoes(el)[0].click();
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base])));
    fixture.detectChanges();

    // O extrato atrasado chega DEPOIS: ele não pode reescrever a lista global.
    extratoEmVoo.flush(envelope(pagina([{ ...base, id: 77, quantidadeResultante: 4242 }])));
    fixture.detectChanges();

    expect(el.querySelectorAll('tr.lancamento').length).toBe(1);
    expect(el.querySelector('td[data-rotulo="Saldo"]')!.textContent!.trim()).toBe('88');
    expect(el.textContent).not.toContain('4242');
  });

  it('P1: o ERRO de uma carga vencida não vira banner sobre a visão nova', () => {
    // O `error` precisa da mesma trava que o `next`, e por um motivo próprio: um 500 da lista global
    // pintaria "Não foi possível carregar as movimentações" por cima do convite do extrato — a tela
    // culpando a pergunta NOVA por uma falha da antiga.
    const fixture = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    const emVoo = httpMock.expectOne((r) => r.url === BASE);

    const el = fixture.nativeElement as HTMLElement;
    visoes(el)[1].click();
    fixture.detectChanges();

    emVoo.flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.querySelector('.estado--erro')).toBeNull();
    expect(el.querySelector('.estado--vazio')?.textContent).toContain('Escolha um produto');
  });

  it('o caminho NORMAL segue intacto: a resposta da visão vigente pinta a tela', () => {
    // O outro lado do conserto: descartar o que está vencido não pode virar descartar tudo.
    const fixture = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(global)));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('tr.lancamento').length).toBe(2);
    expect(el.textContent).toContain('Tulipa Amarela');
  });

  it('o caminho NORMAL do extrato segue intacto depois de uma resposta descartada', () => {
    const fixture = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    const emVoo = httpMock.expectOne((r) => r.url === BASE);

    const el = fixture.nativeElement as HTMLElement;
    visoes(el)[1].click();
    fixture.detectChanges();
    emVoo.flush(envelope(pagina(global))); // vencida, descartada

    // Agora o operador escolhe um produto de verdade: ISTO tem de pintar.
    visoes(el)[0].click(); // volta para "Todas" para ter a linha com o gatilho
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base])));
    fixture.detectChanges();

    (el.querySelector('.lancamento__extrato') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.url === EXTRATO).flush(envelope(pagina([base])));
    fixture.detectChanges();

    expect(el.querySelectorAll('tr.lancamento').length).toBe(1);
    expect(el.querySelector('td[data-rotulo="Saldo"]')!.textContent!.trim()).toBe('88');
  });
});
