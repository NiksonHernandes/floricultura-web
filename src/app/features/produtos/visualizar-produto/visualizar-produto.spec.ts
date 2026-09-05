import { ComponentFixture, TestBed } from '@angular/core/testing';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { VisualizarProduto, VisualizarProdutoDados } from './visualizar-produto';
import { ApiResponse } from '../../../core/models/api-response.model';
import {
  Movimentacao,
  PaginaResponse,
  Produto,
  ProdutoRelacionamentos,
} from '../../../core/models/produto.model';

/**
 * RF-4 (REVISÃO 2026-09-04/AD-SQ-66) — modal "Visualizar produto". Spec NOVO. Testa contra o CONTRATO
 * (§R3.5: `GET /produtos/{id}` reaproveitado + `GET /produtos/{id}/relacionamentos` novo; back RB-4
 * ainda não pronto) com `HttpTestingController`. Dados FICTÍCIOS (LGPD): "Sítio Boa Flor"/"Maria Flores".
 *
 * `temImagem:false` nos fixtures → o `<app-imagem-produto>` cai no placeholder e NÃO dispara GET de
 * binário, mantendo o `httpMock.verify()` limpo (só a ficha e os relacionamentos trafegam).
 */
// CA-9: o DatePipe com locale 'pt-BR' exige a locale data registrada (app.config.ts faz em runtime;
// no teste registramos aqui para a asserção de data+hora pt-BR rodar) — espelho do movimentar-estoque.spec.
registerLocaleData(localePt, 'pt-BR');

