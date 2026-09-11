import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { Produtos } from '../../features/produtos/produtos';
import { Clientes } from '../../features/clientes/clientes';
import { ClientesService } from '../../features/clientes/clientes.service';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse, Produto } from '../../core/models/produto.model';
import { Cliente } from '../../core/models/cliente.model';

/**
 * T-M6-A1 / CA-43 (SPEC-M6 §3.8d, AD-SQ-106) — REVERSÃO da tipografia ao estado pré-M6.
 *
 * Arquivo NOVO (adição pura: nenhum spec herdado é tocado). Por que ele existe:
 *
 * O M6 "consertou" 23 declarações `font: <peso> <tam>/<lh> var(--mat-sys-body-*)` trocando o
 * shorthand do tema pelo token `--corpo` (D1/AD-SQ-93). Só que a forma antiga é CSS INVÁLIDO — o
 * navegador DESCARTA a declaração inteira —, então em `develop` aqueles selos e valores nunca
 * aplicaram o peso/tamanho escritos: eles HERDAVAM do contêiner. Ao validar a declaração, o card
 * ganhou negrito e os selos encolheram, e o dono recusou o resultado.
 *
 * Reverter, portanto, é reescrever a declaração INVÁLIDA de propósito — e isso só se prova
 * MEDINDO o render. Grep não distingue "escrito" de "aplicado"; `getComputedStyle` sim.
 * Este spec falha se alguém "consertar" o CSS inválido de novo, por reflexo de qualidade.
 *
 * Dados FICTÍCIOS (LGPD): "Maria Flores", `@exemplo.com.br`, `(11) 90000-0000`.
 */
