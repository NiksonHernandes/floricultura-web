import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { ProdutoForm } from './produto-form';
import { ProdutosService } from '../produtos.service';
import { Movimentacao, Produto, ProdutoRequest, UnidadeMedida } from '../../../core/models/produto.model';

/** Valor completo do form no client (mistura strings e números; `''` = ainda não escolhido). */
interface FormValor {
  nome: string;
  descricao: string;
  unidadeMedida: UnidadeMedida | '';
  estoqueMinimo: number | null;
  preco: number | null;
  imagemUrl: string;
}

interface Probe {
  form: {
    setValue(v: FormValor): void;
    get(name: string): { hasError(k: string): boolean; getError(k: string): string } | null;
    readonly invalid: boolean;
  };
  /** Controle STANDALONE da entrada inicial (T-M2-11/AD-SQ-35) — fora do form group. */
  entradaInicial: { setValue(v: number | null): void };
  salvar(): void;
  enviando(): boolean;
  salvo: { subscribe(fn: (p: Produto) => void): void };
  /** Saída de falha parcial (T-M2-11/CA-22): produto criado, mas a ENTRADA inicial falhou. */
  entradaInicialFalhou: { subscribe(fn: () => void): void };
}

describe('ProdutoForm (T-M2-8, CA-20 — parte form)', () => {
  let serviceSpy: jasmine.SpyObj<Pick<ProdutosService, 'criar' | 'atualizar' | 'movimentar'>>;

  const rosa: Produto = {
    id: 10,
    nome: 'Rosa Vermelha',
    descricao: 'Maço com 12 hastes',
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 25,
    preco: 4.5,
    imagemUrl: 'https://exemplo.local/rosa.jpg',
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-02T14:00:00Z',
    atualizadoEm: '2026-09-02T14:00:00Z',
    temImagem: false,
  };

  /** Form mínimo válido em modo criação: só o obrigatório; opcionais vazios. */
  const minimo: FormValor = {
    nome: 'Girassol',
    descricao: '',
    unidadeMedida: 'un',
    estoqueMinimo: 5,
    preco: null,
    imagemUrl: '',
  };

  /** Payload §3.2 esperado no `POST /produtos` do form mínimo — 6 campos, SEM a entrada inicial. */
  const payloadMinimo: ProdutoRequest = {
    nome: 'Girassol',
    descricao: null,
    unidadeMedida: 'un',
    estoqueMinimo: 5,
    preco: null,
    imagemUrl: null,
  };

  /** Resposta da 2ª chamada (ENTRADA inicial) — não é asserida no conteúdo, só que ocorre. */
  const movEntrada: Movimentacao = {
    id: 100,
    produtoId: 10,
    produtoNome: 'Rosa Vermelha',
    tipo: 'ENTRADA',
    quantidade: 30,
    quantidadeResultante: 30,
    motivo: 'Estoque inicial (cadastro)',
    usuarioId: 3,
    criadoEm: '2026-09-02T14:05:00Z',
  };

  function montar(): Probe {
    const fixture = TestBed.createComponent(ProdutoForm);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Probe;
  }

  function montarEditando(p: Produto): ComponentFixture<ProdutoForm> {
    const fixture = TestBed.createComponent(ProdutoForm);
    fixture.componentRef.setInput('produto', p);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<Pick<ProdutosService, 'criar' | 'atualizar' | 'movimentar'>>(
      'ProdutosService',
      ['criar', 'atualizar', 'movimentar'],
    );
    TestBed.configureTestingModule({
      imports: [ProdutoForm],
      providers: [provideNoopAnimations(), { provide: ProdutosService, useValue: serviceSpy }],
    });
  });

  it('não chama o serviço com o form vazio (nome/unidade/estoqueMinimo obrigatórios)', () => {
    const probe = montar();
    probe.salvar();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
    expect(serviceSpy.atualizar).not.toHaveBeenCalled();
  });

  it('sem unidadeMedida o form é inválido e não submete (select required — AD-SQ-31)', () => {
    const probe = montar();
    probe.form.setValue({ ...minimo, unidadeMedida: '' });
    probe.salvar();
    expect(probe.form.get('unidadeMedida')?.hasError('required')).toBeTrue();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
  });

  it('cria: POST com opcionais vazios viram null e emite `salvo` (preço opcional — AD-SQ-28/CA-9)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    const probe = montar();
    let emitido: Produto | undefined;
    probe.salvo.subscribe((p) => (emitido = p));

    probe.form.setValue(minimo);
    probe.salvar();

    const esperado: ProdutoRequest = {
      nome: 'Girassol',
      descricao: null,
      unidadeMedida: 'un',
      estoqueMinimo: 5,
      preco: null,
      imagemUrl: null,
    };
    expect(serviceSpy.criar).toHaveBeenCalledWith(esperado);
    expect(serviceSpy.atualizar).not.toHaveBeenCalled();
    expect(emitido).toEqual(rosa);
    expect(probe.enviando()).toBeFalse();
  });

  it('cria: preenche todos os campos e envia o payload completo (com preço e imagem)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    const probe = montar();

    probe.form.setValue({
      nome: '  Rosa Vermelha  ',
      descricao: '  Maço com 12 hastes  ',
      unidadeMedida: 'm3',
      estoqueMinimo: 10,
      preco: 4.5,
      imagemUrl: '  https://exemplo.local/rosa.jpg  ',
    });
    probe.salvar();

    expect(serviceSpy.criar).toHaveBeenCalledWith({
      nome: 'Rosa Vermelha',
      descricao: 'Maço com 12 hastes',
      unidadeMedida: 'm3',
      estoqueMinimo: 10,
      preco: 4.5,
      imagemUrl: 'https://exemplo.local/rosa.jpg',
    });
  });

  it('edição: pré-preenche do produto e faz PUT com o id (sem estoqueAtual — AD-SQ-30)', () => {
    serviceSpy.atualizar.and.returnValue(of({ ...rosa, nome: 'Rosa Branca' }));
    const fixture = montarEditando(rosa);
    const probe = fixture.componentInstance as unknown as Probe;

    // O form nasceu preenchido a partir do produto; muda só o nome e salva.
    probe.form.setValue({
      nome: 'Rosa Branca',
      descricao: rosa.descricao ?? '',
      unidadeMedida: rosa.unidadeMedida,
      estoqueMinimo: rosa.estoqueMinimo,
      preco: rosa.preco,
      imagemUrl: rosa.imagemUrl ?? '',
    });
    probe.salvar();

    expect(serviceSpy.atualizar).toHaveBeenCalledWith(10, {
      nome: 'Rosa Branca',
      descricao: 'Maço com 12 hastes',
      unidadeMedida: 'un',
      estoqueMinimo: 10,
      preco: 4.5,
      imagemUrl: 'https://exemplo.local/rosa.jpg',
    });
    expect(serviceSpy.criar).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_ERROR aplica os details por campo (trata 400 por campo — CA-20)', () => {
    serviceSpy.criar.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'Bad Request',
            error: {
              success: false,
              data: null,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Dados inválidos.',
                details: [{ field: 'nome', message: 'nome já usado' }],
              },
              timestamp: '',
              path: '',
            },
          }),
      ),
    );
    const probe = montar();
    probe.form.setValue(minimo);
    probe.salvar();

    const nome = probe.form.get('nome');
    expect(nome?.hasError('servidor')).toBeTrue();
    expect(nome?.getError('servidor')).toBe('nome já usado');
    expect(probe.enviando()).toBeFalse();
  });

  // --- Entrada inicial de estoque opcional no cadastro (T-M2-11, CA-22, AD-SQ-35) ---

  it('cria com entrada inicial > 0: após criar, chama movimentar (ENTRADA + motivo) e emite salvo (CA-22)', () => {
    serviceSpy.criar.and.returnValue(of(rosa)); // rosa.id === 10
    serviceSpy.movimentar.and.returnValue(of(movEntrada));
    const probe = montar();
    let emitido: Produto | undefined;
    probe.salvo.subscribe((p) => (emitido = p));

    probe.form.setValue(minimo);
    probe.entradaInicial.setValue(30);
    probe.salvar();

    // 1ª chamada: POST /produtos com EXATAMENTE os 6 campos — a entrada NÃO vaza no ProdutoRequest.
    expect(serviceSpy.criar).toHaveBeenCalledWith(payloadMinimo);
    // 2ª chamada: POST /produtos/{id}/movimentacoes com ENTRADA + motivo default.
    expect(serviceSpy.movimentar).toHaveBeenCalledWith(10, {
      tipo: 'ENTRADA',
      quantidade: 30,
      motivo: 'Estoque inicial (cadastro)',
    });
    expect(emitido).toEqual(rosa);
    expect(serviceSpy.atualizar).not.toHaveBeenCalled();
    expect(probe.enviando()).toBeFalse();
  });

  it('cria com entrada inicial vazia/0: NÃO chama movimentar (produto fica com estoque 0 — CA-22)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    const probe = montar();
    let emitido: Produto | undefined;
    probe.salvo.subscribe((p) => (emitido = p));

    probe.form.setValue(minimo);
    probe.entradaInicial.setValue(0);
    probe.salvar();

    expect(serviceSpy.criar).toHaveBeenCalledWith(payloadMinimo);
    expect(serviceSpy.movimentar).not.toHaveBeenCalled();
    expect(emitido).toEqual(rosa);
    expect(probe.enviando()).toBeFalse();
  });

  it('entrada inicial falha: salvo ainda emite, entradaInicialFalhou dispara e criar NÃO é re-chamado (CA-22)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    serviceSpy.movimentar.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    const probe = montar();
    let emitido: Produto | undefined;
    let falhou = false;
    probe.salvo.subscribe((p) => (emitido = p));
    probe.entradaInicialFalhou.subscribe(() => (falhou = true));

    probe.form.setValue(minimo);
    probe.entradaInicial.setValue(15);
    probe.salvar();

    // Produto considerado criado: salvo emite mesmo com a ENTRADA falhando.
    expect(emitido).toEqual(rosa);
    expect(falhou).toBeTrue();
    // NÃO recria o produto (evita duplicata) — criar chamado uma única vez.
    expect(serviceSpy.criar).toHaveBeenCalledTimes(1);
    expect(probe.enviando()).toBeFalse();
  });
});
