import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DateAdapter, MAT_DATE_FORMATS, provideNativeDateAdapter } from '@angular/material/core';

import { Relatorios } from './relatorios';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { PT_BR_DATE_FORMATS, PtBrDateAdapter } from '../../core/date/pt-br-date-adapter';
import { ApiResponse } from '../../core/models/api-response.model';
import { Relatorio, TotaisRelatorio } from '../../core/models/relatorio.model';

/**
 * T-M7-09 — tela de Relatórios (SPEC-M7 §3.13; CA-45, CA-46, CA-49).
 *
 * **O caso mais importante deste arquivo é o "o resultado vem do SERVIDOR"** (R6/AD-SQ-164 aplicada
 * a uma tela que **não tem caminho de arredondamento**): aqui não há o que arredondar — `valor`
 * chega `NUMERIC(14,2)` e `quantidade` `NUMERIC(14,3)` —, então a prova é de **ausência de cálculo**.
 * Ela se faz com um payload deliberadamente INCONSISTENTE (`saidas − entradas = 60`, mas
 * `resultadoValor = 7.77`): se a tela somasse, mostraria `R$ 60,00`. É o §4.7 com dente — e não é
 * preciosismo, porque o par estornado sai da conta no `WHERE` do back (§3.7-d) e uma soma local
 * reintroduziria exatamente o dinheiro que o dono mandou excluir.
 *
 * Esta tela **não** usa `| date`, então não depende do `registerLocaleData` do §12 #30:
 * `Number.toLocaleString` é `Intl`, não pipe do Angular, e o rótulo do balde é recorte de string.
 *
 * Dados FICTÍCIOS (LGPD).
 */
