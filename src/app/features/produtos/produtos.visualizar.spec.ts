import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { Produtos } from './produtos';
import { VisualizarProduto } from './visualizar-produto/visualizar-produto';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse, Produto } from '../../core/models/produto.model';

/**
 * RF-4 (R-CA-10) — ação "Visualizar" no card de produto. Spec NOVO: não toca o `produtos.spec` (M2/M4).
 * Mesma montagem do herdado (EventosService NÃO provido → `<app-proximos-eventos>` fica inerte, sem GET).
 * "Visualizar" é para USER+ADMIN (fora do `@if ehAdmin`); abre o modal `VisualizarProduto` via MatDialog.
 */
describe('Produtos — ação Visualizar (RF-4, R-CA-10)', () => {
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
    criadoEm: '2026-09-02T14:00:00Z',
    atualizadoEm: '2026-09-02T14:00:00Z',
    temImagem: false,
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Produto[]): PaginaResponse<Produto> {
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

  function iniciar(): ComponentFixture<Produtos> {
    const fixture = TestBed.createComponent(Produtos);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base])));
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    ehAdmin = signal(false);
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

  it('USER (não-admin) vê "Visualizar" mas não as ações de escrita', () => {
    ehAdmin.set(false);
    const el = iniciar().nativeElement as HTMLElement;
    expect(el.querySelector('.vaso__visualizar')).toBeTruthy();
    expect(el.querySelector('.vaso__editar')).toBeNull();
    expect(el.querySelector('.vaso__excluir')).toBeNull();
  });

  it('ADMIN vê "Visualizar" ao lado das ações de escrita', () => {
    ehAdmin.set(true);
    const el = iniciar().nativeElement as HTMLElement;
    expect(el.querySelector('.vaso__visualizar')).toBeTruthy();
    expect(el.querySelector('.vaso__editar')).toBeTruthy();
  });

  it('clicar "Visualizar" abre o modal VisualizarProduto com o produtoId', () => {
    const el = iniciar().nativeElement as HTMLElement;
    (el.querySelector('.vaso__visualizar') as HTMLButtonElement).click();
    expect(dialog.open).toHaveBeenCalledWith(
      VisualizarProduto,
      jasmine.objectContaining({ data: { produtoId: 1 } }),
    );
  });
});
