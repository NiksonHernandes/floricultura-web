import { TestBed } from '@angular/core/testing';
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
 * CARONA da T-M7-08 — P2-1 da review da T-M7-09 (§12 #36, AD-SQ-178/AD-SQ-164 aplicadas a DATA).
 *
 * **O defeito que este arquivo conserta não é de produção — é de DADO DE TESTE.** O caso do CA-46
 * em `relatorios.spec.ts:108` deriva o mês do relógio real, então **não separa São Paulo de fuso
 * nenhum**: a fronteira de mês só muda entre fusos em ~2 dias de cada 30. Medido pelo reviewer:
 * trocar `America/Sao_Paulo` por `Pacific/Kiritimati` deixou **10 SUCCESS, nada cai**.
 *
 * Arquivo NOVO porque `relatorios.spec.ts` está **rastreado** (§12 #27) — nenhuma liberação foi
 * pedida por isto, e o caso herdado fica onde está.
 *
 * **O relógio é FIXADO** no instante que separa os candidatos: `2026-10-01T02:30:00Z` é 23h30 de
 * **30/09** em São Paulo e já **01/10** em UTC e a leste. Na máquina do dono (que já é
 * `America/Sao_Paulo`) o defeito nunca apareceria — é por isso que o caso não pode depender do
 * relógio de quem roda.
 */
describe('Relatorios — o fuso do atalho "Este mês" (carona T-M7-08, §12 #36)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/relatorios/movimentacoes';

  /** 23h30 de 30/09 em São Paulo (UTC−3); em UTC/Lisboa/Kiritimati já é outubro. */
  const INSTANTE = new Date('2026-10-01T02:30:00Z');

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  const vazio = {
    de: '2026-09-01',
    ate: '2026-09-30',
    granularidade: 'MES',
    resumo: {
      entradas: { lancamentos: 0, quantidade: 0, valor: 0 },
      saidas: { lancamentos: 0, quantidade: 0, valor: 0 },
      ajustes: { lancamentos: 0, quantidade: 0, valor: 0 },
      resultadoValor: 0,
      lancamentosEstornadosExcluidos: 0,
    },
    periodos: [],
  } as Relatorio;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(INSTANTE);
    TestBed.configureTestingModule({
      imports: [Relatorios],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: DateAdapter, useClass: PtBrDateAdapter },
        { provide: MAT_DATE_FORMATS, useValue: PT_BR_DATE_FORMATS },
        // §12 #31: `@Injectable()` sem `providedIn:'root'` — o painel de filtros reusado o injeta.
        FornecedoresService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    jasmine.clock().uninstall();
  });

  it('CA-46: às 23h30 de 30/09 em São Paulo, "Este mês" ainda é SETEMBRO (e não outubro)', () => {
    // ⚠️ Os literais são ABSOLUTOS de propósito: derivá-los do relógio (como o caso herdado faz)
    // é o que torna a assertiva incapaz de reprovar o fuso errado. MEDIDO nos dois lados:
    //   `America/Sao_Paulo` -> de=2026-09-01 ate=2026-09-30   (o que o §4.8/AD-SQ-47 manda)
    //   `UTC` / `Pacific/Kiritimati` / `Europe/Lisbon` -> de=2026-10-01 ate=2026-10-31
    const fixture = TestBed.createComponent(Relatorios);
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('de')).toBe('2026-09-01');
    expect(req.request.params.get('ate')).toBe('2026-09-30');
    expect(req.request.params.get('granularidade')).toBe('MES');
    req.flush(envelope(vazio));
  });
});
