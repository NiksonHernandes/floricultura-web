import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DateAdapter, MAT_DATE_FORMATS, provideNativeDateAdapter } from '@angular/material/core';

import { FiltrosMovimentacoes } from './filtros-movimentacoes';
import { FornecedoresService } from '../../fornecedores/fornecedores.service';
import { PT_BR_DATE_FORMATS, PtBrDateAdapter } from '../../../core/date/pt-br-date-adapter';

/**
 * T-M7-09 — alvo de toque dos botões de ÍCONE do painel de filtros (AD-SQ-180, CA-51/FC-02).
 *
 * A carona é do dono e é desta task, não da T-M7-07 (§7, nota sob a tabela): os dois
 * `mat-datepicker-toggle` e o `.painel__fechar` mediam **40 px** — o default do `mat-icon-button`
 * do Material 20 — contra os 44 px que o CA-51 exige.
 *
 * ⚠️ **Arquivo NÃO previsto no §6** (a AD-SQ-180 é de 2026-09-17, posterior à lista de testes).
 * Lacuna reportada no plano, antes de codificar — mesma família das erratas AD-SQ-169/177. Testado
 * assim mesmo: código novo sai com teste, e o §10 #20 diz que o piso é piso.
 *
 * **Por que iframe, e por que clonando o HOST** (as duas coisas foram medidas, não supostas):
 *  - o Karma roda em viewport de desktop, então `@media` não pode ser medido no fixture;
 *  - `:host` compila para `[_nghost-…]`, que mora no **elemento host**. Clonar um filho (`.painel`)
 *    deixa a regra de fora e a medida volta **40 px mesmo com o conserto aplicado** — medido, e é
 *    exatamente o falso-vermelho que este cabeçalho existe para impedir o próximo leitor de repetir.
 *  - o harness copia as `<style>` injetadas; se um dia o build migrar para `adoptedStyleSheets`,
 *    ele fica **mudo** — e mudo aqui seria VERDE. Daí as duas sentinelas do primeiro caso.
 */
describe('FiltrosMovimentacoes — alvo de toque a 375px (T-M7-09, AD-SQ-180/CA-51)', () => {
  let httpMock: HttpTestingController;

  /** Mínimo do CA-51/FC-02 (o repo já tem o token `--toque: 44px` em `_atelie-tokens.scss`). */
  const TOQUE_MINIMO = 44;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FiltrosMovimentacoes],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: DateAdapter, useClass: PtBrDateAdapter },
        { provide: MAT_DATE_FORMATS, useValue: PT_BR_DATE_FORMATS },
        // `FornecedoresService` é `@Injectable()` SEM `providedIn:'root'` (provido no `app.config`).
        // Sem esta linha o primeiro erro seria `NullInjectorError` — e o caso reprovaria pelo motivo
        // errado, que é pior do que passar (§12 #31).
        FornecedoresService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  /** Nada carrega no `ngOnInit` (CA-41): os selects só buscam no foco. */
  afterEach(() => httpMock.verify());

  /** Mede o painel RENDERIZADO dentro de um documento de 375 px. */
  function medir() {
    const fixture = TestBed.createComponent(FiltrosMovimentacoes);
    fixture.detectChanges();

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
    // O HOST, não o `.painel`: é o host que carrega o atributo `[_nghost-…]` das regras `:host`.
    doc.body.appendChild((fixture.nativeElement as HTMLElement).cloneNode(true));
    void doc.body.offsetHeight; // reflow síncrono (rAF é instável no Karma)

    const altura = (sel: string, i = 0) => {
      const el = doc.querySelectorAll(sel)[i] as HTMLElement | undefined;
      return el ? el.getBoundingClientRect().height : 0;
    };
    const medida = {
      folhas: doc.styleSheets.length,
      sentinela: altura('.campo-nativo__campo'),
      fechar: altura('.painel__fechar'),
      toggleDe: altura('mat-datepicker-toggle button', 0),
      toggleAte: altura('mat-datepicker-toggle button', 1),
    };
    iframe.remove();
    return medida;
  }

  it('o harness ENXERGA estilo (sentinela contra harness mudo)', () => {
    const m = medir();
    // Sem estas duas, um harness que perdesse as folhas mediria ~0/auto e o caso seguinte ficaria
    // VERDE por falta de CSS — o pior estado possível, porque é silencioso.
    expect(m.folhas).toBeGreaterThan(0);
    // `.campo-nativo__campo` já tinha `min-height: var(--toque)` antes desta task: se o clone
    // estivesse sem estilo, esta altura não seria 44.
    expect(m.sentinela).toBe(TOQUE_MINIMO);
  });

  it('os 3 botões de ícone medem >= 44px (AD-SQ-180 — medido: 40,0 antes / 44,0 depois)', () => {
    const m = medir();
    expect(m.fechar).toBeGreaterThanOrEqual(TOQUE_MINIMO);
    expect(m.toggleDe).toBeGreaterThanOrEqual(TOQUE_MINIMO);
    expect(m.toggleAte).toBeGreaterThanOrEqual(TOQUE_MINIMO);
  });
});