describe('VisualizarProduto (RF-4, R-CA-10)', () => {
  let httpMock: HttpTestingController;
  let ref: jasmine.SpyObj<MatDialogRef<VisualizarProduto>>;
  const BASE = 'http://localhost:8080/api/v1/produtos';

  const produto: Produto = {
    id: 5,
    nome: 'Rosa Vermelha',
    descricao: 'Rosa de haste longa, cor intensa.',
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 20,
    preco: 12.5,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-02T14:00:00Z',
    atualizadoEm: '2026-09-02T14:00:00Z',
    temImagem: false,
  };

  const relacFull: ProdutoRelacionamentos = {
    eventos: [{ id: 1, nome: 'Dia das Mães' }],
    fornecedores: [{ id: 3, nome: 'Sítio Boa Flor' }],
    clientes: [{ id: 8, nome: 'Maria Flores' }],
  };

  const relacVazio: ProdutoRelacionamentos = { eventos: [], fornecedores: [], clientes: [] };

  // --- Movimentações recentes (T-M5.1-4/HISTÓRIA #4) — fixtures FICTÍCIOS (LGPD). ---
  const movEntrada: Movimentacao = {
    id: 200,
    produtoId: 5,
    produtoNome: 'Rosa Vermelha',
    tipo: 'ENTRADA',
    quantidade: 10,
    quantidadeResultante: 30,
    motivo: 'Reposição',
    usuarioId: 3,
    usuarioNome: 'Ana Estufa',
    fornecedorId: 7,
    fornecedorNome: 'Sítio das Flores',
    criadoEm: '2026-09-02T14:05:00Z',
  };
  const movSaida: Movimentacao = {
    id: 201,
    produtoId: 5,
    produtoNome: 'Rosa Vermelha',
    tipo: 'SAIDA',
    quantidade: 4,
    quantidadeResultante: 26,
    motivo: null,
    usuarioId: 3,
    usuarioNome: 'Ana Estufa',
    clienteId: 8,
    clienteNome: 'Maria Flores',
    criadoEm: '2026-09-02T15:00:00Z',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function paginaMov(conteudo: Movimentacao[]): PaginaResponse<Movimentacao> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 5,
      totalElementos: conteudo.length,
      totalPaginas: 1,
      primeira: true,
      ultima: true,
    };
  }

  function montar(
    detalhe: Produto = produto,
    relac: ProdutoRelacionamentos = relacVazio,
    movs: Movimentacao[] = [],
  ): ComponentFixture<VisualizarProduto> {
    const fixture = TestBed.createComponent(VisualizarProduto);
    fixture.detectChanges(); // ngOnInit → dispara ficha + relacionamentos
    httpMock.expectOne(`${BASE}/5`).flush(envelope(detalhe));
    httpMock.expectOne(`${BASE}/5/relacionamentos`).flush(envelope(relac));
    // A ficha carregada dispara as movimentações recentes (T-M5.1-4/CA-9).
    httpMock
      .expectOne((r) => r.url === `${BASE}/5/movimentacoes`)
      .flush(envelope(paginaMov(movs)));
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    ref = jasmine.createSpyObj<MatDialogRef<VisualizarProduto>>('MatDialogRef', ['close']);
    const dados: VisualizarProdutoDados = { produtoId: 5 };
    TestBed.configureTestingModule({
      imports: [VisualizarProduto],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: dados },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('(a) busca a ficha (GET /produtos/{id}) e mostra os dados próprios', () => {
    const el = montar().nativeElement as HTMLElement;
    expect(el.querySelector('.ficha__titulo')?.textContent).toContain('Rosa Vermelha');
    expect(el.textContent).toContain('Rosa de haste longa, cor intensa.'); // descrição
    expect(el.textContent).toContain('20 un'); // estoque + unidade
    expect(el.textContent).toContain('mín. 10'); // estoque mínimo
    expect(el.textContent).toContain('R$'); // preço presente
    expect(el.querySelector('app-imagem-produto')).toBeTruthy(); // foto pelo mesmo caminho do card
  });

  it('(b) mostra eventos, fornecedores e clientes quando relacionamentos retorna', () => {
    const el = montar(produto, relacFull).nativeElement as HTMLElement;
    expect(el.querySelector('.relacoes')).toBeTruthy();
    const chips = Array.from(el.querySelectorAll('.chip')).map((c) => c.textContent?.trim());
    expect(chips).toContain('Dia das Mães');
    expect(chips).toContain('Sítio Boa Flor');
    expect(chips).toContain('Maria Flores');
    expect(el.textContent).toContain('Eventos');
    expect(el.textContent).toContain('Fornecedores');
    expect(el.textContent).toContain('Clientes');
  });

  it('(c) seções vazias não aparecem (relacionamentos todos vazios)', () => {
    const el = montar(produto, relacVazio).nativeElement as HTMLElement;
    expect(el.querySelector('.relacoes')).toBeNull();
    expect(el.querySelectorAll('.chip').length).toBe(0);
  });

  it('(c) mostra só a seção que tem dados (só eventos)', () => {
    const el = montar(produto, {
      eventos: [{ id: 1, nome: 'Dia das Mães' }],
      fornecedores: [],
      clientes: [],
    }).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Eventos');
    expect(el.textContent).not.toContain('Fornecedores');
    expect(el.textContent).not.toContain('Clientes');
  });

  it('(d) preço nulo NÃO renderiza o campo de preço', () => {
    const el = montar({ ...produto, preco: null }).nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Preço');
    expect(el.textContent).not.toContain('R$');
  });

  it('erro na ficha mostra estado de erro com "Tentar de novo"', () => {
    const fixture = TestBed.createComponent(VisualizarProduto);
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/5`).flush(null, { status: 500, statusText: 'Server Error' });
    // relacionamentos ainda dispara no init; atende para manter o verify limpo.
    httpMock.expectOne(`${BASE}/5/relacionamentos`).flush(envelope(relacVazio));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.ficha__estado--erro')).toBeTruthy();
  });

  it('falha nos relacionamentos degrada em silêncio (ficha aparece, sem seções)', () => {
    const fixture = TestBed.createComponent(VisualizarProduto);
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/5`).flush(envelope(produto));
    httpMock
      .expectOne(`${BASE}/5/relacionamentos`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    // A ficha carregou (200) ⇒ as movimentações recentes disparam; atende para o verify limpo.
    httpMock.expectOne((r) => r.url === `${BASE}/5/movimentacoes`).flush(envelope(paginaMov([])));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.ficha__titulo')?.textContent).toContain('Rosa Vermelha');
    expect(el.querySelector('.relacoes')).toBeNull();
  });

  // --- Info-first + movimentações recentes (T-M5.1-4, CA-8/CA-9/CA-10) ---

  it('CA-8: dados aparecem ANTES da foto e a foto é thumbnail pequena (não .ficha__foto full-width)', () => {
    const el = montar().nativeElement as HTMLElement;
    // A foto full-width 16/10 anterior deixou de existir; agora é thumbnail.
    expect(el.querySelector('.ficha__foto')).toBeNull();
    const thumb = el.querySelector('.ficha__thumb');
    expect(thumb).toBeTruthy();
    expect(thumb!.querySelector('app-imagem-produto')).toBeTruthy();
    // Ordem no DOM: os dados vêm ANTES da foto (info-first).
    const dados = el.querySelector('.ficha__dados')!;
    const foto = el.querySelector('.ficha__thumb')!;
    expect(dados.compareDocumentPosition(foto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('CA-8 (guard de posicionamento): .ficha__thumb é containing block (position != static) — a foto absoluta NÃO escapa e engole o modal', () => {
    // Regressão de smoke (T-M5.1-4): `<app-imagem-produto>` é `position:absolute; inset:0`; sem um
    // ancestral posicionado ela ancora no painel do dialog e cobre header+dados. O thumb precisa ser
    // o containing block. Anexa ao body para o getComputedStyle resolver o CSS scoped do componente.
    const fixture = montar();
    const host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    try {
      const thumb = host.querySelector('.ficha__thumb') as HTMLElement;
      expect(getComputedStyle(thumb).position).toBe('relative');
    } finally {
      document.body.removeChild(host);
    }
  });

  it('CA-9: busca as últimas 3 (?pagina=0&tamanho=3 — AD-SQ-73) e renderiza tipo/qtd→resultante/autor/contraparte/data pt-BR', () => {
    const fixture = TestBed.createComponent(VisualizarProduto);
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/5`).flush(envelope(produto));
    httpMock.expectOne(`${BASE}/5/relacionamentos`).flush(envelope(relacVazio));
    const req = httpMock.expectOne((r) => r.url === `${BASE}/5/movimentacoes`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('pagina')).toBe('0');
    expect(req.request.params.get('tamanho')).toBe('3'); // HISTÓRIA #6: 5 → 3
    req.flush(envelope(paginaMov([movEntrada, movSaida])));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.movs .mov').length).toBe(2);
    const txt = el.querySelector('.movs')!.textContent!;
    expect(txt).toContain('Entrada'); // tipo pt-BR
    expect(txt).toContain('Saída');
    expect(txt).toContain('10'); // quantidade da ENTRADA
    expect(txt).toContain('30'); // resultante da ENTRADA
    expect(txt).toContain('Ana Estufa'); // autor
    expect(txt).toContain('Sítio das Flores'); // contraparte da ENTRADA (fornecedor, por nome)
    expect(txt).toContain('Maria Flores'); // contraparte da SAÍDA (cliente, por nome)
    // Data pt-BR em America/Sao_Paulo: '2026-09-02T14:05:00Z' (UTC) → 11:05 BRT.
    expect(el.querySelector('.mov__data')?.textContent?.trim()).toBe('02/09/2026 11:05');
  });

  it('CA-20: mais de 3 relacionamentos ⇒ no máximo 3 por categoria (slice(0,3) defensivo, sem reordenar)', () => {
    const cinco = (p: string) => Array.from({ length: 5 }, (_, i) => ({ id: i + 1, nome: `${p} ${i + 1}` }));
    const relac: ProdutoRelacionamentos = {
      eventos: cinco('Ev'),
      fornecedores: cinco('Forn'),
      clientes: cinco('Cli'),
    };
    const el = montar(produto, relac).nativeElement as HTMLElement;
    const blocos = el.querySelectorAll('.relacao');
    expect(blocos.length).toBe(3); // eventos + fornecedores + clientes
    blocos.forEach((b) => expect(b.querySelectorAll('.chip').length).toBe(3));
    // Não reordena: exibe os 3 PRIMEIROS de cada lista (a recência real vem do back — T-M5.1-7).
    expect(el.textContent).toContain('Ev 1');
    expect(el.textContent).toContain('Ev 3');
    expect(el.textContent).not.toContain('Ev 4');
  });

  it('CA-10: sem movimentações mostra "Nenhuma movimentação ainda." (não erro)', () => {
    const el = montar(produto, relacVazio, []).nativeElement as HTMLElement;
    expect(el.querySelector('.movs')).toBeTruthy();
    expect(el.querySelector('.movs__vazio')?.textContent).toContain('Nenhuma movimentação ainda.');
    expect(el.querySelectorAll('.movs .mov').length).toBe(0);
  });

  it('CA-10: falha das movimentações degrada em silêncio (a seção some, a ficha permanece)', () => {
    const fixture = TestBed.createComponent(VisualizarProduto);
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/5`).flush(envelope(produto));
    httpMock.expectOne(`${BASE}/5/relacionamentos`).flush(envelope(relacVazio));
    httpMock
      .expectOne((r) => r.url === `${BASE}/5/movimentacoes`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.movs')).toBeNull(); // seção some (sem mensagem de erro)
    expect(el.querySelector('.ficha__titulo')?.textContent).toContain('Rosa Vermelha'); // ficha intacta
  });

  it('o botão Fechar chama ref.close()', () => {
    const el = montar().nativeElement as HTMLElement;
    const botao = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Fechar'),
    ) as HTMLButtonElement;
    botao.click();
    expect(ref.close).toHaveBeenCalled();
  });
});
