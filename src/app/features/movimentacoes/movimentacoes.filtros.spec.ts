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
 * T-M7-07 — filtros da lista global (SPEC-M7 §3.5/§3.11-f, AD-SQ-168).
 *
 * ⚠️ Arquivo NÃO previsto no §6 do SDD (a lacuna foi levantada no plano e está com o arquiteto: o
 * §5 não tem CA para "o filtro funciona", embora o §7 coloque os filtros nesta task). Testado assim
 * mesmo — código novo sai com teste. O §10 #20 diz que o piso é piso e caso extra é bem-vindo.
 *
 * Este é o ÚNICO spec da tela que provê `DateAdapter`: é ele que abre o painel e, portanto, o único
 * que monta o `MatDatepicker`. Os 3 herdados não o provêem — e é exatamente por isso que o painel
 * nasce fechado (ver o cabeçalho de `filtros-movimentacoes.ts`).
 *
 * Dados FICTÍCIOS (LGPD): nomes de planta / "Sítio Boa Flor" / "Maria Flores".
 */
describe('Movimentacoes — filtros (T-M7-07, §3.5)', () => {
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
    motivo: 'Venda balcão',
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

  /** Abre o painel (é o que monta o datepicker) e devolve a raiz do DOM. */
  function abrirPainel(fixture: ComponentFixture<Movimentacoes>): HTMLElement {
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.controles__filtros') as HTMLButtonElement).click();
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
        // `FornecedoresService` é `@Injectable()` SEM `providedIn: 'root'` (fornecido em
        // `app.config.ts`, verificado). Só quem MONTA o painel precisa dele — os 3 herdados nunca
        // o abrem, então seguem sem provider e sem saber que ele existe.
        FornecedoresService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('CA-41: o painel nasce FECHADO — nada de datepicker nem requisição extra na carga', () => {
    const el = iniciar().nativeElement as HTMLElement;
    expect(el.querySelector('app-filtros-movimentacoes')).toBeNull();
    expect(el.querySelector('.controles__filtros')).toBeTruthy();
    // `httpMock.verify()` fecha a perna: nenhum GET de produtos/clientes/fornecedores saiu.
  });

  it('§3.11-f: clicar em "Filtros" abre o painel e o gatilho reflete em aria-expanded', () => {
    const fixture = iniciar();
    const gatilho = (fixture.nativeElement as HTMLElement).querySelector('.controles__filtros')!;
    expect(gatilho.getAttribute('aria-expanded')).toBe('false');
    const el = abrirPainel(fixture);
    expect(el.querySelector('app-filtros-movimentacoes')).toBeTruthy();
    expect(gatilho.getAttribute('aria-expanded')).toBe('true');
  });

  it('§3.5: aplicar tipo manda `tipo` na query e volta para a 1ª página', () => {
    const fixture = iniciar();
    const el = abrirPainel(fixture);
    const tipo = el.querySelector('#filtro-tipo') as HTMLSelectElement;
    tipo.value = tipo.options[2].value; // SAIDA
    tipo.dispatchEvent(new Event('change'));
    (el.querySelector('.painel__aplicar') as HTMLButtonElement).click();

    const req = httpMock.expectOne(
      (r) => r.url === BASE && r.params.get('tipo') === 'SAIDA' && r.params.get('pagina') === '0',
    );
    req.flush(envelope(pagina([base])));
    fixture.detectChanges();
    // Aplicar fecha o painel; o recorte fica no contador do gatilho.
    expect(el.querySelector('app-filtros-movimentacoes')).toBeNull();
    expect(el.querySelector('.controles__filtros')!.textContent).toContain('Filtros (1)');
  });

  it('§3.5: sem recorte, NENHUM param de filtro viaja (contrato antigo intacto)', () => {
    const fixture = iniciar();
    const el = abrirPainel(fixture);
    (el.querySelector('.painel__aplicar') as HTMLButtonElement).click();

    const req = httpMock.expectOne((r) => r.url === BASE);
    for (const p of ['de', 'ate', 'tipo', 'produtoId', 'clienteId', 'fornecedorId']) {
      expect(req.request.params.has(p)).toBeFalse();
    }
    req.flush(envelope(pagina([base])));
  });

  it('CA-41: o select de produto só busca ao receber FOCO — e uma vez só', () => {
    const fixture = iniciar();
    const el = abrirPainel(fixture);
    const select = el.querySelector('.filtro-produto') as HTMLSelectElement;

    select.dispatchEvent(new Event('focus'));
    const req = httpMock.expectOne(
      (r) => r.url.endsWith('/produtos') && r.params.get('tamanho') === '100',
    );
    req.flush(
      envelope({
        conteudo: [{ id: 5, nome: 'Rosa Vermelha' }],
        pagina: 0,
        tamanho: 100,
        totalElementos: 1,
        totalPaginas: 1,
        primeira: true,
        ultima: true,
      }),
    );
    fixture.detectChanges();
    expect(select.options.length).toBe(2); // "Todos" + Rosa Vermelha

    // Segundo foco não repete a busca — `verify()` no afterEach reprova se repetir.
    select.dispatchEvent(new Event('focus'));
  });

  it('CA-41: cliente e fornecedor idem — cada um busca no seu próprio foco, nunca antes', () => {
    const fixture = iniciar();
    const el = abrirPainel(fixture);

    (el.querySelector('.filtro-cliente') as HTMLSelectElement).dispatchEvent(new Event('focus'));
    httpMock
      .expectOne((r) => r.url.endsWith('/clientes'))
      .flush(
        envelope({
          conteudo: [{ id: 8, nome: 'Maria Flores' }],
          pagina: 0,
          tamanho: 100,
          totalElementos: 1,
          totalPaginas: 1,
          primeira: true,
          ultima: true,
        }),
      );

    (el.querySelector('.filtro-fornecedor') as HTMLSelectElement).dispatchEvent(new Event('focus'));
    httpMock
      .expectOne((r) => r.url.endsWith('/fornecedores'))
      .flush(
        envelope({
          conteudo: [{ id: 3, nome: 'Sítio Boa Flor' }],
          pagina: 0,
          tamanho: 100,
          totalElementos: 1,
          totalPaginas: 1,
          primeira: true,
          ultima: true,
        }),
      );
    fixture.detectChanges();
    expect((el.querySelector('.filtro-fornecedor') as HTMLSelectElement).options.length).toBe(2);
  });

  it('§3.5: `de > ate` é barrado na tela, com a mensagem do contrato, sem gastar a viagem', () => {
    const fixture = iniciar();
    const el = abrirPainel(fixture);
    const [de, ate] = Array.from(el.querySelectorAll('input[formControlName]'));
    (de as HTMLInputElement).value = '10/09/2026';
    de.dispatchEvent(new Event('input'));
    (ate as HTMLInputElement).value = '01/09/2026';
    ate.dispatchEvent(new Event('input'));
    (el.querySelector('.painel__aplicar') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('.painel__erro')!.textContent).toContain(
      'A data inicial não pode ser maior que a final.',
    );
    // `verify()` reprova qualquer GET: a tela não gastou a viagem que o back devolveria como 400.
  });

  it('AD-SQ-168: recorte sem correspondência é VAZIO honesto, nunca erro', () => {
    const fixture = iniciar();
    const el = abrirPainel(fixture);
    const tipo = el.querySelector('#filtro-tipo') as HTMLSelectElement;
    tipo.value = tipo.options[3].value; // AJUSTE
    tipo.dispatchEvent(new Event('change'));
    (el.querySelector('.painel__aplicar') as HTMLButtonElement).click();

    // O back devolve 200 com lista vazia (id/recorte que não casa nada NÃO é 400).
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([])));
    fixture.detectChanges();

    expect(el.querySelector('.estado--vazio')).toBeTruthy();
    expect(el.querySelector('.estado--erro')).toBeNull();
    // E o texto fala do RECORTE, não do acervo: dizer "nenhuma movimentação registrada" a quem
    // filtrou seria mentir sobre o livro.
    expect(el.querySelector('.estado--vazio')!.textContent).toContain('Nenhuma movimentação neste recorte');
  });

  it('§3.5: "Limpar" zera o recorte e refaz a busca sem nenhum param de filtro', () => {
    const fixture = iniciar();
    let el = abrirPainel(fixture);
    const tipo = el.querySelector('#filtro-tipo') as HTMLSelectElement;
    tipo.value = tipo.options[1].value; // ENTRADA
    tipo.dispatchEvent(new Event('change'));
    (el.querySelector('.painel__aplicar') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.params.get('tipo') === 'ENTRADA').flush(envelope(pagina([base])));
    fixture.detectChanges();

    el = abrirPainel(fixture);
    (el.querySelector('.painel__limpar') as HTMLButtonElement).click();
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.has('tipo')).toBeFalse();
    req.flush(envelope(pagina([base])));
    fixture.detectChanges();
    expect(el.querySelector('.controles__filtros')!.textContent).toContain('Filtros (0)');
  });
});
