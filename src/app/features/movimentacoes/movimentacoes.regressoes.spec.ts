import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DateAdapter, MAT_DATE_FORMATS, provideNativeDateAdapter } from '@angular/material/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';

import { Movimentacoes } from './movimentacoes';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { PT_BR_DATE_FORMATS, PtBrDateAdapter } from '../../core/date/pt-br-date-adapter';
import { ApiResponse } from '../../core/models/api-response.model';
import { Movimentacao, PaginaResponse } from '../../core/models/produto.model';

/**
 * T-M7-07 — REGRESSÕES P1-1 e P1-2 (review `REVIEW-M7-T-M7-07.md`).
 *
 * Arquivo NOVO por obrigação estrutural, não por gosto: `movimentacoes.filtros.spec.ts` e
 * `movimentacoes.tabela.spec.ts` já estão **rastreados**, e o hook anti-burla bloqueia teste
 * rastreado inclusive para quem o criou (§12 #27). Nenhuma liberação foi pedida — a que existe é
 * de arquivos do back e não cobre nada daqui.
 *
 * Os dois defeitos só apareciam em RUNTIME e em PIXEL, que é por que nenhum caso anterior os pegou:
 *   P1-1 — `input()` de signal só é preenchido DEPOIS da instanciação, então ler `this.valor()` no
 *          construtor devolve o default. Como o pai monta o painel por `@if`, nasce instância nova a
 *          cada abertura e a reidratação nunca acontecia.
 *   P1-2 — o mixin faz `td { display: flex }` no celular; o `<p>` do motivo virava item da MESMA
 *          fileira do nome do produto, e não a linha de baixo que o §3.11-b manda.
 *
 * Dados FICTÍCIOS (LGPD): nomes de planta.
 */
