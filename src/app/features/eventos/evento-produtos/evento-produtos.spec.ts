import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { EventoProdutos } from './evento-produtos';
import { EventosService } from '../eventos.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { PaginaResponse, Produto } from '../../../core/models/produto.model';
import { Evento } from '../../../core/models/evento.model';

/**
 * T-M4.1-2 (CA-3): a vitrine carrega a 1ª página de `GET /eventos/{id}/produtos` (tamanho=50),
 * renderiza cada flor com foto/nome/unidade/estoque e trata carregando/erro(tentar de novo)/vazio.
 * Produtos com `temImagem:false` e sem `imagemUrl` caem no placeholder — sem HTTP de imagem no teste.
 */
describe('EventoProdutos (vitrine — T-M4.1-2, CA-3)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/eventos';

  const evento: Evento = {
    id: 12,
    nome: 'Dia das Mães',
    tipo: 'COMEMORATIVA',
    dataInicio: '2026-05-10',
    dataFim: null,
    dataUnica: true,
    repeteTodoAno: true,
    descricao: null,
    criadoEm: '2026-09-03T13:00:00Z',
    atualizadoEm: '2026-09-03T13:00:00Z',
  };

  function flor(id: number, nome: string, over: Partial<Produto> = {}): Produto {
    return {
      id,
      nome,
      descricao: null,
      unidadeMedida: 'un',
      estoqueMinimo: 10,
      estoqueAtual: 88,
      preco: null,
      imagemUrl: null,
      estoqueBaixo: false,
      ativo: true,
      criadoEm: '',
      atualizadoEm: '',
      temImagem: false,
      sazonal: true,
      eventoIds: null,
      ...over,
    };
  }

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Produto[], total = conteudo.length): PaginaResponse<Produto> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 50,
      totalElementos: total,
      totalPaginas: Math.max(1, Math.ceil(total / 50)),
      primeira: true,
      ultima: total <= 50,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EventoProdutos],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        EventosService, // provido no app (não `providedIn:'root'`) — registramos no teste
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function iniciar(): ComponentFixture<EventoProdutos> {
    const fixture = TestBed.createComponent(EventoProdutos);
    fixture.componentRef.setInput('evento', evento);
    fixture.detectChanges(); // ngOnInit → carregar()
    return fixture;
  }

  it('carrega a 1ª página com tamanho=50 (PA#1) e lista cada flor com nome/unidade/estoque', () => {
    const fixture = iniciar();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/12/produtos`);
    expect(req.request.params.get('tamanho')).toBe('50');
    req.flush(envelope(pagina([flor(5, 'Rosa Vermelha'), flor(6, 'Girassol')])));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.flor').length).toBe(2);
    expect(el.textContent).toContain('Rosa Vermelha');
    expect(el.textContent).toContain('Girassol');
    expect(el.textContent).toContain('88 em estoque');
    expect(el.querySelectorAll('app-imagem-produto').length).toBe(2);
  });

  it('estado vazio quando o evento não tem flores (200 conteudo=[], não é erro)', () => {
    const fixture = iniciar();
    httpMock.expectOne((r) => r.url === `${BASE}/12/produtos`).flush(envelope(pagina([])));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.estado--vazio')).toBeTruthy();
    expect(el.querySelectorAll('.flor').length).toBe(0);
  });

  it('estado de erro com "Tentar de novo" que refaz o GET', () => {
    const fixture = iniciar();
    httpMock
      .expectOne((r) => r.url === `${BASE}/12/produtos`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.estado--erro')).toBeTruthy();
    (el.querySelector('.estado--erro button') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.url === `${BASE}/12/produtos`).flush(envelope(pagina([flor(5, 'Rosa')])));
    fixture.detectChanges();
    expect(el.querySelector('.estado--erro')).toBeNull();
    expect(el.querySelectorAll('.flor').length).toBe(1);
  });

  it('rodapé "mostrando 50 de N" só quando totalElementos > 50', () => {
    const fixture = iniciar();
    const muitas = Array.from({ length: 50 }, (_, i) => flor(i + 1, `Flor ${i + 1}`));
    httpMock.expectOne((r) => r.url === `${BASE}/12/produtos`).flush(envelope(pagina(muitas, 73)));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.vitrine__rodape')?.textContent).toContain('50 de 73');
  });

  it('estoque baixo sinaliza na classe --baixo', () => {
    const fixture = iniciar();
    httpMock
      .expectOne((r) => r.url === `${BASE}/12/produtos`)
      .flush(envelope(pagina([flor(5, 'Rosa', { estoqueBaixo: true, estoqueAtual: 2 })])));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.flor__estoque--baixo')).toBeTruthy();
  });

  it('o botão fechar emite (fechado) — o modal fecha por botão/Esc/véu (CA-3)', () => {
    const fixture = iniciar();
    httpMock.expectOne((r) => r.url === `${BASE}/12/produtos`).flush(envelope(pagina([])));
    fixture.detectChanges();

    let fechou = false;
    fixture.componentInstance.fechado.subscribe(() => (fechou = true));
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.vitrine__fechar') as HTMLButtonElement).click();
    expect(fechou).toBeTrue();
  });
});
