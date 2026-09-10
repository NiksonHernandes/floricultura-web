import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';

import { NOVO_FORNECEDOR, ProdutoForm } from './produto-form';
import { FornecedorForm } from '../../fornecedores/fornecedor-form/fornecedor-form';
import { FornecedoresService } from '../../fornecedores/fornecedores.service';
import { ProdutosService } from '../produtos.service';
import { Fornecedor } from '../../../core/models/fornecedor.model';
import { Movimentacao, Produto, UnidadeMedida } from '../../../core/models/produto.model';

/**
 * T-M6-10 (SPEC-M6 §3.13/CA-35 — ajuste 1 do dono): box da entrada inicial + mini modal de
 * fornecedor. O ponto do pedido é que o operador NÃO perca o cadastro pela metade ao descobrir que
 * o fornecedor não existe — por isso a prova central aqui é a PRESERVAÇÃO do estado do produto.
 * Arquivo NOVO: nenhum spec herdado é tocado (anti-burla §12).
 */
interface Probe {
  form: { setValue(v: Record<string, unknown>): void; getRawValue(): Record<string, unknown> };
  entradaInicial: { value: number | null; setValue(v: number | null): void };
  fornecedorInicial: { value: number | null; setValue(v: number | null): void; readonly disabled: boolean };
  eventosSelecionados: { value: number[]; setValue(v: number[]): void };
  entradaAberta(): boolean;
  fornecedorFormAberto(): boolean;
  fornecedoresLocal(): Fornecedor[];
  alternarEntrada(ligado: boolean): void;
  aoEscolherFornecedor(valor: number | null): void;
  aoCancelarFornecedor(): void;
  aoSelecionarArquivo(evento: Event): void;
  aoRecortar(recorte: File): void;
  previewUrl(): string | null;
  salvar(): void;
}

