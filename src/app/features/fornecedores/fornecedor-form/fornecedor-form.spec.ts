import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { FornecedorForm } from './fornecedor-form';
import { FornecedoresService } from '../fornecedores.service';
import { Fornecedor, FornecedorRequest } from '../../../core/models/fornecedor.model';

/**
 * Form de Fornecedor (T-M5-10, CA-12; REVISÃO 2026-09-04/RF-1). Espelho fiel de `cliente-form.spec.ts`.
 * Dados FICTÍCIOS (LGPD, §3.3): "Sítio Boa Flor", `@exemplo.com.br`, `(11) 90000-0000` — nunca PII real.
 *
 * **RF-1:** o multiselect de produtos foi removido — o form não injeta `ProdutosService`, não dispara
 * `GET /produtos`, não busca o detalhe para pré-selecionar vínculo e não envia `produtoIds`. O vínculo
 * fornecedor↔produto passou a ser derivado da movimentação (ENTRADAS — AD-SQ-65).
 */
describe('FornecedorForm (T-M5-10, CA-12; RF-1)', () => {
  let serviceSpy: jasmine.SpyObj<Pick<FornecedoresService, 'criar' | 'atualizar'>>;

  // Item de LISTA: produtoIds vem null (AD-SQ-38); o form não usa mais esse campo (RF-1).
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
    serviceSpy = jasmine.createSpyObj<Pick<FornecedoresService, 'criar' | 'atualizar'>>(
      'FornecedoresService',
      ['criar', 'atualizar'],
    );

    TestBed.configureTestingModule({
      imports: [FornecedorForm],
      providers: [
        provideNoopAnimations(),
        { provide: FornecedoresService, useValue: serviceSpy },
      ],
    });
  });

  it('não chama o serviço com nome vazio (obrigatório — CA-12)', () => {
    const probe = montar().componentInstance as Probe;
    probe.salvar();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
  });

  it('form válido monta o payload correto sem produtoIds (RF-1/CA-12)', () => {
    serviceSpy.criar.and.returnValue(of(fornecedor));
    const fixture = montar();
    const probe = fixture.componentInstance as Probe;
    let emitido: Fornecedor | undefined;
    probe.salvo.subscribe((f: Fornecedor) => (emitido = f));

    probe.form.get('nome').setValue('  Sítio Boa Flor  '); // trim no payload
    probe.form.get('telefone').setValue('(11) 90000-0000');
    probe.form.get('email').setValue('contato@exemplo.com.br');
    probe.form.get('observacoes').setValue('Entrega às quartas.');
    probe.salvar();

    const esperado: FornecedorRequest = {
      nome: 'Sítio Boa Flor',
      telefone: '(11) 90000-0000',
      email: 'contato@exemplo.com.br',
      observacoes: 'Entrega às quartas.',
    };
    expect(serviceSpy.criar).toHaveBeenCalledWith(esperado);
    expect(emitido).toEqual(fornecedor);
    expect(probe.enviando()).toBeFalse();
  });

  it('opcionais em branco viram null e o payload não tem produtoIds (RF-1/CA-12)', () => {
    serviceSpy.criar.and.returnValue(of(fornecedor));
    const probe = montar().componentInstance as Probe;
    probe.form.get('nome').setValue('Sítio Boa Flor');
    probe.salvar();
    expect(serviceSpy.criar).toHaveBeenCalledWith({
      nome: 'Sítio Boa Flor',
      telefone: null,
      email: null,
      observacoes: null,
    });
    // RF-1: sem chave produtoIds no corpo enviado.
    const enviado = serviceSpy.criar.calls.mostRecent().args[0] as unknown as Record<string, unknown>;
    expect('produtoIds' in enviado).toBeFalse();
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

  it('edição: preenche os campos escalares e faz PUT sem produtoIds (RF-1/CA-12)', () => {
    serviceSpy.atualizar.and.returnValue(of(fornecedor));
    const probe = montar(fornecedor).componentInstance as Probe;

    // RF-1: sem carregar detalhe/vínculo — os campos escalares vêm direto do item de lista.
    expect(probe.form.get('nome').value).toBe('Sítio Boa Flor');

    probe.salvar();
    expect(serviceSpy.atualizar).toHaveBeenCalledWith(
      9,
      jasmine.objectContaining({ nome: 'Sítio Boa Flor' }),
    );
    const enviado = serviceSpy.atualizar.calls.mostRecent().args[1] as unknown as Record<string, unknown>;
    expect('produtoIds' in enviado).toBeFalse();
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
