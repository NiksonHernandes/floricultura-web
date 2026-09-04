import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { ProdutoForm } from './produto-form';
import { ProdutosService } from '../produtos.service';
import { Produto, ProdutoRequest, UnidadeMedida } from '../../../core/models/produto.model';
import { Evento } from '../../../core/models/evento.model';

/**
 * T-M4-6 (CA-9/CA-12): multiselect de eventos no produto-form. Especifica a regra de payload
 * `eventoIds` (§3.4, replace-set/AD-SQ-48) SEM tocar o produto-form.spec do M2/M3 (anti-burla).
 */
interface Probe {
  form: { setValue(v: Record<string, unknown>): void };
  eventosSelecionados: { setValue(v: number[]): void };
  salvar(): void;
}

describe('ProdutoForm — eventos/sazonalidade (T-M4-6, CA-9/CA-12)', () => {
  let serviceSpy: jasmine.SpyObj<Pick<ProdutosService, 'criar' | 'atualizar' | 'urlImagem' | 'imagemBlob'>>;

  const rosa: Produto = {
    id: 10,
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

  const minimo = {
    nome: 'Girassol',
    descricao: '',
    unidadeMedida: 'un' as UnidadeMedida,
    estoqueMinimo: 5,
    preco: null,
    imagemUrl: '',
  };

  const eventos: Evento[] = [
    {
      id: 1,
      nome: 'Dia das Mães',
      tipo: 'COMEMORATIVA',
      dataInicio: '2026-05-10',
      dataFim: null,
      dataUnica: true,
      repeteTodoAno: true,
      descricao: null,
      criadoEm: '',
      atualizadoEm: '',
    },
    {
      id: 2,
      nome: 'Finados',
      tipo: 'COMEMORATIVA',
      dataInicio: '2026-11-02',
      dataFim: null,
      dataUnica: true,
      repeteTodoAno: true,
      descricao: null,
      criadoEm: '',
      atualizadoEm: '',
    },
  ];

  function montar(produto: Produto | null, comEventos = true) {
    const fixture = TestBed.createComponent(ProdutoForm);
    if (produto) {
      fixture.componentRef.setInput('produto', produto);
    }
    if (comEventos) {
      fixture.componentRef.setInput('eventos', eventos);
    }
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<
      Pick<ProdutosService, 'criar' | 'atualizar' | 'urlImagem' | 'imagemBlob'>
    >('ProdutosService', ['criar', 'atualizar', 'urlImagem', 'imagemBlob']);
    serviceSpy.urlImagem.and.returnValue('http://localhost:8080/api/v1/produtos/10/imagem?v=1');
    serviceSpy.imagemBlob.and.returnValue(of(new Blob()));
    TestBed.configureTestingModule({
      imports: [ProdutoForm],
      providers: [provideNoopAnimations(), { provide: ProdutosService, useValue: serviceSpy }],
    });
  });

  it('renderiza uma option por evento no multiselect', () => {
    const fixture = montar(null);
    const el = fixture.nativeElement as HTMLElement;
    // mat-select fechado não pinta as options no DOM; verificamos via a instância.
    expect((fixture.componentInstance as unknown as { eventos(): Evento[] }).eventos().length).toBe(2);
    expect(el.querySelector('mat-select[multiple]')).toBeTruthy();
  });

  it('criação SEM seleção: payload OMITE eventoIds (mantém os 6 campos — anti-burla)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    const probe = montar(null).componentInstance as unknown as Probe;
    probe.form.setValue(minimo);
    probe.salvar();

    const arg = serviceSpy.criar.calls.mostRecent().args[0] as ProdutoRequest;
    expect('eventoIds' in arg).toBeFalse();
  });

  it('criação COM 2 eventos: payload inclui eventoIds=[1,2] (replace-set — CA-9)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    const probe = montar(null).componentInstance as unknown as Probe;
    probe.form.setValue(minimo);
    probe.eventosSelecionados.setValue([1, 2]);
    probe.salvar();

    const arg = serviceSpy.criar.calls.mostRecent().args[0] as ProdutoRequest;
    expect(arg.eventoIds).toEqual([1, 2]);
  });

  it('edição pré-seleciona do detalhe (eventoIds) e envia a seleção alterada (CA-9)', () => {
    serviceSpy.atualizar.and.returnValue(of(rosa));
    const fixture = montar({ ...rosa, eventoIds: [1] });
    const probe = fixture.componentInstance as unknown as Probe;
    // trocou de [1] para [2]
    probe.eventosSelecionados.setValue([2]);
    probe.salvar();

    const arg = serviceSpy.atualizar.calls.mostRecent().args[1] as ProdutoRequest;
    expect(arg.eventoIds).toEqual([2]);
  });

  it('edição de produto COM vínculos, limpando tudo: envia eventoIds=[] (limpa — §3.4)', () => {
    serviceSpy.atualizar.and.returnValue(of(rosa));
    const probe = montar({ ...rosa, eventoIds: [1, 2] }).componentInstance as unknown as Probe;
    probe.eventosSelecionados.setValue([]);
    probe.salvar();

    const arg = serviceSpy.atualizar.calls.mostRecent().args[1] as ProdutoRequest;
    expect(arg.eventoIds).toEqual([]);
  });

  it('edição de produto SEM vínculos e sem seleção: OMITE eventoIds (não altera — §3.4)', () => {
    serviceSpy.atualizar.and.returnValue(of(rosa));
    const probe = montar({ ...rosa, eventoIds: [] }).componentInstance as unknown as Probe;
    probe.salvar();

    const arg = serviceSpy.atualizar.calls.mostRecent().args[1] as ProdutoRequest;
    expect('eventoIds' in arg).toBeFalse();
  });
});
