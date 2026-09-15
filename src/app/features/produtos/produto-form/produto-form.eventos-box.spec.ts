import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { of } from 'rxjs';

import { ProdutoForm } from './produto-form';
import { AtributosBotanicos } from './atributos-botanicos/atributos-botanicos';
import { ProdutosService } from '../produtos.service';
import { Produto, ProdutoRequest, UnidadeMedida } from '../../../core/models/produto.model';
import { Evento } from '../../../core/models/evento.model';

/**
 * T-M6.1-06 — "Eventos (sazonalidade)" vira BOX (SPEC-M6.1 §3.1/A1), o `eventoIds` invisível deixa
 * de ser desvinculado em silêncio (§3.4-b/D4b) e os boxes botânicos voltam a ser irmãos idênticos
 * (§3.7/D8). Arquivo NOVO por AD-SQ-147 — nenhum spec herdado é tocado.
 *
 * O que este arquivo protege, e é o ponto mais sensível do marco: a **semântica de omissão** do
 * `eventoIds` (AD-SQ-135) sobrevive à virada de UI — ausente = "não altera", `[]` = "limpa". Os três
 * estados estão aqui, cada um num caso: OMITIDO (CA-4/CA-4b), `[]` (CA-3/CA-17) e a lista preenchida
 * (CA-2/CA-16). A fonte da verdade do payload continua sendo o CONTROLE, nunca o estado do box
 * (armadilha §12 #2) — por isso `produto-form.eventos.spec.ts` segue verde sem uma linha alterada.
 */
