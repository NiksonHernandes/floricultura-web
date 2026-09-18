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
 * T-M7-08 — LAYOUT de Movimentações: o dente que faltava na AD-SQ-182 e os alvos de toque novos.
 *
 * Arquivo NOVO por obrigação estrutural, não por gosto: `movimentacoes.regressoes.spec.ts` está
 * **rastreado**, e o hook anti-burla bloqueia teste rastreado inclusive para quem o criou (§12 #27).
 * Nenhuma liberação foi pedida — a AD-SQ-182 já decidiu que o caso vem em arquivo novo.
 *
 * **O que a AD-SQ-182 corrigiu:** o caso herdado assere `getComputedStyle(motivo).webkitLineClamp`,
 * e essa propriedade é declarada **incondicionalmente** em `_tabela-densa.scss` (`.tabela__apoio`) —
 * ela computa `'1'` **com e sem** a regra do desktop, então a assertiva **não pode falhar**. O que
 * prova que uma regra CSS está valendo é a **geometria**, e é o que este arquivo mede.
 *
 * Dados FICTÍCIOS (LGPD): nomes de planta.
 */
describe('Movimentacoes — layout (T-M7-08, AD-SQ-182/AD-SQ-181/CA-51)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/movimentacoes';

  /** Mínimo do CA-51/FC-02 (o repo tem o token `--toque: 44px` em `_atelie-tokens.scss`). */
  const TOQUE_MINIMO = 44;

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

  /**
   * Mede a tela RENDERIZADA dentro de um documento de 375 px.
   *
   * O Karma roda em viewport de desktop, então `@media` não pode ser medido no fixture. Clona-se o
   * elemento renderizado (o Angular escopa as folhas por atributo: um DOM montado à mão não casaria
   * regra nenhuma) e as `<style>` injetadas.
   *
   * ⚠️ **Ressalva conhecida, e é por isso que existe a sentinela:** se o build um dia migrar para
   * `adoptedStyleSheets`, este laço deixa de copiar estilo e o harness fica **mudo** — e mudo aqui
   * seria **verde**, o pior estado possível. A sentinela falha antes disso acontecer em silêncio.
   */
  function medirCelular(fixture: ComponentFixture<Movimentacoes>) {
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

    const altura = (sel: string, i = 0) => {
      const el = doc.querySelectorAll(sel)[i] as HTMLElement | undefined;
      return el ? el.getBoundingClientRect().height : 0;
    };
    const medida = {
      folhas: doc.styleSheets.length,
      sentinela: altura('.controles__filtros'), // já tinha `min-height: 44px` ANTES desta task
      visaoTodas: altura('.visao', 0),
      visaoProduto: altura('.visao', 1),
      gatilhoExtrato: altura('.lancamento__extrato'),
      linha: altura('tr.lancamento'),
    };
    iframe.remove();
    return medida;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Movimentacoes],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        // §12 #31: `@Injectable()` sem `providedIn:'root'`. Sem isto o 1º erro seria
        // `NullInjectorError` — e o caso reprovaria pelo motivo errado.
        FornecedoresService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('o harness ENXERGA estilo (sentinela contra harness mudo)', () => {
    const m = medirCelular(iniciar());
    expect(m.folhas).toBeGreaterThan(0);
    // `.controles__filtros` tem `min-height: 44px` desde a T-M7-07: se o clone estivesse sem
    // estilo, esta altura não seria 44 — e todos os casos abaixo passariam por falta de CSS.
    expect(m.sentinela).toBe(TOQUE_MINIMO);
  });

  it('CA-51: os alvos de toque novos medem >= 44px a 375px', () => {
    const m = medirCelular(iniciar());
    expect(m.visaoTodas).toBeGreaterThanOrEqual(TOQUE_MINIMO);
    expect(m.visaoProduto).toBeGreaterThanOrEqual(TOQUE_MINIMO);
    expect(m.gatilhoExtrato).toBeGreaterThanOrEqual(TOQUE_MINIMO);
  });

  it('AD-SQ-181: a altura do lançamento a 375px fica dentro do teto medido', () => {
    // MEDIDO nos dois desenhos, com esta fixture (motivo longo, 4 linhas de etiqueta):
    //   sem o alvo de toque -> gatilho 18,0 px · linha 387,875 px
    //   com o alvo de toque -> gatilho 44,0 px · linha 413,875 px   (+26 px, +6,7 %)
    // O CA-51 é contrato e o dono acabou de subir outros 3 alvos de 40 -> 44 (AD-SQ-180); o custo em
    // rolagem é o que ele decide OLHANDO a tela no smoke (AD-SQ-181), com estes dois números na mão.
    // O teto abaixo é rede contra inflar a linha de novo sem ninguém perceber.
    const m = medirCelular(iniciar());
    expect(m.linha).toBeGreaterThan(0);
    expect(m.linha).toBeLessThan(440);
  });

  it('AD-SQ-182: no DESKTOP o motivo continua CORTADO — provado por GEOMETRIA, não por propriedade', () => {
    // O Karma roda em viewport de desktop, então mede-se o fixture direto (sem iframe): é a trava
    // que impede o conserto do celular de vazar para cá.
    const el = iniciar().nativeElement as HTMLElement;
    const motivo = el.querySelector('.lancamento__motivo') as HTMLElement;
    expect(motivo.scrollHeight).toBeGreaterThan(motivo.clientHeight);
  });
});