describe('Relatorios (T-M7-09, §3.13)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/relatorios/movimentacoes';

  function totais(lancamentos: number, quantidade: number, valor: number): TotaisRelatorio {
    return { lancamentos, quantidade, valor };
  }

  /**
   * `resultadoValor` **não** é derivado destes operandos de propósito: quem manda o resultado é o
   * servidor, e o teste tem de poder distinguir "a tela leu" de "a tela somou".
   */
  function relatorio(parcial: Partial<Relatorio> = {}): Relatorio {
    return {
      de: '2026-09-01',
      ate: '2026-09-30',
      granularidade: 'MES',
      resumo: {
        entradas: totais(12, 140.125, 40.0),
        saidas: totais(31, 118.0, 100.0),
        ajustes: totais(2, 10.0, 0.0),
        resultadoValor: 7.77,
        lancamentosEstornadosExcluidos: 0,
      },
      periodos: [
        {
          inicio: '2026-09-01',
          fim: '2026-09-30',
          entradas: totais(12, 140.125, 40.0),
          saidas: totais(31, 118.0, 100.0),
          ajustes: totais(2, 10.0, 0.0),
          resultadoValor: 7.77,
        },
      ],
      ...parcial,
    };
  }

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  /** Monta a tela e responde ao GET do atalho "Este mês" que o `ngOnInit` dispara. */
  function iniciar(dados: Relatorio = relatorio()): {
    fixture: ComponentFixture<Relatorios>;
    el: HTMLElement;
    params: Record<string, string | null>;
  } {
    const fixture = TestBed.createComponent(Relatorios);
    fixture.detectChanges();
    const req = httpMock.expectOne((r) => r.url === BASE);
    const params: Record<string, string | null> = {};
    for (const chave of req.request.params.keys()) {
      params[chave] = req.request.params.get(chave);
    }
    req.flush(envelope(dados));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, params };
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
        // `@Injectable()` sem `providedIn:'root'` (§12 #31): o painel de filtros reusado o injeta.
        FornecedoresService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('CA-46: "Este mês" pede o 1º e o último dia do mês corrente em America/Sao_Paulo', () => {
    const { params } = iniciar();
    // Derivação INDEPENDENTE da do componente (ele usa `en-CA`; aqui, `pt-BR` → dd/mm/aaaa).
    const [, mes, ano] = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' })
      .format(new Date())
      .split('/');
    const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate();

    expect(params['de']).toBe(`${ano}-${mes}-01`);
    expect(params['ate']).toBe(`${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`);
    expect(params['granularidade']).toBe('MES');
  });

  it('CA-45: o resumo traz a FÓRMULA escrita, não só o número', () => {
    const { el } = iniciar();
    expect(el.querySelector('.ficha__formula')?.textContent?.trim()).toBe('Saídas − Entradas');
  });

  it('R6: o resultado vem do SERVIDOR — a tela não soma nada', () => {
    const { el } = iniciar();
    const fichas = el.querySelectorAll('.ficha .ficha__valor');
    expect(fichas[0].textContent).toContain('40,00'); // entradas, como vieram
    expect(fichas[1].textContent).toContain('100,00'); // saídas, como vieram
    // Se a tela calculasse `saidas − entradas`, aqui sairia `R$ 60,00`.
    expect(fichas[2].textContent?.replace(/\s/g, ' ').trim()).toBe('R$ 7,77');
  });

  it('a quantidade preserva as 3 casas do back (140,125 — não 140,13)', () => {
    const { el } = iniciar();
    expect(el.querySelector('.ficha .ficha__apoio')?.textContent).toContain('140,125');
  });

  it('CA-49: a nota de rodapé aparece quando há lançamento excluído por estorno', () => {
    const dados = relatorio();
    dados.resumo.lancamentosEstornadosExcluidos = 2;
    const { el } = iniciar(dados);

    const nota = el.querySelector('.nota');
    expect(nota).toBeTruthy();
    expect(nota!.textContent).toContain('2 lançamento(s) ficaram fora');
  });

  it('CA-49 (o outro lado): sem exclusão, a nota NÃO aparece', () => {
    const { el } = iniciar(); // contador = 0
    expect(el.querySelector('.nota')).toBeNull();
  });

  it('o detalhado é a série de baldes, com os valores do servidor (inclusive o balde zerado)', () => {
    const dados = relatorio({
      periodos: [
        {
          inicio: '2026-09-01',
          fim: '2026-09-07',
          entradas: totais(1, 5, 15.5),
          saidas: totais(0, 0, 0),
          ajustes: totais(0, 0, 0),
          resultadoValor: -15.5,
        },
        {
          inicio: '2026-09-08',
          fim: '2026-09-14',
          entradas: totais(0, 0, 0),
          saidas: totais(0, 0, 0),
          ajustes: totais(0, 0, 0),
          resultadoValor: 0,
        },
      ],
    });
    const { el } = iniciar(dados);
    const linhas = el.querySelectorAll('tr.balde');

    expect(linhas.length).toBe(2);
    expect(linhas[0].querySelector('.balde__periodo')?.textContent?.trim()).toBe('01/09 a 07/09');
    expect(linhas[0].querySelectorAll('td')[1].textContent).toContain('15,50');
    // Balde vazio APARECE (CA-21) e mostra R$ 0,00 — que é um valor, não um "—" (§4.4).
    expect(linhas[1].querySelectorAll('td')[1].textContent).toContain('0,00');
  });

  it('recorte sem lançamento nenhum: estado vazio honesto, sem tabela fantasma', () => {
    const dados = relatorio();
    dados.resumo.entradas = totais(0, 0, 0);
    dados.resumo.saidas = totais(0, 0, 0);
    dados.resumo.ajustes = totais(0, 0, 0);
    const { el } = iniciar(dados);

    expect(el.querySelector('.estado--vazio')?.textContent).toContain('Nenhum lançamento');
    expect(el.querySelector('table.tabela')).toBeNull();
  });

  it('"Esta semana" pede segunda→domingo e agrupa por SEMANA', () => {
    const { el } = iniciar();
    (el.querySelectorAll('.atalho')[0] as HTMLButtonElement).click();

    const req = httpMock.expectOne((r) => r.url === BASE);
    const de = req.request.params.get('de')!;
    const ate = req.request.params.get('ate')!;
    req.flush(envelope(relatorio()));

    // Meio-dia evita a borda de horário de verão na leitura do dia da semana.
    expect(new Date(`${de}T12:00:00`).getDay()).toBe(1); // segunda
    expect((Date.parse(`${ate}T12:00:00`) - Date.parse(`${de}T12:00:00`)) / 86400000).toBe(6);
    expect(req.request.params.get('granularidade')).toBe('SEMANA');
  });

  it('"Intervalo" abre o painel de filtros e NÃO dispara requisição', () => {
    const { fixture, el } = iniciar();
    (el.querySelectorAll('.atalho')[2] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('app-filtros-movimentacoes')).toBeTruthy();
    expect(el.querySelector('.controles__filtros')?.getAttribute('aria-expanded')).toBe('true');
    // Nenhuma chamada: quem define o período agora é o operador. O `verify()` do afterEach fecha.
  });
});
