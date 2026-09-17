import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { WritableSignal, signal } from '@angular/core';
import { of } from 'rxjs';

import { Movimentacoes } from './movimentacoes';
import { ConfirmarEstorno } from './confirmar-estorno/confirmar-estorno';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { Movimentacao, PaginaResponse } from '../../core/models/produto.model';

/**
 * T-M7-07 — ação ESTORNAR na tela de Movimentações (SPEC-M7 §3.11-d, CA-39/CA-40).
 *
 * Spec NOVO: não toca nenhum herdado (§12 #0). Ver a nota do `movimentacoes.tabela.spec.ts` sobre o
 * `registerLocaleData` — sem ele o `| date: … : 'pt-BR'` explode num `--include` isolado.
 *
 * Dados FICTÍCIOS (LGPD): nomes de planta / "Sítio Boa Flor".
 */
describe('Movimentacoes — estornar (T-M7-07, §3.11-d)', () => {
  let httpMock: HttpTestingController;
  let dialog: jasmine.SpyObj<MatDialog>;
  let ehAdmin: WritableSignal<boolean>;
  const BASE = 'http://localhost:8080/api/v1/movimentacoes';

  registerLocaleData(localePt, 'pt-BR');

  /** SAÍDA de 12 un com desconto: bruto 186,00 e final 167,40 (os números do CA-31). */
  const saida: Movimentacao = {
    id: 87,
    produtoId: 5,
    produtoNome: 'Rosa Vermelha',
    tipo: 'SAIDA',
    quantidade: 12,
    quantidadeResultante: 88,
    motivo: 'Venda balcão',
    usuarioId: 3,
    usuarioNome: 'Ana',
    criadoEm: '2026-09-03T17:05:00Z',
    valorUnitario: 15.5,
    descontoTipo: 'PERCENTUAL',
    descontoValor: 10,
    totalBruto: 186.0,
    totalFinal: 167.4,
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Movimentacao[]): PaginaResponse<Movimentacao> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 20,
      totalElementos: conteudo.length,
      totalPaginas: 1,
      primeira: true,
      ultima: true,
    };
  }

  function iniciar(conteudo: Movimentacao[] = [saida]): ComponentFixture<Movimentacoes> {
    const fixture = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo)));
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    ehAdmin = signal(true);
    dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of('Valor digitado errado.') } as any);
    TestBed.configureTestingModule({
      imports: [Movimentacoes],
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

  it('CA-39: ADMIN vê o botão "Estornar" na coluna Ações', () => {
    const el = iniciar().nativeElement as HTMLElement;
    expect(el.querySelector('.lancamento__estornar')).toBeTruthy();
  });

  it('CA-39 (o outro lado): USER NÃO vê o botão "Estornar"', () => {
    ehAdmin.set(false);
    const el = iniciar().nativeElement as HTMLElement;
    expect(el.querySelector('.lancamento__estornar')).toBeNull();
    // e a ação de leitura continua lá para o USER — o RBAC recorta o que grava, não o que lê.
    expect(el.querySelector('.lancamento__ver')).toBeTruthy();
  });

  it('CA-39: confirmar dispara UM POST /movimentacoes/87/estorno com {motivo} e recarrega a lista', () => {
    const fixture = iniciar();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.lancamento__estornar') as HTMLButtonElement).click();

    const req = httpMock.expectOne(`${BASE}/87/estorno`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ motivo: 'Valor digitado errado.' });
    req.flush(envelope({ ...saida, id: 91, tipo: 'ENTRADA', estornaMovimentacaoId: 87 }));

    // Sucesso recarrega a página atual: a linha nova aparece no topo e a original permanece (D-A).
    const recarga = httpMock.expectOne((r) => r.url === BASE && r.method === 'GET');
    recarga.flush(envelope(pagina([{ ...saida, id: 91, estornaMovimentacaoId: 87 }, saida])));
    fixture.detectChanges();
    expect(el.querySelectorAll('.lancamento').length).toBe(2);
    expect(el.querySelector('.selo-estorno')).toBeTruthy();
  });

  it('CA-40: 409 mostra a mensagem DO ENVELOPE e a linha CONTINUA na lista', () => {
    const fixture = iniciar();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.lancamento__estornar') as HTMLButtonElement).click();

    httpMock.expectOne(`${BASE}/87/estorno`).flush(
      {
        success: false,
        data: null,
        error: { code: 'CONFLICT', message: 'Este lançamento já foi estornado.', details: [] },
        timestamp: '',
        path: '',
      },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(el.querySelector('.estorno-erro')!.textContent).toContain(
      'Este lançamento já foi estornado.',
    );
    // A recusa NÃO pode sumir com a linha: remover otimistamente inventaria um efeito que o
    // servidor recusou. E a tabela continua de pé (o banner não substitui a lista).
    expect(el.querySelectorAll('.lancamento').length).toBe(1);
  });

  it('CA-39: cancelar o diálogo (Esc/backdrop) NÃO dispara requisição nenhuma', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
    const el = iniciar().nativeElement as HTMLElement;
    (el.querySelector('.lancamento__estornar') as HTMLButtonElement).click();
    // `httpMock.verify()` no afterEach reprova qualquer POST solto.
    expect(el.querySelector('.estorno-erro')).toBeNull();
  });

  it('§3.4-d: AJUSTE, linha que já é estorno e produto excluído não oferecem o botão', () => {
    const el = iniciar([
      { ...saida, id: 1, tipo: 'AJUSTE' },
      { ...saida, id: 2, estornaMovimentacaoId: 87 },
      { ...saida, id: 3, produtoId: null },
    ]).nativeElement as HTMLElement;
    // Os 3 casos são 409 no back (§3.4-d): a tela não oferece gatilho que só pode falhar.
    expect(el.querySelectorAll('.lancamento').length).toBe(3);
    expect(el.querySelectorAll('.lancamento__estornar').length).toBe(0);
  });
});

