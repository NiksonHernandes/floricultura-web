import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';

import { Produtos } from './produtos';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse, Produto } from '../../core/models/produto.model';

/**
 * A2 — SPEC-M6.1 §3.2 (CA-7, CA-8). Spec NOVO; nenhum herdado tocado.
 *
 * A borda de alerta já existia e era invisível (dália diluída a 40%). O que este arquivo trava é a
 * regra do R8: a borda do card em alerta é **a mesma tinta do selo**, medida por `getComputedStyle`
 * — comparação **selo × borda**, sem um único hex literal aqui dentro. Se a paleta mudar de novo
 * (o `--dalia` já mudou uma vez), o teste continua válido; se alguém devolver o `color-mix`, ele
 * fica vermelho. O card normal é o outro lado: 1px e uma cor que NÃO é a do selo.
 */
describe('Produtos — borda do card com estoque baixo (A2, CA-7/CA-8)', () => {
  let httpMock: HttpTestingController;
  let ehAdmin: WritableSignal<boolean>;

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

  function iniciar(produtos: Produto[]): ComponentFixture<Produtos> {
    const fixture = TestBed.createComponent(Produtos);
    fixture.detectChanges();
    const dados: PaginaResponse<Produto> = {
      conteudo: produtos,
      pagina: 0,
      tamanho: 12,
      totalElementos: produtos.length,
      totalPaginas: 1,
      primeira: true,
      ultima: true,
    };
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(dados));
    fixture.detectChanges();
    return fixture;
  }

  /** A tinta do selo é a referência da borda (R8) — nunca um hex escrito no spec. */
  function tintaDoSelo(el: HTMLElement): string {
    const selo = el.querySelector('.selo-baixo') as HTMLElement;
    expect(selo).withContext('o card em alerta precisa exibir o selo').toBeTruthy();
    return getComputedStyle(selo).backgroundColor;
  }

  beforeEach(() => {
    ehAdmin = signal(true);
    TestBed.configureTestingModule({
      imports: [Produtos],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { ehAdmin } },
        {
          provide: MatDialog,
          useValue: { open: () => ({ afterClosed: () => ({ subscribe: () => undefined }) }) },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('card com estoqueBaixo: borda de 2px na MESMA tinta do selo', () => {
    const el = iniciar([
      { ...base, id: 1, nome: 'Rosa Vermelha', estoqueAtual: 3, estoqueBaixo: true },
    ]).nativeElement as HTMLElement;

    const alerta = el.querySelector('.vaso--alerta') as HTMLElement;
    const estilo = getComputedStyle(alerta);

    expect(estilo.borderWidth).toBe('2px');
    expect(estilo.borderColor).toBe(tintaDoSelo(alerta));
  });

  it('card sem alerta: 1px e uma cor que NÃO é a do selo (o outro lado)', () => {
    const el = iniciar([
      { ...base, id: 1, nome: 'Rosa Vermelha', estoqueAtual: 3, estoqueBaixo: true },
      { ...base, id: 2, nome: 'Girassol', estoqueAtual: 40, estoqueBaixo: false },
    ]).nativeElement as HTMLElement;

    const cards = Array.from(el.querySelectorAll('li.vaso')) as HTMLElement[];
    const normal = cards.find((c) => !c.classList.contains('vaso--alerta')) as HTMLElement;
    const estilo = getComputedStyle(normal);

    expect(normal.querySelector('.selo-baixo')).toBeNull();
    expect(estilo.borderWidth).toBe('1px');
    expect(estilo.borderColor).not.toBe(tintaDoSelo(el));
  });

  it('estoque ZERADO também recebe a borda (FC-13: `atual <= minimo` inclui o zero)', () => {
    const el = iniciar([
      {
        ...base,
        id: 3,
        nome: 'Lírio Branco',
        estoqueAtual: 0,
        estoqueMinimo: 0,
        estoqueBaixo: true,
      },
    ]).nativeElement as HTMLElement;

    const alerta = el.querySelector('.vaso--alerta') as HTMLElement;
    expect(alerta).withContext('produto zerado tem de entrar em alerta').toBeTruthy();

    const estilo = getComputedStyle(alerta);
    expect(estilo.borderWidth).toBe('2px');
    expect(estilo.borderColor).toBe(tintaDoSelo(alerta));
  });
});