describe('ProdutoForm — box de eventos (T-M6.1-06, A1/D4b/D8)', () => {
  let serviceSpy: jasmine.SpyObj<
    Pick<ProdutosService, 'criar' | 'atualizar' | 'urlImagem' | 'imagemBlob'>
  >;

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

  function evento(id: number, nome: string): Evento {
    return {
      id,
      nome,
      tipo: 'COMEMORATIVA',
      dataInicio: '2026-05-10',
      dataFim: null,
      dataUnica: true,
      repeteTodoAno: true,
      descricao: null,
      criadoEm: '',
      atualizadoEm: '',
    };
  }

  const eventos: Evento[] = [evento(1, 'Dia das Mães'), evento(2, 'Finados')];

  interface Sinal<T> {
    (): T;
  }

  interface Probe {
    form: { setValue(v: typeof minimo): void };
    eventosSelecionados: { value: number[]; setValue(v: number[]): void; readonly disabled: boolean };
    eventosAberto: Sinal<boolean>;
    alternarEventos(ligado: boolean): void;
    salvar(): void;
  }

  function montar(opcoes: {
    produto?: Produto;
    eventos?: Evento[];
    eventosProntos?: boolean;
  }): { fixture: ComponentFixture<ProdutoForm>; probe: Probe } {
    const fixture = TestBed.createComponent(ProdutoForm);
    if (opcoes.produto) {
      fixture.componentRef.setInput('produto', opcoes.produto);
    }
    fixture.componentRef.setInput('eventos', opcoes.eventos ?? eventos);
    fixture.componentRef.setInput('eventosProntos', opcoes.eventosProntos ?? true);
    fixture.detectChanges();
    return { fixture, probe: fixture.componentInstance as unknown as Probe };
  }

  /**
   * O box de eventos, localizado pelo RÓTULO e explicitamente FORA de `app-atributos-botanicos` —
   * índice global pegaria um box botânico (armadilha do reviewer da T-M6.1-05) e o box de eventos
   * NÃO mora no filho (armadilha §12 #3: o filho crava 4 chaves).
   */
  function caixaDeEventos(fixture: ComponentFixture<ProdutoForm>): HTMLElement {
    const todas = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.caixa'),
    );
    return todas.find(
      (c) => !c.closest('app-atributos-botanicos') && c.textContent?.includes('Eventos (sazonalidade)'),
    )!;
  }

  function chaveDeEventos(fixture: ComponentFixture<ProdutoForm>): MatSlideToggle {
    const caixa = caixaDeEventos(fixture);
    return fixture.debugElement
      .queryAll(By.directive(MatSlideToggle))
      .find((d) => (d.nativeElement as HTMLElement).closest('.caixa') === caixa)!
      .componentInstance as MatSlideToggle;
  }

  function conteudoDeEventos(fixture: ComponentFixture<ProdutoForm>): HTMLElement {
    return caixaDeEventos(fixture).querySelector<HTMLElement>('.caixa__conteudo')!;
  }

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<
      Pick<ProdutosService, 'criar' | 'atualizar' | 'urlImagem' | 'imagemBlob'>
    >('ProdutosService', ['criar', 'atualizar', 'urlImagem', 'imagemBlob']);
    serviceSpy.criar.and.returnValue(of(rosa));
    serviceSpy.atualizar.and.returnValue(of(rosa));
    serviceSpy.urlImagem.and.returnValue('http://localhost/imagem');
    serviceSpy.imagemBlob.and.returnValue(of(new Blob()));
    TestBed.configureTestingModule({
      imports: [ProdutoForm],
      providers: [provideNoopAnimations(), { provide: ProdutosService, useValue: serviceSpy }],
    });
  });

  // --- A1: o box e seus dois estados de nascimento (CA-1/CA-2) -----------------------------------

  it('CA-1: na criação o box nasce DESLIGADO, irmão dos outros, com o multiselect no DOM e oculto', () => {
    const { fixture, probe } = montar({});

    expect(probe.eventosAberto()).toBeFalse();
    expect(chaveDeEventos(fixture).checked).toBeFalse();
    // Irmandade visual: a chave usa a MESMA classe dos outros 4 + a do box de entrada inicial.
    const chave = caixaDeEventos(fixture).querySelector('mat-slide-toggle')!;
    expect(chave.classList).toContain('caixa__chave');
    // E continua FORA do filho: `atributos-botanicos.spec.ts:160` crava 4 chaves lá dentro.
    const noFilho = fixture.debugElement
      .query(By.directive(AtributosBotanicos))
      .queryAll(By.css('.caixa__chave'));
    expect(noFilho.length).toBe(4);

    // `[hidden]`, NUNCA `@if`: o nó fica no DOM (e no `textContent`) — §12 #1.
    const conteudo = conteudoDeEventos(fixture);
    expect(conteudo.hasAttribute('hidden')).toBeTrue();
    expect(conteudo.querySelector('mat-select[multiple]')).toBeTruthy();
  });

  it('CA-2: na edição de produto COM vínculo o box nasce LIGADO, revelado e já selecionado', () => {
    const { fixture, probe } = montar({ produto: { ...rosa, eventoIds: [1, 2] } });

    expect(probe.eventosAberto()).toBeTrue();
    expect(chaveDeEventos(fixture).checked).toBeTrue();
    expect(conteudoDeEventos(fixture).hasAttribute('hidden')).toBeFalse();
    expect(probe.eventosSelecionados.value).toEqual([1, 2]);
  });

  // --- A1: os três estados do `eventoIds` no payload (CA-3/CA-4/CA-4b/CA-5) ----------------------

  it('CA-3: desligar o box na edição COM vínculo manda eventoIds=[] (limpa) e não mexe em mais nada', () => {
    const { fixture } = montar({ produto: { ...rosa, eventoIds: [1, 2] } });

    // Pelo gesto real do operador: o clique na chave (prova a ligação do template ao handler).
    const botao = caixaDeEventos(fixture).querySelector<HTMLButtonElement>('button[role="switch"]')!;
    botao.click();
    fixture.detectChanges();

    const probe = fixture.componentInstance as unknown as Probe;
    expect(probe.eventosAberto()).toBeFalse();
    expect(probe.eventosSelecionados.value).toEqual([]); // desligar LIMPA o controle (PA#1)
    expect(conteudoDeEventos(fixture).hasAttribute('hidden')).toBeTrue();

    probe.salvar();
    const enviado = serviceSpy.atualizar.calls.mostRecent().args[1] as ProdutoRequest;
    expect(enviado.eventoIds).toEqual([]);
    expect(enviado).toEqual({
      nome: 'Rosa Vermelha',
      descricao: null,
      unidadeMedida: 'un',
      estoqueMinimo: 10,
      preco: null,
      imagemUrl: null,
      eventoIds: [],
    });
  });

  it('CA-4: edição SEM vínculo, sem tocar no box ⇒ o payload OMITE eventoIds ("não altera")', () => {
    const { probe } = montar({ produto: { ...rosa, eventoIds: [] } });

    probe.salvar();
    const enviado = serviceSpy.atualizar.calls.mostRecent().args[1] as ProdutoRequest;
    expect('eventoIds' in enviado).toBeFalse();
  });

  it('CA-4b: caminho degradado (item de LISTA, sem eventoIds) ⇒ box desligado e payload OMITE', () => {
    // `produtos.ts::editarProduto` cai no `error: () => this.abrirEdicao(p)` quando o
    // `GET /produtos/{id}` falha — e `p` é o item de LISTA, que NÃO tem a chave `eventoIds`.
    const itemDeLista: Produto = { ...rosa };
    expect('eventoIds' in itemDeLista).toBeFalse(); // o caso não pode passar por produto completo

    const { fixture, probe } = montar({ produto: itemDeLista });

    expect(probe.eventosAberto()).toBeFalse(); // o form não SABE que há vínculo ⇒ nasce desligado
    expect(chaveDeEventos(fixture).checked).toBeFalse();
    expect(probe.eventosSelecionados.value).toEqual([]);

    probe.salvar();
    const enviado = serviceSpy.atualizar.calls.mostRecent().args[1] as ProdutoRequest;
    // O único estado em que o form não sabe o que havia é também o único em que ele não apaga nada:
    // sem a chave no corpo, o back PRESERVA o vínculo que existe no servidor.
    expect('eventoIds' in enviado).toBeFalse();
  });

  it('CA-5: box LIGADO e vazio NÃO bloqueia o submit — manda [] se havia vínculo, omite se não havia', () => {
    // (a) criação: box ligado na mão, nenhuma seleção ⇒ nada a limpar ⇒ campo OMITIDO.
    const criacao = montar({});
    criacao.probe.alternarEventos(true);
    criacao.fixture.detectChanges();
    criacao.probe.form.setValue(minimo);
    criacao.probe.salvar();

    expect(serviceSpy.criar).toHaveBeenCalledTimes(1); // nenhum "escolha ao menos uma opção" (R3)
    const criado = serviceSpy.criar.calls.mostRecent().args[0] as ProdutoRequest;
    expect('eventoIds' in criado).toBeFalse();

    // (b) edição COM vínculo: box segue ligado, seleção esvaziada na mão ⇒ `[]` (limpa).
    const edicao = montar({ produto: { ...rosa, eventoIds: [1] } });
    edicao.probe.eventosSelecionados.setValue([]);
    edicao.probe.salvar();

    expect(edicao.probe.eventosAberto()).toBeTrue();
    const editado = serviceSpy.atualizar.calls.mostRecent().args[1] as ProdutoRequest;
    expect(editado.eventoIds).toEqual([]);
  });

  it('CA-6: eventos=[] + prontos desabilita CONTROLE e CHAVE na criação — e NÃO desabilita quando há vínculo', () => {
    // Lado 1 (criação, nada a vincular): uma fonte de verdade só — a chave segue o controle.
    const vazio = montar({ eventos: [], eventosProntos: true });
    expect(vazio.probe.eventosSelecionados.disabled).toBeTrue();
    expect(chaveDeEventos(vazio.fixture).disabled).toBeTrue();
    // O texto continua no `textContent` mesmo com o box fechado — é `[hidden]`, não `@if` (§12 #1).
    expect((vazio.fixture.nativeElement as HTMLElement).textContent).toContain(
      'Nenhum evento cadastrado para vincular.',
    );

    // Lado 2 (edição com vínculo + catálogo vazio): o operador tem de poder desvincular.
    const comVinculo = montar({
      produto: { ...rosa, eventoIds: [1, 2] },
      eventos: [],
      eventosProntos: true,
    });
    expect(comVinculo.probe.eventosSelecionados.disabled).toBeFalse();
    expect(chaveDeEventos(comVinculo.fixture).disabled).toBeFalse();
  });

  // --- D4b: o vínculo que a página 1 não trouxe (CA-16/CA-17) ------------------------------------

  it('CA-16: com o box LIGADO, vínculo invisível (fora da página 1 de GET /eventos) NÃO é desvinculado', async () => {
    // O produto tem 1 e 7; a lista-mãe só conseguiu trazer 1 e 2 (o 7 ficou na página 2).
    const { fixture, probe } = montar({
      produto: { ...rosa, eventoIds: [1, 7] },
      eventos: [evento(1, 'Dia das Mães'), evento(2, 'Finados')],
    });
    expect(probe.eventosAberto()).toBeTrue();

    // É AQUI que o desvínculo silencioso se consuma, e só aqui: ao MEXER na seleção, o `mat-select`
    // reescreve o controle com o que casou com as OPÇÕES — o 7, que a página não trouxe, evapora.
    // (Medido: sem esta interação o controle guarda [1,7] e o caso ficaria verde sem a correção.)
    const selectDeEventos = fixture.debugElement
      .queryAll(By.directive(MatSelect))
      .find((d) => (d.nativeElement as HTMLElement).closest('.caixa') === caixaDeEventos(fixture))!
      .componentInstance as MatSelect;
    selectDeEventos.open();
    fixture.detectChanges();
    // O casamento valor × opções roda num MICROTASK: sem esperá-lo o clique mediria artefato do
    // harness, não o comportamento real (lição herdada da T-M6.1-05).
    await fixture.whenStable();
    fixture.detectChanges();
    const opcoes: HTMLElement[] = Array.from(document.querySelectorAll('mat-option'));
    opcoes.find((o) => o.textContent?.includes('Finados'))!.click(); // o operador marca também o 2
    fixture.detectChanges();
    expect(probe.eventosSelecionados.value).not.toContain(7); // o controle JÁ perdeu o invisível

    probe.salvar();
    const enviado = serviceSpy.atualizar.calls.mostRecent().args[1] as ProdutoRequest;
    expect(enviado.eventoIds).toContain(1);
    expect(enviado.eventoIds).toContain(2); // o que o operador acabou de marcar
    expect(enviado.eventoIds).toContain(7); // e o invisível sobrevive ao PUT — é a D4b
    expect(enviado.eventoIds!.filter((id) => id === 7).length).toBe(1); // sem duplicata
  });

  it('CA-17: DESLIGAR o box no mesmo estado manda [] — a limpeza explícita vence a preservação', () => {
    const { probe } = montar({ produto: { ...rosa, eventoIds: [1, 7] }, eventos: [evento(1, 'Dia das Mães')] });

    probe.alternarEventos(false);
    probe.salvar();

    const enviado = serviceSpy.atualizar.calls.mostRecent().args[1] as ProdutoRequest;
    expect(enviado.eventoIds).toEqual([]); // o operador MANDOU limpar — inclusive o invisível
  });

  // --- D8: os 5 boxes são irmãos idênticos (CA-22) -----------------------------------------------

  it('CA-22/D8: box botânico e box de entrada inicial têm o MESMO padding-bottom e row-gap', () => {
    const { fixture } = montar({}); // modo criação: é onde o box de entrada inicial existe

    const el = fixture.nativeElement as HTMLElement;
    const botanico = el.querySelector<HTMLElement>('app-atributos-botanicos .caixa')!;
    const entrada = Array.from(el.querySelectorAll<HTMLElement>('.caixa')).find(
      (c) => !c.closest('app-atributos-botanicos') && c.textContent?.includes('Registrar entrada inicial'),
    )!;

    // Igualdade entre os dois, sem número mágico: quem mudar um dos arquivos quebra aqui.
    expect(getComputedStyle(botanico).paddingBottom).toBe(getComputedStyle(entrada).paddingBottom);
    expect(getComputedStyle(botanico.querySelector('.caixa__conteudo')!).rowGap).toBe(
      getComputedStyle(entrada.querySelector('.caixa__conteudo')!).rowGap,
    );
  });
});
