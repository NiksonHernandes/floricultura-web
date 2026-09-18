import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DateAdapter, MAT_DATE_FORMATS, provideNativeDateAdapter } from '@angular/material/core';

import { Relatorios } from './relatorios';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { PT_BR_DATE_FORMATS, PtBrDateAdapter } from '../../core/date/pt-br-date-adapter';
import { ApiResponse } from '../../core/models/api-response.model';
import { Relatorio } from '../../core/models/relatorio.model';

/**
 * BUG-004 — o CA-51 estava medido só em Movimentações e no painel de filtros. **Relatórios nunca
 * foi medida.**
 *
 * A folha declara `min-height: var(--toque, 44px)` nos atalhos e nos botões de baixar — mas
 * declaração **não é** medida: a AD-SQ-174 mostrou um `min-height` no host que era **padding morto**
 * (quem era pequeno era o `<label>`), e a AD-SQ-182 mostrou uma propriedade computada que não podia
 * falhar. Aqui se mede a **geometria renderizada a 375 px**.
 *
 * ⚠️ **Sentinela obrigatória:** o harness copia as `<style>` do documento; se o build migrar para
 * `adoptedStyleSheets` ele fica **mudo**, e mudo aqui seria **verde**. A sentinela deste arquivo é a
 * `.ficha` (`border-radius: 12px` + `display: grid`, regras que **não** estão sob asserção) — sem
 * folha, ela lê `0px`/`block` e o arquivo inteiro reprova antes de mentir.
 */
describe('Relatorios — alvos de toque a 375px (BUG-004, CA-51/FC-02)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/relatorios/movimentacoes';
  const TOQUE_MINIMO = 44;

  const dados = {
    de: '2026-09-01',
    ate: '2026-09-30',
    granularidade: 'MES',
    resumo: {
      entradas: { lancamentos: 1, quantidade: 1, valor: 10 },
      saidas: { lancamentos: 1, quantidade: 1, valor: 20 },
      ajustes: { lancamentos: 0, quantidade: 0, valor: 0 },
      resultadoValor: 10,
      lancamentosEstornadosExcluidos: 0,
    },
    periodos: [
      {
        inicio: '2026-09-01',
        fim: '2026-09-30',
        entradas: { lancamentos: 1, quantidade: 1, valor: 10 },
        saidas: { lancamentos: 1, quantidade: 1, valor: 20 },
        ajustes: { lancamentos: 0, quantidade: 0, valor: 0 },
        resultadoValor: 10,
      },
    ],
  } as Relatorio;

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function iniciar(): ComponentFixture<Relatorios> {
    const fixture = TestBed.createComponent(Relatorios);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(dados));
    fixture.detectChanges();
    return fixture;
  }

  /** Mede a tela renderizada dentro de um documento de 375 px (o Karma roda em desktop). */
  function medir(fixture: ComponentFixture<Relatorios>) {
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
    doc.body.appendChild((fixture.nativeElement as HTMLElement).cloneNode(true));
    void doc.body.offsetHeight; // reflow síncrono (rAF é instável no Karma)

    const alturas = (sel: string) =>
      Array.from(doc.querySelectorAll(sel)).map((el) =>
        (el as HTMLElement).getBoundingClientRect().height,
      );
    const ficha = doc.querySelector('.ficha') as HTMLElement | null;
    const medida = {
      folhas: doc.styleSheets.length,
      sentinelaRaio: ficha ? doc.defaultView!.getComputedStyle(ficha).borderRadius : '',
      atalhos: alturas('.atalho'),
      filtros: alturas('.controles__filtros'),
      baixar: alturas('.acoes__baixar'),
    };
    iframe.remove();
    return medida;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Relatorios],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: DateAdapter, useClass: PtBrDateAdapter },
        { provide: MAT_DATE_FORMATS, useValue: PT_BR_DATE_FORMATS },
        FornecedoresService, // §12 #31
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('o harness ENXERGA estilo (sentinela contra harness mudo)', () => {
    const m = medir(iniciar());
    expect(m.folhas).toBeGreaterThan(0);
    // `.ficha` não está sob asserção em nenhum caso deste arquivo: ela é a testemunha, não a ré.
    expect(m.sentinelaRaio).toBe('12px');
  });

  it('BUG-004: os 5 atalhos de período/granularidade medem >= 44px', () => {
    const m = medir(iniciar());
    expect(m.atalhos.length).toBe(5);
    for (const h of m.atalhos) expect(h).toBeGreaterThanOrEqual(TOQUE_MINIMO);
  });

  it('BUG-004: o gatilho de filtros e os DOIS botões de baixar medem >= 44px', () => {
    const m = medir(iniciar());
    expect(m.filtros.length).toBe(1);
    expect(m.baixar.length).toBe(2); // PDF e Excel
    for (const h of [...m.filtros, ...m.baixar]) expect(h).toBeGreaterThanOrEqual(TOQUE_MINIMO);
  });
});
