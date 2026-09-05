import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { ClienteForm } from './cliente-form';
import { ClientesService } from '../clientes.service';
import { Cliente, ClienteRequest } from '../../../core/models/cliente.model';

/**
 * Form de Cliente (T-M5-8, CA-12; REVISÃO 2026-09-04/RF-1). Espelha `evento-form.spec.ts`. Dados
 * FICTÍCIOS (LGPD, §3.3): "Maria Flores", `@exemplo.com.br`, `(11) 90000-0000` — nunca PII real.
 *
 * **RF-1:** o multiselect de produtos foi removido — o form não injeta `ProdutosService`, não dispara
 * `GET /produtos`, não busca o detalhe para pré-selecionar vínculo e não envia `produtoIds`. O vínculo
 * cliente↔produto passou a ser derivado da movimentação (SAÍDAS — AD-SQ-65). Só `ClientesService`
 * (criar/atualizar) é mockado com SpyObj: nenhuma chamada HTTP real.
 */
describe('ClienteForm (T-M5-8, CA-12; RF-1)', () => {
  let serviceSpy: jasmine.SpyObj<Pick<ClientesService, 'criar' | 'atualizar'>>;

  // Item de LISTA: produtoIds vem null (AD-SQ-38); o form não usa mais esse campo (RF-1).
  const cliente: Cliente = {
    id: 7,
    nome: 'Maria Flores',
    telefone: '(11) 90000-0000',
    email: 'maria@exemplo.com.br',
    observacoes: 'Prefere arranjos de outono.',
    produtoIds: null,
    criadoEm: '2026-09-04T14:05:00Z',
    atualizadoEm: '2026-09-04T14:05:00Z',
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Probe = any;

  function montar(entrada: Cliente | null = null): ComponentFixture<ClienteForm> {
    const fixture = TestBed.createComponent(ClienteForm);
    if (entrada) {
      fixture.componentRef.setInput('cliente', entrada);
    }
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<Pick<ClientesService, 'criar' | 'atualizar'>>(
      'ClientesService',
      ['criar', 'atualizar'],
    );

    TestBed.configureTestingModule({
      imports: [ClienteForm],
      providers: [
        provideNoopAnimations(),
        { provide: ClientesService, useValue: serviceSpy },
      ],
    });
  });

  it('não chama o serviço com nome vazio (obrigatório — CA-12)', () => {
    const probe = montar().componentInstance as Probe;
    probe.salvar();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
  });

  it('form válido monta o payload correto sem produtoIds (RF-1/CA-12)', () => {
    serviceSpy.criar.and.returnValue(of(cliente));
    const fixture = montar();
    const probe = fixture.componentInstance as Probe;
    let emitido: Cliente | undefined;
    probe.salvo.subscribe((c: Cliente) => (emitido = c));

    probe.form.get('nome').setValue('  Maria Flores  '); // trim no payload
    probe.form.get('telefone').setValue('(11) 90000-0000');
    probe.form.get('email').setValue('maria@exemplo.com.br');
    probe.form.get('observacoes').setValue('Prefere arranjos de outono.');
    probe.salvar();

    const esperado: ClienteRequest = {
      nome: 'Maria Flores',
      telefone: '(11) 90000-0000',
      email: 'maria@exemplo.com.br',
      observacoes: 'Prefere arranjos de outono.',
    };
    expect(serviceSpy.criar).toHaveBeenCalledWith(esperado);
    expect(emitido).toEqual(cliente);
    expect(probe.enviando()).toBeFalse();
  });

  it('opcionais em branco viram null e o payload não tem produtoIds (RF-1/CA-12)', () => {
    serviceSpy.criar.and.returnValue(of(cliente));
    const probe = montar().componentInstance as Probe;
    probe.form.get('nome').setValue('Maria Flores');
    probe.salvar();
    expect(serviceSpy.criar).toHaveBeenCalledWith({
      nome: 'Maria Flores',
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
    probe.form.get('nome').setValue('Maria Flores');
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
    serviceSpy.atualizar.and.returnValue(of(cliente));
    const probe = montar(cliente).componentInstance as Probe;

    // RF-1: sem carregar detalhe/vínculo — os campos escalares vêm direto do item de lista.
    expect(probe.form.get('nome').value).toBe('Maria Flores');

    probe.salvar();
    expect(serviceSpy.atualizar).toHaveBeenCalledWith(
      7,
      jasmine.objectContaining({ nome: 'Maria Flores' }),
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
    probe.form.get('nome').setValue('Maria Flores');
    probe.salvar();
    expect(probe.form.get('email').getError('servidor')).toBe('E-mail inválido.');
    expect(probe.enviando()).toBeFalse();
  });
});
