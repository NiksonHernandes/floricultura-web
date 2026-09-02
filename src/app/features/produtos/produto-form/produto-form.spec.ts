import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { ProdutoForm } from './produto-form';
import { ProdutosService } from '../produtos.service';
import { Produto, ProdutoRequest, UnidadeMedida } from '../../../core/models/produto.model';

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
  salvar(): void;
  enviando(): boolean;
  salvo: { subscribe(fn: (p: Produto) => void): void };
}

describe('ProdutoForm (T-M2-8, CA-20 — parte form)', () => {
  let serviceSpy: jasmine.SpyObj<Pick<ProdutosService, 'criar' | 'atualizar'>>;

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
    serviceSpy = jasmine.createSpyObj<Pick<ProdutosService, 'criar' | 'atualizar'>>(
      'ProdutosService',
      ['criar', 'atualizar'],
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
});
