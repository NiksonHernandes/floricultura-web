import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { FornecedorForm } from './fornecedor-form';
import { FornecedoresService } from '../fornecedores.service';
import { ProdutosService } from '../../produtos/produtos.service';
import { PaginaResponse, Produto } from '../../../core/models/produto.model';
import { Fornecedor, FornecedorRequest } from '../../../core/models/fornecedor.model';

/**
 * Form de Fornecedor (T-M5-10, CA-12). Espelho fiel de `cliente-form.spec.ts`. Dados FICTÍCIOS
 * (LGPD, §3.3): "Sítio Boa Flor", `@exemplo.com.br`, `(11) 90000-0000` — nunca PII real.
 */
describe('FornecedorForm (T-M5-10, CA-12)', () => {
  let serviceSpy: jasmine.SpyObj<Pick<FornecedoresService, 'criar' | 'atualizar' | 'detalhar'>>;
  let produtosSpy: jasmine.SpyObj<Pick<ProdutosService, 'listar'>>;

  // Item de LISTA: produtoIds vem null (AD-SQ-38/44); o form busca o detalhe p/ pré-selecionar.
  const fornecedor: Fornecedor = {
    id: 9,
    nome: 'Sítio Boa Flor',
    telefone: '(11) 90000-0000',
    email: 'contato@exemplo.com.br',
    observacoes: 'Entrega às quartas.',
    produtoIds: null,
    criadoEm: '2026-09-04T14:05:00Z',
    atualizadoEm: '2026-09-04T14:05:00Z',
  };

  const produtos = [
    { id: 12, nome: 'Rosa Vermelha' },
    { id: 30, nome: 'Tulipa Amarela' },
  ] as unknown as Produto[];

  function paginaProdutos(): PaginaResponse<Produto> {
    return {
      conteudo: produtos,
      pagina: 0,
      tamanho: 100,
      totalElementos: produtos.length,
      totalPaginas: 1,
      primeira: true,
      ultima: true,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Probe = any;

  function montar(entrada: Fornecedor | null = null): ComponentFixture<FornecedorForm> {
    const fixture = TestBed.createComponent(FornecedorForm);
    if (entrada) {
      fixture.componentRef.setInput('fornecedor', entrada);
    }
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<
      Pick<FornecedoresService, 'criar' | 'atualizar' | 'detalhar'>
    >('FornecedoresService', ['criar', 'atualizar', 'detalhar']);
    produtosSpy = jasmine.createSpyObj<Pick<ProdutosService, 'listar'>>('ProdutosService', ['listar']);
    produtosSpy.listar.and.returnValue(of(paginaProdutos()));
    serviceSpy.detalhar.and.returnValue(of({ ...fornecedor, produtoIds: [12, 30] }));

    TestBed.configureTestingModule({
      imports: [FornecedorForm],
      providers: [
        provideNoopAnimations(),
        { provide: FornecedoresService, useValue: serviceSpy },
        { provide: ProdutosService, useValue: produtosSpy },
      ],
    });
  });

  it('carrega as opções do multiselect via GET /produtos?tamanho=100 (§3.6/Q3)', () => {
    const probe = montar().componentInstance as Probe;
    expect(produtosSpy.listar).toHaveBeenCalledWith(0, 100);
    expect(probe.produtos().length).toBe(2);
  });

  it('não chama o serviço com nome vazio (obrigatório — CA-12)', () => {
    const probe = montar().componentInstance as Probe;
    probe.salvar();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
  });

  it('form válido monta o payload correto COM produtoIds (replace-set — CA-12/§4.2)', () => {
    serviceSpy.criar.and.returnValue(of(fornecedor));
    const fixture = montar();
    const probe = fixture.componentInstance as Probe;
    let emitido: Fornecedor | undefined;
    probe.salvo.subscribe((f: Fornecedor) => (emitido = f));

    probe.form.get('nome').setValue('  Sítio Boa Flor  '); // trim no payload
    probe.form.get('telefone').setValue('(11) 90000-0000');
    probe.form.get('email').setValue('contato@exemplo.com.br');
    probe.form.get('observacoes').setValue('Entrega às quartas.');
    probe.produtosSelecionados.setValue([12, 30]);
    probe.salvar();

    const esperado: FornecedorRequest = {
      nome: 'Sítio Boa Flor',
      telefone: '(11) 90000-0000',
      email: 'contato@exemplo.com.br',
      observacoes: 'Entrega às quartas.',
      produtoIds: [12, 30],
    };
    expect(serviceSpy.criar).toHaveBeenCalledWith(esperado);
    expect(emitido).toEqual(fornecedor);
    expect(probe.enviando()).toBeFalse();
  });

  it('sem seleção envia produtoIds:[] e opcionais em branco viram null (CA-12/§4.2)', () => {
    serviceSpy.criar.and.returnValue(of(fornecedor));
    const probe = montar().componentInstance as Probe;
    probe.form.get('nome').setValue('Sítio Boa Flor');
    probe.salvar();
    expect(serviceSpy.criar).toHaveBeenCalledWith({
      nome: 'Sítio Boa Flor',
      telefone: null,
      email: null,
      observacoes: null,
      produtoIds: [], // SEMPRE enviado — §4.2
    });
  });

  it('e-mail inválido bloqueia o envio (CA-12)', () => {
    const probe = montar().componentInstance as Probe;
    probe.form.get('nome').setValue('Sítio Boa Flor');
    probe.form.get('email').setValue('email-invalido');
    probe.salvar();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
    expect(probe.form.get('email').hasError('email')).toBeTrue();
  });

  it('exibe o aviso LGPD no template das observações (CA-12/§9)', () => {
    const el = montar().nativeElement as HTMLElement;
    expect(el.textContent).toContain('Não inclua dados sensíveis (CPF, dados bancários, saúde).');
  });

  it('edição: carrega o detalhe (produtoIds) e faz PUT com os vínculos vigentes (CA-12/§4.2)', () => {
    serviceSpy.atualizar.and.returnValue(of(fornecedor));
    const probe = montar(fornecedor).componentInstance as Probe;

    expect(serviceSpy.detalhar).toHaveBeenCalledWith(9);
    expect(probe.produtosSelecionados.value).toEqual([12, 30]);

    probe.salvar();
    expect(serviceSpy.atualizar).toHaveBeenCalledWith(
      9,
      jasmine.objectContaining({ nome: 'Sítio Boa Flor', produtoIds: [12, 30] }),
    );
    expect(serviceSpy.criar).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_ERROR aplica os details por campo (email — CA-12)', () => {
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
                details: [{ field: 'email', message: 'E-mail inválido.' }],
              },
              timestamp: '',
              path: '',
            },
          }),
      ),
    );
    const probe = montar().componentInstance as Probe;
    probe.form.get('nome').setValue('Sítio Boa Flor');
    probe.salvar();
    expect(probe.form.get('email').getError('servidor')).toBe('E-mail inválido.');
    expect(probe.enviando()).toBeFalse();
  });
});
