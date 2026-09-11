import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { MatSelect } from '@angular/material/select';

import { ATALHOS_ESTOQUE, FiltrosProdutos, Pastilha } from './filtros-produtos';
import { Cor } from '../../../core/models/cor.model';
import { Evento } from '../../../core/models/evento.model';
import {
  FILTRO_VAZIO,
  FiltroProdutos,
  contarFiltros,
} from '../../../core/models/produto-filtro.model';

/**
 * T-M6-11 — barra de filtros da lista de produtos (SPEC-M6 §3.14, CA-36/CA-37; §10 #29).
 *
 * O que estes casos provam: **uma** emissão por gesto (debounce 300ms), a caixa EXATA dos literais
 * do §3.6 lida do próprio template, a exclusividade preço × "sem preço", as pastilhas removíveis,
 * o "limpar (N)" e o painel inferior do celular.
 */
describe('FiltrosProdutos (T-M6-11, CA-36)', () => {
  let fixture: ComponentFixture<FiltrosProdutos>;
  let comp: FiltrosProdutos;
  let probe: BarraProbe;
  let emitidos: FiltroProdutos[];

  /** Acesso tipado ao que a barra expõe como `protected` — o teste é do mesmo contrato (§3.14). */
  interface Controle<T> {
    setValue(v: T): void;
    readonly value: T;
    readonly disabled: boolean;
  }
  interface BarraProbe {
    form: {
      controls: {
        corIds: Controle<number[]>;
        eventoIds: Controle<number[]>;
        caracteristica: Controle<string[]>;
        toxicidade: Controle<string[]>;
        luz: Controle<string[]>;
        estoque: Controle<string | null>;
        precoMin: Controle<number | null>;
        precoMax: Controle<number | null>;
        semPreco: Controle<boolean>;
        ordem: Controle<string>;
      };
    };
    total(): number;
    pastilhas(): Pastilha[];
    aberto(): boolean;
    alternarEstoque(v: string): void;
    remover(d: Pastilha['dimensao']): void;
    limpar(): void;
    abrir(): void;
    fechar(): void;
  }

  const cores: Cor[] = [
    { id: 3, nome: 'ROSA', hex: '#C4326B', produtosVinculados: 2, criadoEm: '', atualizadoEm: '' },
    { id: 7, nome: 'AZUL', hex: null, produtosVinculados: 0, criadoEm: '', atualizadoEm: '' },
  ];

  const eventos: Evento[] = [
    {
      id: 5,
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
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FiltrosProdutos],
      providers: [provideNoopAnimations()],
    });
    fixture = TestBed.createComponent(FiltrosProdutos);
    comp = fixture.componentInstance;
    probe = comp as unknown as BarraProbe;
    fixture.componentRef.setInput('cores', cores);
    fixture.componentRef.setInput('eventos', eventos);
    emitidos = [];
    comp.mudou.subscribe((f) => emitidos.push(f));
    fixture.detectChanges();
  });

  /** Valores das `mat-option` de um dos 6 selects, LIDOS DO TEMPLATE (o painel é lazy: abre antes). */
  function opcoesDoSelect(indice: number): unknown[] {
    const select = fixture.debugElement.queryAll(By.directive(MatSelect))[indice]
      .componentInstance as MatSelect;
    select.open();
    fixture.detectChanges();
    return select.options.toArray().map((o) => o.value);
  }

  it('renderiza os 6 selects, os 3 atalhos de estoque, a faixa de preço e o "sem preço" (CA-36)', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.debugElement.queryAll(By.directive(MatSelect)).length).toBe(6);
    expect(el.querySelectorAll('.atalho').length).toBe(3);
    expect(el.querySelectorAll('.faixa input[type="number"]').length).toBe(2);
    expect(el.querySelector('mat-slide-toggle.chave')).toBeTruthy();
  });

  it('oferece os literais do §3.6 em CAIXA EXATA (o back só tolera caixa em ordenarPor/direcao)', () => {
    expect(opcoesDoSelect(2)).toEqual(['MUDA', 'JOVEM', 'ADULTA']);
    expect(opcoesDoSelect(3)).toEqual(['TOXICA', 'NAO_TOXICA']);
    expect(opcoesDoSelect(4)).toEqual(['SOL_PLENO', 'MEIA_SOMBRA', 'SOMBRA']);
    expect(ATALHOS_ESTOQUE).toEqual(['SEM_ESTOQUE', 'BAIXO', 'COM_ESTOQUE']);
  });

  it('emite UMA vez quando dois controles mudam no mesmo gesto (debounce 300ms)', fakeAsync(() => {
    probe.form.controls.corIds.setValue([3, 7]);
    probe.form.controls.luz.setValue(['SOMBRA']);
    tick(150);
    expect(emitidos.length).toBe(0); // ainda dentro da janela do debounce

    tick(150);
    expect(emitidos.length).toBe(1);
    expect(emitidos[0].corIds).toEqual([3, 7]);
    expect(emitidos[0].luz).toEqual(['SOMBRA']);
  }));

  it('NÃO reemite quando o valor reescolhido é o mesmo (nada de requisição idêntica)', fakeAsync(() => {
    probe.form.controls.estoque.setValue('BAIXO');
    tick(300);
    probe.form.controls.estoque.setValue('BAIXO');
    tick(300);
    expect(emitidos.length).toBe(1);
  }));

  it('atalho de estoque é escolha única e clicar no ativo LIMPA a dimensão', fakeAsync(() => {
    probe.alternarEstoque('SEM_ESTOQUE');
    tick(300);
    expect(emitidos[0].estoque).toBe('SEM_ESTOQUE');

    probe.alternarEstoque('BAIXO'); // troca (não acumula)
    tick(300);
    expect(emitidos[1].estoque).toBe('BAIXO');

    probe.alternarEstoque('BAIXO'); // clique no ativo = limpa
    tick(300);
    expect(emitidos[2].estoque).toBeNull();
  }));

  it('marca aria-pressed só no atalho ativo (a11y §9)', () => {
    probe.alternarEstoque('COM_ESTOQUE');
    fixture.detectChanges();
    const atalhos = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.atalho'),
    ).map((b) => b.getAttribute('aria-pressed'));
    expect(atalhos).toEqual(['false', 'false', 'true']);
  });

  it('diz na tela que SEM_ESTOQUE ⊂ BAIXO — são atalhos, não uma partição (§3.6)', () => {
    const texto = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    expect(texto).toContain('São atalhos, não categorias');
    expect(texto).toContain('inclui os zerados');
  });

  it('"somente sem preço" DESABILITA e limpa a faixa, e a faixa não viaja junto (§3.6 → 400)', fakeAsync(() => {
    probe.form.controls.precoMin.setValue(10);
    probe.form.controls.precoMax.setValue(50);
    tick(300);
    expect(emitidos[0].precoMin).toBe(10);

    probe.form.controls.semPreco.setValue(true);
    tick(300);
    expect(probe.form.controls.precoMin.disabled).toBeTrue();
    expect(probe.form.controls.precoMax.disabled).toBeTrue();
    expect(emitidos[1].semPreco).toBeTrue();
    expect(emitidos[1].precoMin).toBeNull();
    expect(emitidos[1].precoMax).toBeNull();

    probe.form.controls.semPreco.setValue(false);
    tick(300);
    expect(probe.form.controls.precoMin.disabled).toBeFalse();
  }));

  it('o select único de ordenação vira ordenarPor + direcao (P11)', fakeAsync(() => {
    expect(opcoesDoSelect(5)).toEqual([
      'nome-asc',
      'nome-desc',
      'estoque-asc',
      'estoque-desc',
      'preco-asc',
      'preco-desc',
    ]);
    probe.form.controls.ordem.setValue('preco-desc');
    tick(300);
    expect(emitidos[0].ordenarPor).toBe('preco');
    expect(emitidos[0].direcao).toBe('desc');
  }));

  it('mostra uma pastilha por filtro ativo, com rótulo legível e o nome canônico da cor', fakeAsync(() => {
    probe.form.controls.corIds.setValue([3, 7]);
    probe.form.controls.estoque.setValue('BAIXO');
    probe.form.controls.precoMin.setValue(10);
    probe.form.controls.precoMax.setValue(50);
    probe.form.controls.eventoIds.setValue([5]);
    tick(300);
    fixture.detectChanges();

    // `toLocaleString` pt-BR separa "R$" do número com NBSP (U+00A0) — normalizamos para comparar.
    const rotulos = probe.pastilhas().map((p) => p.rotulo.replace(/ /g, ' '));
    expect(rotulos).toContain('Cor: ROSA, AZUL');
    expect(rotulos).toContain('Evento: Dia das Mães');
    expect(rotulos).toContain('Estoque baixo');
    expect(rotulos).toContain('Preço: R$ 10 a R$ 50');
    // Ordenação NÃO é filtro: 4 dimensões ativas, 4 pastilhas, N = 4.
    expect(probe.total()).toBe(4);
    expect(probe.pastilhas().length).toBe(contarFiltros(emitidos.at(-1)!));
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.pastilha').length).toBe(4);
  }));

  it('id fora do catálogo vira "#id" na pastilha — nunca um nome inventado', fakeAsync(() => {
    probe.form.controls.corIds.setValue([999]);
    tick(300);
    expect(probe.pastilhas()[0].rotulo).toBe('Cor: #999');
  }));

  it('remover a pastilha tira SÓ aquela dimensão (as outras seguem valendo)', fakeAsync(() => {
    probe.form.controls.corIds.setValue([3]);
    probe.form.controls.estoque.setValue('BAIXO');
    tick(300);

    probe.remover('corIds');
    tick(300);
    const ultimo = emitidos.at(-1)!;
    expect(ultimo.corIds).toEqual([]);
    expect(ultimo.estoque).toBe('BAIXO');
  }));

  it('"Limpar filtros (N)" zera tudo, inclusive a ordenação, e emite UMA vez', fakeAsync(() => {
    probe.form.controls.corIds.setValue([3]);
    probe.form.controls.toxicidade.setValue(['TOXICA']);
    probe.form.controls.ordem.setValue('preco-desc');
    tick(300);
    const antes = emitidos.length;

    probe.limpar();
    tick(300);
    expect(emitidos.length).toBe(antes + 1);
    expect(emitidos.at(-1)).toEqual(FILTRO_VAZIO);
    expect(probe.total()).toBe(0);
  }));

  it('o input `valor` sincroniza a barra SEM virar uma nova requisição (sem laço)', fakeAsync(() => {
    probe.form.controls.corIds.setValue([3]);
    tick(300);
    expect(emitidos.length).toBe(1);

    // A lista-mãe guarda o que recebeu e devolve pelo `valor` — o eco NÃO pode virar 2ª requisição.
    fixture.componentRef.setInput('valor', emitidos[0]);
    fixture.detectChanges();
    tick(300);
    expect(emitidos.length).toBe(1);

    fixture.componentRef.setInput('valor', FILTRO_VAZIO); // limpou pelo estado-vazio da lista
    fixture.detectChanges();
    tick(300);
    expect(emitidos.length).toBe(1); // nenhuma emissão nova
    expect(probe.form.controls.corIds.value).toEqual([]);
  }));

  it('no celular o gatilho abre o painel e o véu fecha (sem MatBottomSheet)', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.veu')).toBeNull();
    expect(el.querySelector('.painel')?.classList.contains('painel--aberto')).toBeFalse();

    (el.querySelector('.cabeca__gatilho') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(probe.aberto()).toBeTrue();
    expect(el.querySelector('.painel')?.classList.contains('painel--aberto')).toBeTrue();

    (el.querySelector('.veu') as HTMLElement).click();
    fixture.detectChanges();
    expect(probe.aberto()).toBeFalse();
    expect(el.querySelector('.veu')).toBeNull();
  });

  it('o gatilho do celular conta os filtros ativos ("Filtros (N)")', fakeAsync(() => {
    probe.form.controls.luz.setValue(['SOL_PLENO']);
    probe.form.controls.semPreco.setValue(true);
    tick(300);
    fixture.detectChanges();
    const gatilho = (fixture.nativeElement as HTMLElement).querySelector('.cabeca__gatilho');
    expect((gatilho?.textContent ?? '').replace(/\s+/g, ' ')).toContain('Filtros (2)');
  }));
});
