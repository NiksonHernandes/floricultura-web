import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, filter, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { Cor } from '../../../core/models/cor.model';
import { Evento } from '../../../core/models/evento.model';
import {
  DirecaoOrdem,
  EstoqueFiltro,
  FILTRO_VAZIO,
  FiltroProdutos,
  OrdenarProdutoPor,
  contarFiltros,
} from '../../../core/models/produto-filtro.model';

/** Dimensão removível pela pastilha. `preco` cobre as duas pontas da faixa (é um intervalo só). */
export type DimensaoFiltro =
  | 'corIds'
  | 'eventoIds'
  | 'caracteristica'
  | 'toxicidade'
  | 'luz'
  | 'estoque'
  | 'preco'
  | 'semPreco';

/** Pastilha de filtro ativo: o que remover + o rótulo legível que o operador reconhece. */
export interface Pastilha {
  dimensao: DimensaoFiltro;
  rotulo: string;
}

/** Chave do ÚNICO select de ordenação (P11): um controle para `ordenarPor` + `direcao`. */
export type ChaveOrdem = `${OrdenarProdutoPor}-${DirecaoOrdem}`;

/** Rótulos pt-BR dos enums. A CHAVE é o literal do contrato e viaja em maiúsculas (AD-SQ-127). */
const ROTULO_ESTOQUE: Readonly<Record<EstoqueFiltro, string>> = {
  SEM_ESTOQUE: 'Sem estoque',
  BAIXO: 'Estoque baixo',
  COM_ESTOQUE: 'Com estoque',
};
const ROTULO_CARACTERISTICA: Readonly<Record<string, string>> = {
  MUDA: 'Muda',
  JOVEM: 'Jovem',
  ADULTA: 'Adulta',
};
const ROTULO_TOXICIDADE: Readonly<Record<string, string>> = {
  TOXICA: 'Tóxica',
  NAO_TOXICA: 'Não tóxica',
};
const ROTULO_LUZ: Readonly<Record<string, string>> = {
  SOL_PLENO: 'Sol pleno',
  MEIA_SOMBRA: 'Meia-sombra',
  SOMBRA: 'Sombra',
};

/** As 3 opções de estoque, na ordem em que aparecem — atalhos, não categorias exclusivas (§3.6). */
export const ATALHOS_ESTOQUE: readonly EstoqueFiltro[] = ['SEM_ESTOQUE', 'BAIXO', 'COM_ESTOQUE'];

/** Preço em BRL sem casas quando inteiro ("R$ 50"), com casas quando não ("R$ 12,50"). */
function moeda(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
  });
}

/**
 * Barra de filtros da lista de produtos — ajustes 5 e 6 do dono (SPEC-M6 §3.14, CA-36/CA-37).
 *
 * Componente próprio (não inline em `produtos.html`) por ORÇAMENTO DE CSS: §9 regra 2/6 —
 * `produtos.scss` fechou a T-M6-07 em 7513 B, com o teto auto-imposto em 7500. Todo byte da barra
 * **e do painel inferior do celular** mora neste SCSS, que tem budget próprio.
 *
 * Uma requisição por mudança (§3.14): TUDO passa por um único `valueChanges` com `debounceTime(300)`
 * — o mesmo número do campo de busca. Mexer em dois controles no mesmo gesto emite **uma** vez, e
 * o `filter` estrutural mata a emissão que não mudaria a URL (reescolher o mesmo valor no
 * `mat-select`, por exemplo). Quem zera `pagina` e chama o back é a lista-mãe.
 *
 * O filtro compara contra o `estado` VIGENTE, nunca contra a última emissão (armadilha §12 #39 /
 * AD-SQ-139): este form também é escrito POR FORA (`valor` → `aplicar(f, false)`, o "Limpar filtros"
 * do estado-vazio), e `distinctUntilChanged` — cuja baseline é a última emissão — silenciaria a
 * reaplicação do MESMO valor depois do limpar: controle marcado, zero requisição, tela inerte.
 *
 * Celular (~90% do uso): a barra colapsa no botão "Filtros (N)" e os mesmos controles viram painel
 * deslizante de baixo, com véu — reusando o PADRÃO do `.veu` da lista, sem `MatBottomSheet`
 * (módulo novo é proibido pelo §9). O DOM é ÚNICO: quem troca barra ↔ painel é CSS
 * (`acima($bp-sm)`), nunca um `@if` por largura — armadilha §12 #24(b): observar viewport em TS
 * custa listener e tira o controle do DOM no Karma, matando a prova do CA-36.
 */
@Component({
  selector: 'app-filtros-produtos',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './filtros-produtos.html',
  styleUrl: './filtros-produtos.scss',
})
export class FiltrosProdutos {
  private readonly fb = inject(FormBuilder);