describe('Movimentacoes — regressões P1 da review (T-M7-07)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/movimentacoes';

  registerLocaleData(localePt, 'pt-BR');

  const base: Movimentacao = {
    id: 87,
    produtoId: 5,
    produtoNome: 'Rosa Vermelha',
    tipo: 'SAIDA',
    quantidade: 12,
    quantidadeResultante: 88,
    motivo:
      'Venda de balcão para o arranjo de casamento, com troca de duas hastes quebradas no transporte.',
    usuarioId: 3,
    usuarioNome: 'Ana',
    criadoEm: '2026-09-03T17:05:00Z',
  };

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

  function iniciar(): ComponentFixture<Movimentacoes> {
    const fixture = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base])));
    fixture.detectChanges();
    return fixture;
  }

  function abrirPainel(fixture: ComponentFixture<Movimentacoes>): HTMLElement {
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.controles__filtros') as HTMLButtonElement).click();
    // Duas passadas de propósito: a 1ª monta o painel (é quando o `effect()` de reidratação se
    // registra e roda), a 2ª leva o valor que ele escreveu no form até o DOM do `<select>`.
    fixture.detectChanges();
    fixture.detectChanges();
    return el;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Movimentacoes],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: DateAdapter, useClass: PtBrDateAdapter },
        { provide: MAT_DATE_FORMATS, useValue: PT_BR_DATE_FORMATS },
        FornecedoresService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // ---- P1-1: o painel tem de REIDRATAR o recorte vigente ----------------------------------------

  it('P1-1: reabrir o painel mostra o recorte VIGENTE, não um formulário em branco', async () => {
    const fixture = iniciar();
    let el = abrirPainel(fixture);

    const tipo = el.querySelector('#filtro-tipo') as HTMLSelectElement;
    tipo.value = tipo.options[2].value; // SAIDA
    tipo.dispatchEvent(new Event('change'));
    (el.querySelector('.painel__aplicar') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.params.get('tipo') === 'SAIDA').flush(envelope(pagina([base])));
    fixture.detectChanges();

    // Reabre: o painel é uma INSTÂNCIA NOVA (o pai monta por `@if`). Tem de vir preenchido.
    el = abrirPainel(fixture);
    await fixture.whenStable();
    fixture.detectChanges();
    const tipoReaberto = el.querySelector('#filtro-tipo') as HTMLSelectElement;
    expect(tipoReaberto.selectedIndex).toBe(2);
    expect(tipoReaberto.options[tipoReaberto.selectedIndex].textContent).toContain('Saída');
  });

  it('P1-1: "Aplicar" sem tocar em nada PRESERVA o recorte — nunca o apaga em silêncio', () => {
    const fixture = iniciar();
    let el = abrirPainel(fixture);

    const tipo = el.querySelector('#filtro-tipo') as HTMLSelectElement;
    tipo.value = tipo.options[2].value; // SAIDA
    tipo.dispatchEvent(new Event('change'));
    (el.querySelector('.painel__aplicar') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.params.get('tipo') === 'SAIDA').flush(envelope(pagina([base])));
    fixture.detectChanges();

    // Reabrir e aplicar sem mexer: a query tem de continuar com `tipo=SAIDA`, e o contador com (1).
    el = abrirPainel(fixture);
    (el.querySelector('.painel__aplicar') as HTMLButtonElement).click();
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('tipo')).toBe('SAIDA');
    req.flush(envelope(pagina([base])));
    fixture.detectChanges();
    expect(el.querySelector('.controles__filtros')!.textContent).toContain('Filtros (1)');
  });

  it('P1-1 (o outro lado): "Limpar" DE PROPÓSITO continua zerando o recorte', () => {
    // A reidratação não pode virar uma trava que impeça o usuário de limpar — é o risco do conserto.
    const fixture = iniciar();
    let el = abrirPainel(fixture);

    const tipo = el.querySelector('#filtro-tipo') as HTMLSelectElement;
    tipo.value = tipo.options[2].value;
    tipo.dispatchEvent(new Event('change'));
    (el.querySelector('.painel__aplicar') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.params.get('tipo') === 'SAIDA').flush(envelope(pagina([base])));
    fixture.detectChanges();

    el = abrirPainel(fixture);
    (el.querySelector('.painel__limpar') as HTMLButtonElement).click();
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.has('tipo')).toBeFalse();
    req.flush(envelope(pagina([base])));
    fixture.detectChanges();
    expect(el.querySelector('.controles__filtros')!.textContent).toContain('Filtros (0)');
  });

  // ---- P1-2: a 375px o motivo fica ABAIXO do nome, e inteiro ------------------------------------

  /**
   * Mede o layout REAL a 375 px.
   *
   * O Karma roda em viewport de desktop (documentado em `ordenacao-mobile.bateria.spec.ts:212`), e
   * `@media` avalia contra o VIEWPORT — logo, medir o celular no fixture é impossível. A saída é um
   * `<iframe>` de 375 px: dentro dele as media queries do ateliê avaliam como no celular. Copiamos as
   * `<style>` que o Angular injetou (a folha REAL do componente, com os atributos de encapsulamento)
   * e a `<table>` RENDERIZADA — então o que se mede é o produto, não uma réplica.
   */
  function medirCelular(
    tabela: Element,
  ): { larguraNome: number; larguraMotivo: number; offsetLeft: number; topRel: number; truncado: boolean } {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:375px;height:667px;border:0;position:absolute;left:-9999px';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write('<!DOCTYPE html><html><head></head><body></body></html>');
    doc.close();

    for (const folha of Array.from(document.querySelectorAll('style'))) {
      doc.head.appendChild(folha.cloneNode(true));
    }
    // ⚠️ Clona a `<table>` RENDERIZADA, nunca uma montada com `createElement`: o Angular escopa as
    // folhas por atributo (`[_ngcontent-xxx]`), então um elemento criado à mão NÃO casa nenhuma
    // regra do componente e o que se mediria seria um DOM sem estilo — foi o primeiro erro deste
    // harness, e ele dava vermelho pelo motivo errado, que é pior que dar verde.
    doc.body.appendChild(tabela.cloneNode(true));
    // Reflow SÍNCRONO: ler uma métrica geométrica força o layout. `requestAnimationFrame` aqui era
    // instável (o Karma deu `Timeout - Async function did not complete within 5000ms` quando o
    // quadro não chegou), e teste que depende de quadro do navegador é teste que falha sozinho.
    void doc.body.offsetHeight;

    const nome = doc.querySelector('.lancamento__produto') as HTMLElement;
    const motivo = doc.querySelector('.lancamento__motivo') as HTMLElement;
    const rCel = nome.getBoundingClientRect();
    const rMot = motivo.getBoundingClientRect();
    const medida = {
      larguraNome: rCel.width,
      larguraMotivo: rMot.width,
      offsetLeft: Math.round(rMot.left - rCel.left),
      topRel: Math.round(rMot.top - rCel.top),
      truncado: motivo.scrollHeight > motivo.clientHeight + 1,
    };
    iframe.remove();
    return medida;
  }

  it('P1-2: a 375px o motivo ocupa a LINHA INTEIRA da célula (não fica ao lado do nome)', () => {
    const el = iniciar().nativeElement as HTMLElement;
    const medida = medirCelular(el.querySelector('table.tabela')!);
    // MEDIDO nos dois desenhos, a 375px (é o contraste que torna este caso capaz de reprovar):
    //   sem o conserto -> offsetLeft=49  topRel=4   largura=310 (o motivo fica AO LADO, e quem é
    //                                                espremido é o NOME do produto)
    //   com o conserto -> offsetLeft=0   topRel=22  largura=359 (= largura da célula)
    // ⚠️ Asserir só "largura > 200" NÃO discrimina: sem o conserto o motivo já media 310px — quem
    // perdia espaço era o nome. Foi um falso-verde meu, pego na mutação.
    expect(medida.offsetLeft).toBe(0);
    expect(medida.topRel).toBeGreaterThanOrEqual(16);
    expect(medida.larguraMotivo).toBe(medida.larguraNome);
  });

  it('P1-2: a 375px o motivo aparece INTEIRO — o motivo do estorno é obrigatório (PA#2)', () => {
    const el = iniciar().nativeElement as HTMLElement;
    const medida = medirCelular(el.querySelector('table.tabela')!);
    expect(medida.truncado).toBeFalse();
  });

  it('P1-2 (o outro lado): no DESKTOP o motivo continua com o clamp de 1 linha da tabela densa', () => {
    // O Karma roda em viewport de desktop, então este caso mede o fixture direto — e é a trava que
    // impede o conserto do celular de vazar para cá: no desktop o clamp é CERTO (tabela densa, e o
    // `title` entrega o texto no hover). Sem isto, "consertar" o celular estragaria a outra ponta.
    const el = iniciar().nativeElement as HTMLElement;
    const motivo = el.querySelector('.lancamento__motivo') as HTMLElement;
    const celula = el.querySelector('.lancamento__produto') as HTMLElement;
    // A célula volta a ser `table-cell` (o `flex` do celular não vaza para cá)...
    expect(getComputedStyle(celula).display).toBe('table-cell');
    // ...e o clamp de 1 linha do `.tabela__apoio` continua ATIVO.
    // ⚠️ Não se assere `display: -webkit-box` aqui: o Chrome 152 computa essa declaração como
    // `flow-root` quando há line-clamp (medido: `celula=table-cell motivo=flow-root clamp=1`).
    // Asserir o nome do display seria travar um detalhe do motor; o que vale é o clamp valer.
    expect(getComputedStyle(motivo).webkitLineClamp).toBe('1');
    expect(motivo.title).toBe(base.motivo!); // o texto completo continua alcançável no hover
  });
});
