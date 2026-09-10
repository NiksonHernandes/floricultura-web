import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { Produtos } from './produtos';
import { ConfirmarExclusao } from './confirmar-exclusao/confirmar-exclusao';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse, Produto } from '../../core/models/produto.model';

/**
 * T-M6-07 (SPEC-M6 §3.10, CA-28). Spec NOVO; nenhum herdado tocado. Trava a razão de o expansor
 * ser `<details>` e não `MatMenu` (AD-SQ-85 / §12 #10): o conteúdo do MatMenu só entra no DOM ao
 * abrir e asserções herdadas clicam direto em `.vaso__editar`/`.vaso__excluir` sem abrir nada.
 * A contagem de colunas é media query (Karma não controla o viewport): §10 #18 e prints do #33.
 */
describe('Produtos — grid e ações compactas (T-M6-07, CA-28)', () => {
  let httpMock: HttpTestingController;
  let ehAdmin: WritableSignal<boolean>;
  let dialog: jasmine.SpyObj<MatDialog>;

  const BASE = 'http://localhost:8080/api/v1/produtos';

  const base: Produto = {
    id: 1,
    nome: 'Rosa Vermelha',
    descricao: 'Maço com 12 hastes',
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 25,
    preco: 4.5,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-10T14:00:00Z',
    atualizadoEm: '2026-09-10T14:00:00Z',
    temImagem: false,
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function iniciar(): ComponentFixture<Produtos> {
    const fixture = TestBed.createComponent(Produtos);
    fixture.detectChanges();
    const dados: PaginaResponse<Produto> = {
      conteudo: [base],
      pagina: 0,
      tamanho: 12,
      totalElementos: 1,
      totalPaginas: 1,
      primeira: true,
      ultima: true,
    };
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(dados));
    fixture.detectChanges();
    return fixture;
  }

  /** O expansor nasce FECHADO — é a condição dos testes herdados. */
  function expansor(el: HTMLElement): HTMLDetailsElement {
    const mais = el.querySelector('details.vaso__mais') as HTMLDetailsElement;
    expect(mais.open).toBeFalse();
    return mais;
  }

  beforeEach(() => {
    ehAdmin = signal(true);
    dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
    TestBed.configureTestingModule({
      imports: [Produtos],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { ehAdmin } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('as ações cabem em UMA linha: Visualizar/Movimentar fora, Editar/Excluir no expansor', () => {
    const el = iniciar().nativeElement as HTMLElement;
    const acoes = el.querySelector('.vaso__acoes') as HTMLElement;

    // Filhos diretos da fileira: 2 botões + o expansor (nada de 4 botões empilhados).
    expect(acoes.children.length).toBe(3);
    expect(acoes.querySelector(':scope > .vaso__visualizar')).toBeTruthy();
    expect(acoes.querySelector(':scope > .vaso__movimentar')).toBeTruthy();

    const mais = expansor(el);
    const rotulo = mais.querySelector('summary')?.getAttribute('aria-label');
    expect(rotulo).toBe(`Mais ações de ${base.nome}`);
    expect(mais.querySelector('.vaso__editar')).toBeTruthy();
    expect(mais.querySelector('.vaso__excluir')).toBeTruthy();

    // Contrato de marcação do `_card-compacto`: `.vaso__meta` contém, o par é `.meta dt/dd`.
    const pares = el.querySelectorAll('.vaso__meta .meta');
    expect(pares.length).toBe(2); // Estoque · Preço de venda
    expect(pares[0].querySelector('dt')?.textContent).toContain('Estoque');
    expect(pares[0].querySelector('dd')).toBeTruthy();
  });

  it('com o expansor FECHADO, .vaso__editar segue no DOM e o clique abre o form', () => {
    const fixture = iniciar();
    const el = fixture.nativeElement as HTMLElement;
    expansor(el);

    (el.querySelector('.vaso__editar') as HTMLButtonElement).click();
    // "Editar" busca o detalhe antes de abrir o form (M3): atender o GET /produtos/{id}.
    httpMock.expectOne((r) => r.url === `${BASE}/${base.id}`).flush(envelope(base));
    fixture.detectChanges();

    expect(el.querySelector('app-produto-form')).toBeTruthy();
  });

  it('com o expansor FECHADO, .vaso__excluir segue no DOM e o clique abre a confirmação', () => {
    const el = iniciar().nativeElement as HTMLElement;
    expansor(el);

    (el.querySelector('.vaso__excluir') as HTMLButtonElement).click();

    expect(dialog.open).toHaveBeenCalledWith(
      ConfirmarExclusao,
      jasmine.objectContaining({ data: { nome: base.nome } }),
    );
  });

  it('agir dentro do expansor o fecha de volta (a próxima ação não fica atrás do menu)', () => {
    const fixture = iniciar();
    const el = fixture.nativeElement as HTMLElement;
    const mais = expansor(el);

    mais.open = true;
    (el.querySelector('.vaso__excluir') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(mais.open).toBeFalse();
  });
});
