import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { Produtos } from './produtos';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse, Produto } from '../../core/models/produto.model';

/**
 * T-M4-6 (CA-12): badge "sazonal" no card quando `sazonal===true`. Spec NOVO — não toca o
 * produtos.spec do M2/M3 (anti-burla). `EventosService` NÃO é provido aqui: a injeção opcional
 * de Produtos retorna null → nenhum `GET /eventos` é disparado (os specs seguem determinísticos).
 */
describe('Produtos — badge sazonal (T-M4-6, CA-12)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/produtos';

  const base: Produto = {
    id: 1,
    nome: 'Rosa Vermelha',
    descricao: null,
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 25,
    preco: null,
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

  function iniciar(conteudo: Produto[]): ComponentFixture<Produtos> {
    const fixture = TestBed.createComponent(Produtos);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo)));
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    const dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
    TestBed.configureTestingModule({
      imports: [Produtos],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { ehAdmin: signal(false) } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('exibe o selo "Sazonal" quando sazonal é true (CA-12)', () => {
    const el = iniciar([{ ...base, sazonal: true }]).nativeElement as HTMLElement;
    const selo = el.querySelector('.selo-sazonal');
    expect(selo).toBeTruthy();
    expect(selo?.textContent).toContain('Sazonal');
  });

  it('NÃO exibe o selo quando sazonal é false/ausente', () => {
    const el = iniciar([{ ...base, sazonal: false }]).nativeElement as HTMLElement;
    expect(el.querySelector('.selo-sazonal')).toBeNull();
  });
});
