import { Component, OnInit, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { CoresService } from '../../../configuracoes/cores/cores.service';
import {
  Caracteristica,
  CorReferencia,
  NecessidadeLuz,
  Produto,
  ProdutoRequest,
  Toxicidade,
} from '../../../../core/models/produto.model';

/** Unidade de DIGITAÇÃO da altura (R12: o banco só guarda cm inteiro — não há coluna de unidade). */
export type UnidadeAltura = 'cm' | 'm';

/** Faixa aceita pelo back em centímetros (§3.3) — o front bloqueia antes de gerar um 400. */
export const ALTURA_MIN_CM = 1;
export const ALTURA_MAX_CM = 10000;

/** Mensagem única do box ligado e vazio (§3.12) — ligar sem escolher nada não é um dado. */
export const ERRO_BOX_VAZIO = 'Escolha ao menos uma opção ou desligue este item.';

/**
 * Converte a altura digitada para o INTEIRO em centímetros do contrato (R14/R15), arredondando
 * **HALF_UP** (`1,255 m → 126`; `45,4 cm → 45`). O `toFixed(6)` antes do `round` corrige o erro de
 * ponto flutuante da multiplicação (`1.255 * 100 === 125.49999999999999`, que arredondaria para 125).
 */
export function paraCentimetros(valor: number, unidade: UnidadeAltura): number {
  const bruto = unidade === 'm' ? valor * 100 : valor;
  return Math.round(Number(bruto.toFixed(6)));
}

/**
 * Exibição determinística da altura (R16), sem estado guardado: `>= 100 cm` vira metros com 2 casas
 * e vírgula decimal pt-BR (`120 → "1,20 m"`); abaixo disso, centímetros inteiros (`45 → "45 cm"`).
 */
export function formatarAltura(alturaCm: number): string {
  if (alturaCm >= 100) {
    return `${(alturaCm / 100).toFixed(2).replace('.', ',')} m`;
  }
  return `${alturaCm} cm`;
}

/** `field` do 400 do back → box que exibe a mensagem (§3.3). O que não estiver aqui é do form-mãe. */
const CAMPO_DO_BOX: Readonly<Record<string, string>> = {
  corIds: 'cores',
  caracteristica: 'porte',
  alturaCm: 'porte',
  toxicidade: 'toxicidade',
  necessidadeLuz: 'luz',
};

/**
 * Atributos botânicos do produto — os 4 "boxes" do ajuste 2 do dono (SPEC-M6 §3.12, CA-32/CA-33).
 *
 * Cada box é um `mat-slide-toggle` que revela o próprio conteúdo: **Cor da planta** (multiselect do
 * catálogo), **Característica** (muda/jovem/adulta + altura só para jovem/adulta), **Toxicidade**
 * (tóxica/não tóxica) e **Necessidade de luz** (multiselect). Todos opcionais (R7): box desligado =
 * atributo limpo — e a toxicidade é TRI-ESTADO (R8): o box desligado É o "não informado".
 *
 * Componente próprio (não inline no `produto-form`) por orçamento de CSS (§9 regra 2/7a) e porque o
 * `produto-form.ts` já é grande. O pai coleta o payload no submit via `viewChild` → `coletar()`.
 *
 * Catálogo de cores: `CoresService` injetado **opcional** (provido no `app.config`, não
 * `providedIn:'root'` — AD-SQ-72). Nos specs herdados do M2/M3, que não o registram, o inject devolve
 * `null` e NENHUM `GET /cores` é disparado: superfície HTTP zero, teste herdado intacto (anti-burla).
 */
@Component({
  selector: 'app-atributos-botanicos',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './atributos-botanicos.html',
  styleUrl: './atributos-botanicos.scss',
})
export class AtributosBotanicos implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly cores = inject(CoresService, { optional: true });

  /** Produto em edição (`null` = criação): pré-liga os boxes que já têm dado e serve de base ao limpar. */
  readonly produto = input<Produto | null>(null);

  protected readonly boxCores = signal(false);
  protected readonly boxPorte = signal(false);
  protected readonly boxToxicidade = signal(false);
  protected readonly boxLuz = signal(false);

  /** Opções do multiselect: catálogo do back, semeado com as cores do próprio produto na edição. */
  protected readonly catalogo = signal<CorReferencia[]>([]);
  /** Carga resolvida (settled) — guard anti-flash do hint "nenhuma cor" (padrão AD-SQ-72/CA-15). */
  protected readonly catalogoPronto = signal(false);
  /** O GET falhou: o vazio NÃO é "catálogo vazio", e a tela diz isso (nada de dado inventado). */
  protected readonly catalogoFalhou = signal(false);

  protected readonly corIds = this.fb.nonNullable.control<number[]>([]);
  protected readonly caracteristica = this.fb.control<Caracteristica | null>(null);
  protected readonly altura = this.fb.control<number | null>(null);
  protected readonly toxicidade = this.fb.control<Toxicidade | null>(null);
  protected readonly luz = this.fb.nonNullable.control<NecessidadeLuz[]>([]);

  /** Unidade de digitação (R17): `cm` ao criar; ao editar, a que a R16 usaria para o valor salvo. */
  protected readonly unidade = signal<UnidadeAltura>('cm');
  /** Aviso de que trocar para "muda" apagou a altura (R13 — evita um 400 que o operador não causou). */
  protected readonly alturaRemovida = signal(false);
  /** Erro por box (chave = box): vazio no submit, ou `field` do 400 do back roteado pelo pai. */
  protected readonly erros = signal<Record<string, string>>({});
  /** GET do catálogo em voo — impede uma 2ª carga enquanto a 1ª não resolveu. */
  private carregando = false;

  /**
   * Só jovem/adulta aceitam altura (R13) — o campo nem aparece para muda/sem característica. É
   * MÉTODO, não `computed`: a fonte é o `value` de um `FormControl` (não é signal), e um `computed`
   * sobre ele cacharia o primeiro valor e nunca mais reavaliaria.
   */
  protected aceitaAltura(): boolean {
    const porte = this.caracteristica.value;
    return porte === 'JOVEM' || porte === 'ADULTA';
  }

  /** Catálogo vazio E resolvido ⇒ select inerte (AD-SQ-72): nada a escolher, mas o hint explica. */
  private readonly catalogoVazioEffect = effect(() => {
    const vazio = this.catalogoPronto() && this.catalogo().length === 0;
    if (vazio && this.corIds.enabled) {
      this.corIds.disable({ emitEvent: false });
    } else if (!vazio && this.corIds.disabled) {
      this.corIds.enable({ emitEvent: false });
    }
  });

  ngOnInit(): void {
    const p = this.produto();
    if (!p) {
      return;
    }
    // Edição: o box nasce LIGADO quando o produto já tem o atributo (§3.12).
    if (p.cores?.length) {
      this.boxCores.set(true);
      this.catalogo.set([...p.cores]); // semeia as opções antes do GET (o trigger nunca fica vazio)
      this.corIds.setValue(p.cores.map((c) => c.id));
      this.carregarCatalogo();
    }
    if (p.caracteristica) {
      this.boxPorte.set(true);
      this.caracteristica.setValue(p.caracteristica);
      this.preencherAltura(p.alturaCm ?? null);
    }
    if (p.toxicidade) {
      this.boxToxicidade.set(true);
      this.toxicidade.setValue(p.toxicidade);
    }
    if (p.necessidadeLuz?.length) {
      this.boxLuz.set(true);
      this.luz.setValue([...p.necessidadeLuz]);
    }
  }

  /**
   * Payload dos 5 campos do §3.3 — ou `null` quando algum box está LIGADO E VAZIO (o submit é
   * bloqueado pelo pai e nenhuma requisição sai, CA-32; o erro fica no próprio box).
   *
   * Um campo só entra no payload quando tem valor OU quando o produto já tinha aquele atributo
   * (aí vai `null`/`[]` para LIMPAR — §3.3). Omitir o resto é equivalente em efeito (ausente = "não
   * altera"/nada a limpar) e preserva o payload exato de 6 campos dos specs M2/M3 (anti-burla),
   * exatamente como o `eventoIds` já faz desde o M4.
   */
  coletar(): Partial<ProdutoRequest> | null {
    const erros: Record<string, string> = {};
    if (this.boxCores() && this.corIds.value.length === 0) {
      erros['cores'] = ERRO_BOX_VAZIO;
    }
    if (this.boxLuz() && this.luz.value.length === 0) {
      erros['luz'] = ERRO_BOX_VAZIO;
    }
    if (this.boxToxicidade() && this.toxicidade.value === null) {
      erros['toxicidade'] = ERRO_BOX_VAZIO;
    }
    if (this.boxPorte()) {
      const cm = this.alturaEmCm();
      if (this.caracteristica.value === null) {
        erros['porte'] = ERRO_BOX_VAZIO;
      } else if (cm !== null && (cm < ALTURA_MIN_CM || cm > ALTURA_MAX_CM)) {
        erros['porte'] = `A altura deve estar entre ${ALTURA_MIN_CM} cm e 100 m.`;
      }
    }
    this.erros.set(erros);
    if (Object.keys(erros).length > 0) {
      return null;
    }

    const p = this.produto();
    const req: Partial<ProdutoRequest> = {};
    const porte = this.boxPorte() ? this.caracteristica.value : null;
    if (porte !== null || p?.caracteristica != null) {
      req.caracteristica = porte;
    }
    // A altura só acompanha jovem/adulta (R13): com muda ela vai `null`, nunca um 400 evitável.
    const cm = this.aceitaAltura() && this.boxPorte() ? this.alturaEmCm() : null;
    if (cm !== null || p?.alturaCm != null) {
      req.alturaCm = cm;
    }
    const tox = this.boxToxicidade() ? this.toxicidade.value : null;
    if (tox !== null || p?.toxicidade != null) {
      req.toxicidade = tox;
    }
    const luz = this.boxLuz() ? this.luz.value : [];
    if (luz.length > 0 || (p?.necessidadeLuz?.length ?? 0) > 0) {
      req.necessidadeLuz = [...luz];
    }
    const ids = this.boxCores() ? this.corIds.value : [];
    if (ids.length > 0 || (p?.cores?.length ?? 0) > 0) {
      req.corIds = [...ids];
    }
    return req;
  }

  /**
   * Roteia um `details[].field` do 400 para o box dono do campo (§3.3). Devolve `false` quando o
   * campo não é botânico — aí o form-mãe o aplica no próprio `FormGroup`, como sempre fez.
   */
  aplicarErro(campo: string, mensagem: string): boolean {
    const box = CAMPO_DO_BOX[campo];
    if (!box) {
      return false;
    }
    this.erros.update((atuais) => ({ ...atuais, [box]: mensagem }));
    return true;
  }

  /** Ligar o box de cores carrega o catálogo sob demanda; desligar limpa a seleção e o erro. */
  protected alternarCores(ligado: boolean): void {
    this.boxCores.set(ligado);
    if (ligado) {
      this.carregarCatalogo();
    } else {
      this.corIds.setValue([]);
    }
    this.limparErro('cores');
  }

  protected alternarPorte(ligado: boolean): void {
    this.boxPorte.set(ligado);
    if (!ligado) {
      this.caracteristica.setValue(null);
      this.altura.setValue(null);
      this.alturaRemovida.set(false);
    }
    this.limparErro('porte');
  }

  protected alternarToxicidade(ligado: boolean): void {
    this.boxToxicidade.set(ligado);
    if (!ligado) {
      this.toxicidade.setValue(null);
    }
    this.limparErro('toxicidade');
  }

  protected alternarLuz(ligado: boolean): void {
    this.boxLuz.set(ligado);
    if (!ligado) {
      this.luz.setValue([]);
    }
    this.limparErro('luz');
  }

  /**
   * Trocar a característica para "muda" LIMPA a altura e avisa (R13): a UI impede o 400 em vez de
   * deixar o back recusar um dado que o operador nem lembra de ter digitado.
   */
  protected aoTrocarCaracteristica(): void {
    this.alturaRemovida.set(!this.aceitaAltura() && this.altura.value !== null);
    if (!this.aceitaAltura()) {
      this.altura.setValue(null);
    }
    this.limparErro('porte');
  }

  /** Trocar a unidade CONVERTE o que já está digitado (120 cm ↔ 1,2 m) — nunca reinterpreta o número. */
  protected trocarUnidade(nova: UnidadeAltura): void {
    const cm = this.alturaEmCm();
    this.unidade.set(nova);
    if (cm !== null) {
      this.altura.setValue(nova === 'm' ? cm / 100 : cm);
    }
  }

  /** Cores escolhidas, na ordem do catálogo — exibidas com a amostra abaixo do select. */
  protected coresSelecionadas(): CorReferencia[] {
    const ids = this.corIds.value;
    return this.catalogo().filter((c) => ids.includes(c.id));
  }

  /** Leitura canônica (R16) do que será gravado — o operador vê "2,50 m" ao digitar 250 cm. */
  protected alturaLegivel(): string | null {
    const cm = this.alturaEmCm();
    return cm !== null && cm >= ALTURA_MIN_CM && cm <= ALTURA_MAX_CM ? formatarAltura(cm) : null;
  }

  /** Altura digitada em centímetros inteiros, ou `null` quando o campo está vazio. */
  private alturaEmCm(): number | null {
    const valor = this.altura.value;
    return valor === null || Number.isNaN(valor) ? null : paraCentimetros(valor, this.unidade());
  }

  private preencherAltura(alturaCm: number | null): void {
    if (alturaCm === null) {
      return;
    }
    const emMetros = alturaCm >= 100;
    this.unidade.set(emMetros ? 'm' : 'cm');
    this.altura.setValue(emMetros ? alturaCm / 100 : alturaCm);
  }

  private limparErro(box: string): void {
    const atuais = this.erros();
    if (atuais[box]) {
      const resto = { ...atuais };
      delete resto[box];
      this.erros.set(resto);
    }
  }

  /**
   * Uma carga por diálogo (`GET /cores?tamanho=100`, §3.12). SEM serviço — specs herdados do M2/M3,
   * que não o registram — o catálogo resolve VAZIO na hora e NENHUM request sai. `pronto` só vira
   * `true` com a resposta: durante a carga o hint de "vazio" não pisca (anti-flash, CA-15).
   */
  private carregarCatalogo(): void {
    if (this.carregando || this.catalogoPronto()) {
      return;
    }
    if (!this.cores) {
      // Serviço ausente: NUNCA auto-desliga aqui (§3.6/§12 #4) — sem `GET` não houve resposta que
      // provasse "catálogo vazio", e o ligado-e-vazio continua sendo erro do operador (CA-21).
      this.catalogoPronto.set(true);
      return;
    }
    this.carregando = true;
    this.cores.listar(0, 100).subscribe({
      next: (pagina) => {
        // UNIÃO (D4a): a página do catálogo NUNCA apaga a semente de `p.cores` — com >100 cores a
        // página 1 não traz a cor do produto, e substituir desvincularia em silêncio no próximo PUT.
        const daPagina = pagina.conteudo;
        const idsDaPagina = new Set(daPagina.map((c) => c.id));
        const semeadasForaDaPagina = this.catalogo().filter((c) => !idsDaPagina.has(c.id));
        this.catalogo.set([...daPagina, ...semeadasForaDaPagina]);
        this.catalogoPronto.set(true);
        this.desligarBoxSeCatalogoVazio();
      },
      error: () => {
        this.catalogoFalhou.set(true);
        this.catalogoPronto.set(true);
        this.desligarBoxSeCatalogoVazio();
      },
    });
  }

  /**
   * D6 — o beco sem saída deixa de existir: catálogo que RESOLVEU vazio (vazio de verdade ou GET que
   * falhou) desliga o box sozinho, porque o vazio é do sistema e não uma escolha do operador. Com o
   * box desligado a regra do ligado-e-vazio não se aplica e o submit passa; `coletar()` não muda.
   *
   * ⚠️ Chamado SÓ dos ramos `next`/`error` do HTTP (§3.6): no ramo do serviço ausente derrubaria o
   * caso herdado do ligado-e-vazio, e num `effect` passaria por acidente de ciclo de detecção.
   */
  private desligarBoxSeCatalogoVazio(): void {
    if (this.catalogo().length === 0) {
      this.boxCores.set(false);
      this.limparErro('cores');
    }
  }
}