describe('ProdutoForm — box de entrada inicial + mini modal de fornecedor (T-M6-10, CA-35)', () => {
  let serviceSpy: jasmine.SpyObj<
    Pick<ProdutosService, 'criar' | 'atualizar' | 'movimentar' | 'enviarImagem' | 'urlImagem' | 'imagemBlob'>
  >;

  const rosa: Produto = {
    id: 10,
    nome: 'Rosa Vermelha',
    descricao: null,
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 0,
    preco: null,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-10T14:00:00Z',
    atualizadoEm: '2026-09-10T14:00:00Z',
    temImagem: false,
  };

  /** Fornecedores FICTÍCIOS (LGPD — §9): nada de contato real em teste. */
  const sitio: Fornecedor = {
    id: 7,
    nome: 'Sítio das Flores',
    telefone: null,
    email: null,
    observacoes: null,
    produtoIds: null,
    criadoEm: '2026-09-10T14:00:00Z',
    atualizadoEm: '2026-09-10T14:00:00Z',
  };
  const novoViveiro: Fornecedor = { ...sitio, id: 21, nome: 'Viveiro Aurora' };

  /** Ficha de produto preenchida "até o fim" — é o que NÃO pode se perder. */
  const preenchido = {
    nome: 'Girassol Gigante',
    descricao: 'Maço com 5 hastes',
    unidadeMedida: 'un' as UnidadeMedida,
    estoqueMinimo: 5,
    preco: 12.9,
    imagemUrl: 'https://exemplo.local/girassol.jpg',
  };

  const recorte = new File(['\xff\xd8\xff'], 'girassol.jpg', { type: 'image/jpeg' });

  function montar(fornecedores: Fornecedor[], prontos = true): ComponentFixture<ProdutoForm> {
    const fixture = TestBed.createComponent(ProdutoForm);
    fixture.componentRef.setInput('fornecedores', fornecedores);
    fixture.componentRef.setInput('fornecedoresProntos', prontos);
    fixture.detectChanges();
    fixture.detectChanges(); // 2ª passada: reflete o disable do estadoVinculosEffect
    return fixture;
  }

  /** Preenche a ficha inteira (campos + eventos + entrada + foto recortada pendente). */
  function preencherTudo(probe: Probe): void {
    probe.alternarEntrada(true);
    probe.form.setValue(preenchido);
    probe.eventosSelecionados.setValue([1, 2]);
    probe.entradaInicial.setValue(30);
    probe.aoRecortar(recorte); // foto já enquadrada, aguardando o POST
  }

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<
      Pick<ProdutosService, 'criar' | 'atualizar' | 'movimentar' | 'enviarImagem' | 'urlImagem' | 'imagemBlob'>
    >('ProdutosService', ['criar', 'atualizar', 'movimentar', 'enviarImagem', 'urlImagem', 'imagemBlob']);
    serviceSpy.urlImagem.and.returnValue('http://localhost:8080/api/v1/produtos/10/imagem?v=1');
    serviceSpy.imagemBlob.and.returnValue(of(new Blob()));
    TestBed.configureTestingModule({
      imports: [ProdutoForm],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        // O <app-fornecedor-form> do sub-modal injeta o FornecedoresService (não é providedIn:'root'
        // desde a T-M5.1-5/AD-SQ-72 — na app real vem do app.config). Nenhum POST sai daqui: o
        // "201" é simulado pelo output real do componente.
        FornecedoresService,
        { provide: ProdutosService, useValue: serviceSpy },
      ],
    });
  });

  // --- Box sim/não (§3.13) ---

  it('o box nasce DESLIGADO e o conteúdo (quantidade + fornecedor) fica oculto', () => {
    const fixture = montar([sitio]);
    const probe = fixture.componentInstance as unknown as Probe;
    expect(probe.entradaAberta()).toBeFalse();
    const conteudo = (fixture.nativeElement as HTMLElement).querySelector('.caixa__conteudo');
    expect(conteudo?.hasAttribute('hidden')).toBeTrue();
  });

  it('desligar o box limpa quantidade e fornecedor ⇒ nenhuma movimentação nasce do cadastro (armadilha #13)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    const fixture = montar([sitio]);
    const probe = fixture.componentInstance as unknown as Probe;

    probe.alternarEntrada(true);
    probe.entradaInicial.setValue(30);
    probe.fornecedorInicial.setValue(7);
    probe.alternarEntrada(false); // o operador desistiu do lançamento

    expect(probe.entradaInicial.value).toBeNull();
    expect(probe.fornecedorInicial.value).toBeNull();

    probe.form.setValue(preenchido);
    probe.salvar();
    expect(serviceSpy.criar).toHaveBeenCalledTimes(1);
    expect(serviceSpy.movimentar).not.toHaveBeenCalled();
  });

  // --- Mini modal: abrir, salvar, preservar (o CORAÇÃO do CA-35) ---

  it('escolher "+ Cadastrar novo fornecedor" abre o <app-fornecedor-form> SOBREPOSTO e não seleciona a sentinela', async () => {
    const fixture = montar([sitio]);
    const probe = fixture.componentInstance as unknown as Probe;

    probe.alternarEntrada(true);
    probe.fornecedorInicial.setValue(7);
    probe.aoEscolherFornecedor(7); // registra o valor anterior, como faz o (selectionChange)
    probe.aoEscolherFornecedor(NOVO_FORNECEDOR);

    expect(probe.fornecedorFormAberto()).toBeTrue();
    // A sentinela NUNCA fica no estado: o select volta ao fornecedor anterior na hora.
    expect(probe.fornecedorInicial.value).toBe(7);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.ficha__subforma app-fornecedor-form')).toBeTruthy();
  });

  it('salvar o fornecedor no mini modal: volta JÁ SELECIONADO e NADA do formulário de produto se perde (CA-35)', async () => {
    const fixture = montar([sitio]);
    const probe = fixture.componentInstance as unknown as Probe;

    preencherTudo(probe);
    const previewAntes = probe.previewUrl();
    probe.aoEscolherFornecedor(NOVO_FORNECEDOR);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // O sub-form faz o próprio POST (armadilha #12) — aqui simulamos o 201 pelo output real.
    const subForm = fixture.debugElement.query(By.directive(FornecedorForm));
    expect(subForm).withContext('sub-form renderizado pelo @defer').toBeTruthy();
    (subForm.componentInstance as FornecedorForm).salvo.emit(novoViveiro);
    fixture.detectChanges();

    // 1) fechou, 2) entrou nas opções, 3) já selecionado
    expect(probe.fornecedorFormAberto()).toBeFalse();
    expect(probe.fornecedoresLocal().map((f) => f.id)).toEqual([7, 21]);
    expect(probe.fornecedorInicial.value).toBe(21);

    // 4) NADA do produto se perdeu — nem campo, nem evento, nem quantidade, nem a foto recortada.
    expect(probe.form.getRawValue()).toEqual(preenchido);
    expect(probe.eventosSelecionados.value).toEqual([1, 2]);
    expect(probe.entradaInicial.value).toBe(30);
    expect(probe.entradaAberta()).toBeTrue();
    expect(probe.previewUrl()).toBe(previewAntes);

    // 5) nenhuma requisição de produto foi feita nesse caminho
    expect(serviceSpy.criar).not.toHaveBeenCalled();
    expect(serviceSpy.atualizar).not.toHaveBeenCalled();
    expect(serviceSpy.movimentar).not.toHaveBeenCalled();
  });

  it('cancelar o mini modal: nada é criado e o select volta ao valor anterior', () => {
    const fixture = montar([sitio]);
    const probe = fixture.componentInstance as unknown as Probe;

    probe.alternarEntrada(true);
    probe.aoEscolherFornecedor(7);
    probe.aoEscolherFornecedor(NOVO_FORNECEDOR);
    probe.aoCancelarFornecedor();

    expect(probe.fornecedorFormAberto()).toBeFalse();
    expect(probe.fornecedorInicial.value).toBe(7);
    expect(probe.fornecedoresLocal()).toEqual([sitio]);
  });

  it('o fornecedor criado no mini modal chega ao POST da ENTRADA como fornecedorId (fluxo ponta a ponta)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    serviceSpy.movimentar.and.returnValue(of({ id: 100 } as Movimentacao));
    serviceSpy.enviarImagem.and.returnValue(of(rosa));
    const fixture = montar([sitio]);
    const probe = fixture.componentInstance as unknown as Probe;

    preencherTudo(probe);
    probe.aoEscolherFornecedor(NOVO_FORNECEDOR);
    (probe as unknown as { aoSalvarFornecedor(f: Fornecedor): void }).aoSalvarFornecedor(novoViveiro);
    probe.salvar();

    expect(serviceSpy.movimentar).toHaveBeenCalledWith(10, {
      tipo: 'ENTRADA',
      quantidade: 30,
      motivo: 'Estoque inicial (cadastro)',
      fornecedorId: 21,
    });
  });

  // --- Catálogo vazio: o beco que o ajuste 1 veio eliminar ---

  it('sem NENHUM fornecedor (select inerte) há a saída "Cadastrar novo fornecedor", e criar o 1º reabilita o select', async () => {
    const fixture = montar([], true);
    const probe = fixture.componentInstance as unknown as Probe;
    probe.alternarEntrada(true);
    fixture.detectChanges();

    expect(probe.fornecedorInicial.disabled).toBeTrue();
    const botao = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.caixa__novo');
    expect(botao).withContext('saída para catálogo vazio').toBeTruthy();

    botao!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const subForm = fixture.debugElement.query(By.directive(FornecedorForm));
    (subForm.componentInstance as FornecedorForm).salvo.emit(novoViveiro);
    fixture.detectChanges();
    fixture.detectChanges(); // 2ª passada: o estadoVinculosEffect reavalia com a opção nova

    expect(probe.fornecedoresLocal()).toEqual([novoViveiro]);
    expect(probe.fornecedorInicial.disabled).toBeFalse();
    expect(probe.fornecedorInicial.value).toBe(21);
  });
});