  /** Catálogo de cores (`GET /cores`) e de eventos — carregados pela lista-mãe (padrão AD-SQ-72). */
  readonly cores = input<Cor[]>([]);
  readonly eventos = input<Evento[]>([]);
  /** Estado vindo de fora (limpar pelo estado-vazio, por exemplo). Sincroniza SEM reemitir. */
  readonly valor = input<FiltroProdutos>(FILTRO_VAZIO);
  /** A lista-mãe reseta `pagina=0` e chama o back UMA vez. */
  readonly mudou = output<FiltroProdutos>();

  protected readonly atalhos = ATALHOS_ESTOQUE;
  protected readonly rotuloEstoque = ROTULO_ESTOQUE;

  /** Painel do celular aberto? No desktop o CSS ignora este estado (a barra está sempre à vista). */
  protected readonly aberto = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    corIds: this.fb.nonNullable.control<number[]>([]),
    eventoIds: this.fb.nonNullable.control<number[]>([]),
    caracteristica: this.fb.nonNullable.control<string[]>([]),
    toxicidade: this.fb.nonNullable.control<string[]>([]),
    luz: this.fb.nonNullable.control<string[]>([]),
    estoque: this.fb.control<EstoqueFiltro | null>(null),
    precoMin: this.fb.control<number | null>(null),
    precoMax: this.fb.control<number | null>(null),
    semPreco: this.fb.nonNullable.control(false),
    ordem: this.fb.nonNullable.control<ChaveOrdem>('nome-asc'),
  });

  /** Espelho em signal do estado do form — é o que o template lê (pastilhas, contador, travas). */
  private readonly estado = signal<FiltroProdutos>(FILTRO_VAZIO);

  /** N de "Filtros (N)" / "Limpar filtros (N)". Ordenação não é filtro (ver `contarFiltros`). */
  protected readonly total = computed(() => contarFiltros(this.estado()));

  protected readonly pastilhas = computed<Pastilha[]>(() => {
    const f = this.estado();
    const lista: Pastilha[] = [];
    if (f.corIds.length > 0) {
      lista.push({ dimensao: 'corIds', rotulo: `Cor: ${this.nomesCor(f.corIds)}` });
    }
    if (f.eventoIds.length > 0) {
      lista.push({ dimensao: 'eventoIds', rotulo: `Evento: ${this.nomesEvento(f.eventoIds)}` });
    }
    if (f.caracteristica.length > 0) {
      lista.push({
        dimensao: 'caracteristica',
        rotulo: `Característica: ${traduzir(f.caracteristica, ROTULO_CARACTERISTICA)}`,
      });
    }
    if (f.toxicidade.length > 0) {
      lista.push({
        dimensao: 'toxicidade',
        rotulo: `Toxicidade: ${traduzir(f.toxicidade, ROTULO_TOXICIDADE)}`,
      });
    }
    if (f.luz.length > 0) {
      lista.push({ dimensao: 'luz', rotulo: `Luz: ${traduzir(f.luz, ROTULO_LUZ)}` });
    }
    if (f.estoque !== null) {
      lista.push({ dimensao: 'estoque', rotulo: ROTULO_ESTOQUE[f.estoque] });
    }
    if (f.precoMin !== null || f.precoMax !== null) {
      lista.push({ dimensao: 'preco', rotulo: `Preço: ${faixa(f.precoMin, f.precoMax)}` });
    }
    if (f.semPreco) {
      lista.push({ dimensao: 'semPreco', rotulo: 'Somente sem preço' });
    }
    return lista;
  });

  constructor() {
    // Ligar "somente sem preço" LIMPA e DESABILITA a faixa (§3.14): a exclusividade fica garantida
    // na UI antes de o back precisar devolver o 400. Sem `emitEvent` para não contar como 2 mudanças.
    this.form.controls.semPreco.valueChanges.pipe(takeUntilDestroyed()).subscribe((sem) => {
      if (sem) {
        this.form.patchValue({ precoMin: null, precoMax: null }, { emitEvent: false });
      }
      this.travarFaixa(sem);
    });

    this.form.valueChanges
      .pipe(
        debounceTime(300),
        map(() => this.montar()),
        filter((f) => JSON.stringify(f) !== JSON.stringify(this.estado())),
        takeUntilDestroyed(),
      )
      .subscribe((f) => {
        this.estado.set(f);
        this.mudou.emit(f);
      });
  }

  /**
   * Sincroniza o form quando o filtro muda POR FORA (botão "limpar" do estado-vazio da lista-mãe).
   * Aplica com `emitEvent: false` e compara antes: sem isso, cada emissão voltaria pelo `valor` e
   * dispararia uma segunda requisição — o laço que o "uma requisição por mudança" proíbe.
   */
  private readonly sincronia = effect(() => {
    const externo = this.valor();
    if (JSON.stringify(externo) !== JSON.stringify(this.montar())) {
      this.aplicar(externo, false);
    }
  });

  /** Estado atual como contrato do §3.6. `getRawValue` inclui a faixa desabilitada por `semPreco`. */
  montar(): FiltroProdutos {
    const v = this.form.getRawValue();
    const [ordenarPor, direcao] = v.ordem.split('-') as [OrdenarProdutoPor, DirecaoOrdem];
    return {
      corIds: [...v.corIds],
      eventoIds: [...v.eventoIds],
      caracteristica: [...v.caracteristica] as FiltroProdutos['caracteristica'],
      toxicidade: [...v.toxicidade] as FiltroProdutos['toxicidade'],
      luz: [...v.luz] as FiltroProdutos['luz'],
      estoque: v.estoque,
      // `semPreco` ligado ⇒ a faixa NÃO viaja (o par junto é 400 no back — §3.6).
      precoMin: v.semPreco ? null : numero(v.precoMin),
      precoMax: v.semPreco ? null : numero(v.precoMax),
      semPreco: v.semPreco,
      ordenarPor,
      direcao,
    };
  }

  /** Atalho de estoque: escolha única; clicar no que já está ativo LIMPA a dimensão (§3.14). */
  protected alternarEstoque(valor: EstoqueFiltro): void {
    const atual = this.form.controls.estoque.value;
    this.form.controls.estoque.setValue(atual === valor ? null : valor);
  }

  /** Remove UMA dimensão (pastilha `×`) — as outras seguem valendo. */
  protected remover(dimensao: DimensaoFiltro): void {
    switch (dimensao) {
      case 'estoque':
        this.form.controls.estoque.setValue(null);
        break;
      case 'preco':
        this.form.patchValue({ precoMin: null, precoMax: null });
        break;
      case 'semPreco':
        this.form.controls.semPreco.setValue(false);
        break;
      case 'corIds':
        this.form.controls.corIds.setValue([]);
        break;
      case 'eventoIds':
        this.form.controls.eventoIds.setValue([]);
        break;
      default:
        // `caracteristica`/`toxicidade`/`luz` são os três `FormControl<string[]>` restantes.
        this.form.controls[dimensao].setValue([]);
    }
  }

  /** Zera TUDO, inclusive a ordenação (volta ao default `nome`/`asc` do contrato). */
  protected limpar(): void {
    this.aplicar(FILTRO_VAZIO, true);
  }

  protected abrir(): void {
    this.aberto.set(true);
  }

  protected fechar(): void {
    this.aberto.set(false);
  }

  /** Escreve o filtro inteiro no form. `emitir=false` = sincronia externa (não vira requisição). */
  private aplicar(f: FiltroProdutos, emitir: boolean): void {
    this.travarFaixa(f.semPreco);
    this.form.setValue(
      {
        corIds: [...f.corIds],
        eventoIds: [...f.eventoIds],
        caracteristica: [...f.caracteristica],
        toxicidade: [...f.toxicidade],
        luz: [...f.luz],
        estoque: f.estoque,
        precoMin: f.precoMin,
        precoMax: f.precoMax,
        semPreco: f.semPreco,
        ordem: `${f.ordenarPor}-${f.direcao}` as ChaveOrdem,
      },
      { emitEvent: emitir },
    );
    if (!emitir) {
      this.estado.set(f);
    }
  }

  private travarFaixa(semPreco: boolean): void {
    const opcoes = { emitEvent: false };
    for (const c of [this.form.controls.precoMin, this.form.controls.precoMax]) {
      if (semPreco) {
        c.disable(opcoes);
      } else {
        c.enable(opcoes);
      }
    }
  }

  /** Nome canônico da cor (R1d/CA-40). Id fora do catálogo aparece como `#id` — nunca inventado. */
  private nomesCor(ids: number[]): string {
    const cat = this.cores();
    return ids.map((id) => cat.find((c) => c.id === id)?.nome ?? `#${id}`).join(', ');
  }

  private nomesEvento(ids: number[]): string {
    const cat = this.eventos();
    return ids.map((id) => cat.find((e) => e.id === id)?.nome ?? `#${id}`).join(', ');
  }
}

/** `<input type="number">` vazio devolve `null`; `NaN` (digitação parcial) também não é filtro. */
function numero(v: number | null): number | null {
  return v === null || Number.isNaN(v) ? null : v;
}

function traduzir(valores: string[], rotulos: Readonly<Record<string, string>>): string {
  return valores.map((v) => rotulos[v] ?? v).join(', ');
}

function faixa(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${moeda(min)} a ${moeda(max)}`;
  return min !== null ? `de ${moeda(min)}` : `até ${moeda(max!)}`;
}
