import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable } from 'rxjs';

import { ClientesService } from './clientes/clientes.service';
import { FornecedoresService } from './fornecedores/fornecedores.service';
import { ApiResponse } from '../core/models/api-response.model';
import { PaginaResponse } from '../core/models/produto.model';
import { ContatoConsulta } from '../core/models/contato-consulta.model';

/**
 * T-M6-A2 / CA-44 (SPEC-M6 §3.7, AD-SQ-107) — `comTelefone`/`comEmail` no SERVIÇO.
 *
 * Por que este arquivo existe: o dono removeu os dois filtros tri-estado da TELA ("deixe somente a
 * busca por nome"), mas o back da T-M6-08a fica byte a byte como está e a ponte do front (o
 * mapeamento dos 2 params em `ClientesService`/`FornecedoresService` + o tipo `ContatoConsulta`)
 * também. Isso é **capacidade de API documentada sem consumidor de UI** (dívida DT-M6-1) — e os
 * casos que a exercitavam morreram junto com os botões. Capacidade sem consumidor **não pode ficar
 * também sem teste**: é este spec que impede que o mapeamento apodreça em silêncio até o M7.
 *
 * Bateria única para os 2 serviços porque o contrato é idêntico (§3.7/D3): duplicar as asserções
 * convidaria as cópias a divergirem, que é o mesmo argumento da bateria da T-M6-08d (AD-SQ-104).
 *
 * Dados FICTÍCIOS (LGPD): nenhuma PII real trafega aqui — só params de consulta.
 */
describe('T-M6-A2/CA-44 — params de contato preservados no serviço (sem consumidor de UI)', () => {
  interface Cenario {
    nome: string;
    url: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listar: (consulta?: ContatoConsulta) => Observable<PaginaResponse<any>>;
  }

  let httpMock: HttpTestingController;

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function paginaVazia(): PaginaResponse<never> {
    return {
      conteudo: [],
      pagina: 0,
      tamanho: 12,
      totalElementos: 0,
      totalPaginas: 0,
      primeira: true,
      ultima: true,
    };
  }

  function cenarios(): Cenario[] {
    const clientes = TestBed.inject(ClientesService);
    const fornecedores = TestBed.inject(FornecedoresService);
    return [
      {
        nome: 'ClientesService',
        url: 'http://localhost:8080/api/v1/clientes',
        listar: (consulta) => clientes.listar(0, 12, undefined, consulta),
      },
      {
        nome: 'FornecedoresService',
        url: 'http://localhost:8080/api/v1/fornecedores',
        listar: (consulta) => fornecedores.listar(0, 12, undefined, consulta),
      },
    ];
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      // `FornecedoresService` NÃO é `providedIn:'root'` (AD-SQ-72: quem usa, provê — é o que
      // impede um `GET /fornecedores` de disparar sem registro nos specs alheios).
      providers: [provideHttpClient(), provideHttpClientTesting(), FornecedoresService],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('põe os DOIS params quando a consulta traz os tri-estados (inclusive `false`)', () => {
    for (const cenario of cenarios()) {
      cenario.listar({ comTelefone: false, comEmail: true }).subscribe();

      const req = httpMock.expectOne((r) => r.url === cenario.url);
      // `false` é filtro LEGÍTIMO ("sem telefone", R25) — o teste do serviço é contra
      // `null`/`undefined`, nunca contra falsy. Trocar por `if (consulta.comTelefone)` faria o
      // "Sem" desaparecer da URL, e é exatamente essa regressão que este caso pega.
      expect(req.request.params.get('comTelefone'))
        .withContext(`${cenario.nome}: comTelefone=false`)
        .toBe('false');
      expect(req.request.params.get('comEmail'))
        .withContext(`${cenario.nome}: comEmail=true`)
        .toBe('true');
      req.flush(envelope(paginaVazia()));
    }
  });

  it('NÃO põe param algum quando o tri-estado é `null`/ausente (ausente = sem filtro)', () => {
    for (const cenario of cenarios()) {
      cenario.listar({ comTelefone: null, ordenarPor: 'nome', direcao: 'asc' }).subscribe();

      const req = httpMock.expectOne((r) => r.url === cenario.url);
      expect(req.request.params.has('comTelefone'))
        .withContext(`${cenario.nome}: comTelefone=null não vai na URL`)
        .toBeFalse();
      expect(req.request.params.has('comEmail'))
        .withContext(`${cenario.nome}: comEmail ausente não vai na URL`)
        .toBeFalse();
      // A ordenação (que FICOU na tela) continua viajando na mesma chamada.
      expect(req.request.params.get('ordenarPor')).toBe('nome');
      expect(req.request.params.get('direcao')).toBe('asc');
      req.flush(envelope(paginaVazia()));
    }
  });

  it('a lista da TELA não manda os params: a consulta que ela monta só tem ordenação', () => {
    for (const cenario of cenarios()) {
      // Exatamente o objeto que `clientes.ts`/`fornecedores.ts` passam depois da T-M6-A2.
      cenario.listar({ ordenarPor: 'email', direcao: 'desc' }).subscribe();

      const req = httpMock.expectOne((r) => r.url === cenario.url);
      expect(req.request.params.has('comTelefone'))
        .withContext(`${cenario.nome}: a tela não filtra mais por telefone`)
        .toBeFalse();
      expect(req.request.params.has('comEmail'))
        .withContext(`${cenario.nome}: a tela não filtra mais por e-mail`)
        .toBeFalse();
      req.flush(envelope(paginaVazia()));
    }
  });
});
