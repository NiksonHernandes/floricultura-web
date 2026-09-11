import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { Cores } from './cores';
import { CoresService } from './cores.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { PaginaResponse } from '../../../core/models/produto.model';
import { Cor } from '../../../core/models/cor.model';

/**
 * Configurações → Cores, LISTA (T-M6-06a — SPEC-M6 §3.15, CA-30/CA-40/CA-37).
 *
 * Fronteira desta task: a tela lista o catálogo em tabela densa com amostra + nome canônico +
 * `produtosVinculados`, busca por nome server-side e paginação. Criar/editar/excluir e a coluna
 * "Ações" são da T-M6-06b — e os casos abaixo travam a AUSÊNCIA deles de propósito: entregar um
 * botão que não faz nada seria UI desonesta no print de evidência.
 */
describe('Configurações → Cores — lista (T-M6-06a, CA-30)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/cores';

  const cinza: Cor = {
    id: 7,
    nome: 'CINZA-ESCURO',
    hex: '#C4326B',
    produtosVinculados: 3,
    criadoEm: '2026-09-11T13:02:11Z',
    atualizadoEm: '2026-09-11T13:02:11Z',
  };

  const azul: Cor = { ...cinza, id: 9, nome: 'AZUL', hex: null, produtosVinculados: 0 };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Cor[]): PaginaResponse<Cor> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 12,
      totalElementos: conteudo.length,
      totalPaginas: 1,
      primeira: true,
      ultima: true,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Cores],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        CoresService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function iniciar(conteudo: Cor[] = [cinza]): ComponentFixture<Cores> {
    const fixture = TestBed.createComponent(Cores);
    fixture.detectChanges(); // ngOnInit → carregar()
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo)));
    fixture.detectChanges();
    return fixture;
  }

  // --- Estrutura da tabela (§3.15) ---

  it('renderiza a tabela dentro do cartão, com as DUAS colunas desta task', () => {
    const el = iniciar().nativeElement as HTMLElement;
    expect(el.querySelector('.tabela-cartao > table.tabela')).toBeTruthy();

    const cabecalhos = Array.from(el.querySelectorAll('thead th')).map((th) =>
      th.textContent?.trim(),
    );
    expect(cabecalhos).toEqual(['Cor', 'Produtos vinculados']);
  });

  it('uma linha por cor, com amostra pintada no hex do back e rótulo p/ o celular', () => {
    const el = iniciar([cinza, azul]).nativeElement as HTMLElement;
    const linhas = el.querySelectorAll('tbody tr.cor');
    expect(linhas.length).toBe(2);

    const amostra = linhas[0].querySelector('.cor__amostra') as HTMLElement;
    // `rgb(196, 50, 107)` é o `#C4326B` que o back devolveu — nenhuma cor é escolhida no front.
    expect(amostra.style.backgroundColor).toBe('rgb(196, 50, 107)');
    expect(amostra.getAttribute('title')).toBe('#C4326B');
    expect(linhas[0].querySelectorAll('td')[1].getAttribute('data-rotulo')).toBe(
      'Produtos vinculados',
    );
  });

  it('cor sem hex NÃO ganha cor inventada: pastilha vazada + aviso para leitor de tela', () => {
    const el = iniciar([azul]).nativeElement as HTMLElement;
    const amostra = el.querySelector('.cor__amostra') as HTMLElement;

    expect(amostra.classList).toContain('cor__amostra--sem');
    expect(amostra.style.backgroundColor).toBe('');
    expect(amostra.getAttribute('title')).toBe('Sem amostra cadastrada');
    expect(el.querySelector('.sr')?.textContent).toContain('Sem amostra de cor cadastrada');
  });

  it('produtos vinculados mostra a contagem do back; 0 vira "Nenhum" (apoio), não um zero solto', () => {
    const el = iniciar([cinza, azul]).nativeElement as HTMLElement;
    const celulas = el.querySelectorAll('tbody td[data-rotulo]');

    expect(celulas[0].textContent?.trim()).toBe('3');
    expect(celulas[1].querySelector('.tabela__vazio')?.textContent?.trim()).toBe('Nenhum');
  });

  it('exibe o nome CANÔNICO exatamente como veio, sem re-embelezar (CA-40/R1d)', () => {
    const el = iniciar([cinza]).nativeElement as HTMLElement;
    const nome = el.querySelector('.cor__nome') as HTMLElement;

    expect(nome.textContent?.trim()).toBe('CINZA-ESCURO');
    // A prova contra `titlecase`/`text-transform`: o texto pintado é idêntico ao dado do back.
    expect(getComputedStyle(nome).textTransform).toBe('none');
  });

  // --- Busca server-side (§3.2) ---

  it('digitar na busca faz UMA requisição com o termo cru e volta para pagina=0', fakeAsync(() => {
    const fixture = iniciar();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).aoPaginar({ pageIndex: 2, pageSize: 12 });
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([cinza])));
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '.busca input',
    ) as HTMLInputElement;
    input.value = 'cinza escuro';
    input.dispatchEvent(new Event('input'));
    tick(300); // debounce

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('nome')).toBe('cinza escuro');
    expect(req.request.params.get('pagina')).toBe('0');
    req.flush(envelope(pagina([cinza])));
    fixture.detectChanges();
  }));

  // --- Estados honestos ---

  it('catálogo vazio e busca sem resultado dizem coisas diferentes', fakeAsync(() => {
    const fixture = iniciar([]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.estado--vazio')?.textContent).toContain(
      'O catálogo ainda está vazio',
    );

    const input = el.querySelector('.busca input') as HTMLInputElement;
    input.value = 'roxo';
    input.dispatchEvent(new Event('input'));
    tick(300);
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([])));
    fixture.detectChanges();

    expect(el.querySelector('.estado--vazio')?.textContent).toContain('Nenhuma cor encontrada');
  }));

  it('falha de rede vira erro com "tentar de novo" — nunca lista vazia silenciosa', () => {
    const fixture = TestBed.createComponent(Cores);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === BASE)
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.estado--erro')?.textContent).toContain(
      'Não foi possível carregar o catálogo de cores',
    );
    expect(el.querySelector('table.tabela')).toBeNull();
  });

  // --- Fronteira da task: o que a 06b traz NÃO pode aparecer aqui ---

  it('a lista não promete o que ainda não faz: sem "Nova cor", sem "Ações", sem ordenação', () => {
    const el = iniciar([cinza, azul]).nativeElement as HTMLElement;

    expect(el.querySelector('.placa__acao')).toBeNull();
    expect(el.textContent).not.toContain('Nova cor');
    expect(Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).not.toContain(
      'Ações',
    );
    // Sem afordance de ordenação em NENHUM breakpoint (§10 #30e): nem `<th>` clicável, nem select.
    expect(el.querySelector('.tabela__ord')).toBeNull();
    expect(el.querySelector('.tabela-ordenar')).toBeNull();
    expect(el.querySelector('select')).toBeNull();
  });
});