describe('T-M6-A1/CA-43 — tipografia pré-M6 restaurada (medição de render)', () => {
  let httpMock: HttpTestingController;
  let ehAdmin: WritableSignal<boolean>;

  /** px de 1rem no runner — não presumir 16px. */
  const rem = () =>
    parseFloat(getComputedStyle(document.documentElement).fontSize);

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina<T>(conteudo: T[]): PaginaResponse<T> {
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

  function providers() {
    const dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
    return [
      provideNoopAnimations(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: { ehAdmin } },
      { provide: MatDialog, useValue: dialog },
    ];
  }

  beforeEach(() => {
    ehAdmin = signal(true);
  });

  afterEach(() => httpMock.verify());

  const estilo = (raiz: HTMLElement, seletor: string) =>
    getComputedStyle(raiz.querySelector(seletor) as HTMLElement);

  // ---- Card de produto (§3.8d tabela B) ---------------------------------------------------------

  describe('card de produto', () => {
    const produto: Produto = {
      id: 1,
      nome: 'Rosa Vermelha',
      descricao: 'Maço com 12 hastes',
      unidadeMedida: 'un',
      estoqueMinimo: 10,
      estoqueAtual: 3,
      preco: 4.5,
      imagemUrl: null,
      estoqueBaixo: true,
      ativo: true,
      criadoEm: '2026-09-10T14:00:00Z',
      atualizadoEm: '2026-09-10T14:00:00Z',
      temImagem: false,
    };

    let el: HTMLElement;

    beforeEach(() => {
      TestBed.configureTestingModule({
        imports: [Produtos],
        providers: providers(),
      });
      httpMock = TestBed.inject(HttpTestingController);
      const fixture: ComponentFixture<Produtos> =
        TestBed.createComponent(Produtos);
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url === 'http://localhost:8080/api/v1/produtos')
        .flush(envelope(pagina([produto])));
      fixture.detectChanges();
      el = fixture.nativeElement as HTMLElement;
    });

    it('valor da etiqueta e selo de estoque HERDAM peso/tamanho do contêiner (sem negrito)', () => {
      const dd = estilo(el, '.meta dd');
      const corpo = estilo(el, '.vaso__corpo');

      // Se a declaração restaurada voltasse a ser VÁLIDA, o dd viria 600 / 0.95rem (e, na leva 1,
      // 700 / 1.05rem via --txt-valor-forte). Herdar é a prova de que ela é descartada.
      expect(dd.fontWeight)
        .withContext('peso do .meta dd')
        .toBe(corpo.fontWeight);
      expect(dd.fontSize)
        .withContext('tamanho do .meta dd')
        .toBe(corpo.fontSize);
      expect(dd.fontWeight)
        .withContext('o negrito que o dono reprovou')
        .not.toBe('700');
      expect(dd.fontWeight).not.toBe('600');
      expect(parseFloat(dd.fontSize)).not.toBeCloseTo(0.95 * rem(), 1);

      const selo = estilo(el, '.selo-baixo');
      const vaso = estilo(el, '.vaso');

      expect(selo.fontWeight)
        .withContext('peso do .selo-baixo')
        .toBe(vaso.fontWeight);
      expect(selo.fontSize)
        .withContext('tamanho do .selo-baixo')
        .toBe(vaso.fontSize);
      expect(selo.fontWeight).not.toBe('700');
      expect(selo.fontWeight).not.toBe('600');
      // 0.72rem é o tamanho que a leva 1 aplicou ao encolher o selo.
      expect(parseFloat(selo.fontSize)).not.toBeCloseTo(0.72 * rem(), 1);

      // Exceção declarada do §3.8d: o clamp do nome fica, mas o PESO e a FAMÍLIA são os de
      // `develop` — 600 em Fraunces. A reversão não pode ter mexido neles.
      const nome = estilo(el, '.vaso__nome');
      expect(nome.fontFamily)
        .withContext('família do .vaso__nome')
        .toContain('Fraunces');
      expect(nome.fontWeight).withContext('peso do .vaso__nome').toBe('600');
    });
  });

  // ---- Tabela de contatos (§3.8d tabela C — superfície nova herda a ficha pré-M6) ---------------

  describe('tabela de clientes', () => {
    const maria: Cliente = {
      id: 7,
      nome: 'Maria Flores',
      telefone: '(11) 90000-0000',
      email: 'maria@exemplo.com.br',
      observacoes: 'Prefere arranjos de outono.',
      produtoIds: null,
      criadoEm: '2026-09-04T14:05:00Z',
      atualizadoEm: '2026-09-04T14:05:00Z',
    };

    let el: HTMLElement;

    beforeEach(() => {
      TestBed.configureTestingModule({
        imports: [Clientes],
        providers: [...providers(), ClientesService],
      });
      httpMock = TestBed.inject(HttpTestingController);
      const fixture: ComponentFixture<Clientes> =
        TestBed.createComponent(Clientes);
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url === 'http://localhost:8080/api/v1/clientes')
        .flush(envelope(pagina([maria])));
      fixture.detectChanges();
      el = fixture.nativeElement as HTMLElement;
    });

    it('a célula é o corpo de texto do app: peso 400 e ~0.875rem (nunca os 500/0.85rem densos)', () => {
      const td = estilo(el, 'tbody td[data-rotulo]');
      expect(td.fontWeight).toBe('400');
      expect(parseFloat(td.fontSize)).toBeCloseTo(0.875 * rem(), 1);
    });

    // ⚠️ CASO AJUSTADO na T-M6-A2 (item 2), NÃO apagado — edição autorizada pelo humano em
    // `squad/.permitir-edicao-teste`. Ele nasceu na T-M6-A1 cravando "Fraunces 600" porque o CA-43
    // manda restaurar o pré-M6. DEPOIS disso, e olhando a tela pronta, o dono pediu: "remova o
    // negrito dos nomes de fornecedores e clientes… Remova o negrito e volte a fonte que era antes".
    // Pedido posterior e específico à TABELA vence o CA-43 neste ponto; as demais asserções deste
    // arquivo (a reversão da tipografia) continuam intactas e valendo.
    // A natureza do caso não mudou: ele segue MEDINDO o render e segue pegando regressão — só que
    // agora a regressão a pegar é a VOLTA do destaque (negrito/serifa/corpo maior) na 1ª coluna.
    it('o nome não se destaca: mesma fonte e peso das demais células (sem negrito, sem serifa)', () => {
      const td = estilo(el, 'tbody td[data-rotulo]');

      // ⚠️ DOIS elementos, não um (§10 #38(c), revisão 11). Medir só o `<td>` deixa passar o
      // destaque reintroduzido no `<span>` que PINTA o texto: mutando
      // `.ficha__nome { font: 600 1.1rem/1.2 var(--display) }` o caso passava. Quem renderiza o
      // nome é o `.ficha__nome`; o `.tabela__titulo` é a célula que o contém.
      for (const seletor of ['.tabela__titulo', '.ficha__nome']) {
        const nome = estilo(el, seletor);

        expect(nome.fontFamily)
          .withContext(`família de ${seletor} vs. família da célula comum`)
          .toBe(td.fontFamily);
        expect(nome.fontFamily)
          .withContext(`a serifa de display não entra em ${seletor}`)
          .not.toContain('Fraunces');

        expect(nome.fontWeight)
          .withContext(`peso de ${seletor} vs. peso da célula comum`)
          .toBe(td.fontWeight);
        expect(nome.fontWeight)
          .withContext(`o negrito que o dono mandou remover (${seletor})`)
          .toBe('400');

        expect(nome.fontSize)
          .withContext(`tamanho de ${seletor} vs. tamanho da célula comum`)
          .toBe(td.fontSize);
        // 1.1rem era o corpo do destaque anterior: se ele voltar, este caso cai.
        expect(parseFloat(nome.fontSize)).not.toBeCloseTo(1.1 * rem(), 1);
      }
    });

    // §10 #46 (AD-SQ-105) — guarda do reset que faz a SETA ser um ícone, e não a palavra.
    // A ligadura do Material Icons é case-sensitive: o `text-transform: uppercase` do eyebrow de
    // cabeçalho é herdado pelo `<mat-icon>` e transformaria `arrow_upward` em `ARROW_UPWARD`,
    // que a fonte não conhece — a seta renderizaria como TEXTO. Isso já foi P1 uma vez, e até
    // aqui a única prova viva era o glifo no print desktop (§10 #39), que depende do smoke.
    it('a seta de ordenação não herda o versalete do cabeçalho (senão vira a palavra "ARROW_UPWARD")', () => {
      const th = el.querySelector('thead th') as HTMLElement;
      const icone = el.querySelector('.tabela__ord mat-icon') as HTMLElement;

      expect(icone).withContext('a seta da coluna ordenada está no DOM').toBeTruthy();
      expect(getComputedStyle(icone).textTransform)
        .withContext('text-transform do mat-icon dentro do .tabela__ord')
        .toBe('none');
      expect(getComputedStyle(th).textTransform)
        .withContext('o rótulo da coluna continua em versalete')
        .toBe('uppercase');
    });
  });
});