/**
 * O diálogo em si (§3.11-d): motivo obrigatório 3..255 (PA#2) e o resumo do que SERÁ CRIADO.
 * Testado direto, sem a lista — é onde mora a regra do valor que não se recalcula.
 */
describe('ConfirmarEstorno — diálogo (T-M7-07, §3.11-d/PA#2)', () => {
  let ref: jasmine.SpyObj<MatDialogRef<ConfirmarEstorno, string | undefined>>;

  const saida: Movimentacao = {
    id: 87,
    produtoId: 5,
    produtoNome: 'Rosa Vermelha',
    tipo: 'SAIDA',
    quantidade: 12,
    quantidadeResultante: 88,
    motivo: 'Venda balcão',
    usuarioId: 3,
    usuarioNome: 'Ana',
    criadoEm: '2026-09-03T17:05:00Z',
    valorUnitario: 15.5,
    descontoTipo: 'PERCENTUAL',
    descontoValor: 10,
    totalBruto: 186.0,
    totalFinal: 167.4,
  };

  function montar(m: Movimentacao): ComponentFixture<ConfirmarEstorno> {
    ref = jasmine.createSpyObj<MatDialogRef<ConfirmarEstorno, string | undefined>>('MatDialogRef', [
      'close',
    ]);
    TestBed.configureTestingModule({
      imports: [ConfirmarEstorno],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: { movimentacao: m } },
      ],
    });
    const fixture = TestBed.createComponent(ConfirmarEstorno);
    fixture.detectChanges();
    return fixture;
  }

  /** Espaço DURO do `Intl` de moeda normalizado — senão a falha sai como 'R$ x' vs 'R$ x'. */
  function texto(el: Element | null): string {
    return (el?.textContent ?? '').replace(/\s+/g, ' ').replace(/ /g, ' ').trim();
  }

  it('§3.11-d: o resumo usa o `totalFinal` GRAVADO (com desconto), nunca recalcula quantidade × unitário', () => {
    // 12 × R$ 15,50 = R$ 186,00 de BRUTO; com 10 % o que valeu foi R$ 167,40. Se a tela multiplicar
    // aqui, ela mostra R$ 186,00 e mente sobre o que será revertido — e teria reintroduzido a
    // aritmética do §3.2-b no navegador, que é justamente o que o back existe para não deixar.
    const el = montar(saida).nativeElement as HTMLElement;
    const resumo = texto(el.querySelector('.alerta__pergunta'));
    expect(resumo).toContain('R$ 167,40');
    expect(resumo).not.toContain('R$ 186,00');
    // E a linha invertida é anunciada como ENTRADA (a original é SAÍDA) — §3.4-a.
    expect(texto(el.querySelector('.estorno__produto'))).toBe('Rosa Vermelha');
    expect(resumo).toContain('Entrada');
  });

  it('§4.4: lançamento SEM dinheiro não inventa "R$ 0,00" — o resumo omite o valor', () => {
    const el = montar({ ...saida, valorUnitario: null, totalBruto: null, totalFinal: null })
      .nativeElement as HTMLElement;
    const resumo = texto(el.querySelector('.alerta__pergunta'));
    expect(resumo).not.toContain('R$');
    expect(resumo).toContain('Rosa Vermelha');
  });

  it('PA#2: motivo vazio NÃO fecha o diálogo (obrigatório)', () => {
    const fixture = montar(saida);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.estorno__confirmar') as HTMLButtonElement).click();
    expect(ref.close).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(el.querySelector('mat-error')!.textContent).toContain('Informe o motivo');
  });

  it('PA#2: motivo de 2 caracteres NÃO fecha (min 3, igual ao back)', () => {
    const fixture = montar(saida);
    const el = fixture.nativeElement as HTMLElement;
    const campo = el.querySelector('textarea') as HTMLTextAreaElement;
    campo.value = 'ab';
    campo.dispatchEvent(new Event('input'));
    (el.querySelector('.estorno__confirmar') as HTMLButtonElement).click();
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('PA#2: motivo válido fecha devolvendo o texto (com trim)', () => {
    const fixture = montar(saida);
    const el = fixture.nativeElement as HTMLElement;
    const campo = el.querySelector('textarea') as HTMLTextAreaElement;
    campo.value = '  Valor digitado errado.  ';
    campo.dispatchEvent(new Event('input'));
    (el.querySelector('.estorno__confirmar') as HTMLButtonElement).click();
    expect(ref.close).toHaveBeenCalledWith('Valor digitado errado.');
  });

  it('cancelar fecha com undefined (a lista-mãe não dispara nada)', () => {
    const fixture = montar(saida);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.botao-secundario') as HTMLButtonElement).click();
    expect(ref.close).toHaveBeenCalledWith(undefined);
  });
});
