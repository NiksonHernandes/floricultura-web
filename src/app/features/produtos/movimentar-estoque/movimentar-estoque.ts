import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogModule,
} from '@angular/material/dialog';

import { ProdutosService } from '../produtos.service';
import { ClientesService } from '../../clientes/clientes.service';
import { FornecedoresService } from '../../fornecedores/fornecedores.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { Cliente } from '../../../core/models/cliente.model';
import { Fornecedor } from '../../../core/models/fornecedor.model';
import {
  DescontoTipo,
  Movimentacao,
  MovimentacaoRequest,
  Produto,
  TipoMovimentacao,
  UnidadeMedida,
} from '../../../core/models/produto.model';

/** Qual contraparte o tipo vigente admite (RF-2/AD-SQ-64): ENTRADA→fornecedor, SAÍDA→cliente. */
type TipoContraparte = 'FORNECEDOR' | 'CLIENTE' | null;

/** Dados do diálogo: o produto cujo estoque será movimentado. */
export interface MovimentarEstoqueDados {
  produto: Produto;
}

/** Rótulos amigáveis de unidade (AD-SQ-31): `m3` vira `m³`. */
const ROTULOS_UNIDADE: Record<UnidadeMedida, string> = {
  un: 'un',
  kg: 'kg',
  saco: 'saco',
  m3: 'm³',
  l: 'L',
  g: 'g',
};

/** Rótulos e descrição de cada tipo (AD-SQ-30) — orienta o operador sem esconder a semântica. */
export const OPCOES_TIPO: ReadonlyArray<{
  valor: TipoMovimentacao;
  rotulo: string;
  dica: string;
}> = [
  { valor: 'ENTRADA', rotulo: 'Entrada', dica: 'Soma ao estoque atual.' },
  { valor: 'SAIDA', rotulo: 'Saída', dica: 'Subtrai do estoque (não pode passar do disponível).' },
  { valor: 'AJUSTE', rotulo: 'Ajuste', dica: 'Define a quantidade final (0 = zerar).' },
];

/**
 * Arredonda para 2 casas com **HALF_UP no empate** — a MESMA normalização que o back aplica
 * (SPEC-M7 §3.2-b1 / AD-SQ-161: `setScale(2, RoundingMode.HALF_UP)`).
 *
 * `Math.round(v * 100) / 100` **NÃO serve**: `8.165 * 100` vale `816.4999999999999` em binário
 * (medido em `node`), o empate DESCE para `8.16` e a tela mostraria `R$ 16,32` enquanto o banco
 * grava `R$ 16,34` (`BigDecimal("8.165").setScale(2, HALF_UP)`) — divergência que só aparece
 * **depois** de salvar, numa linha imutável. Deslocar a vírgula na REPRESENTAÇÃO DECIMAL
 * (`Number('8.165e2')` = `816.5`, exato) preserva o número que o operador digitou, que é o mesmo
 * que o back lê do JSON com `BigDecimal`.
 *
 * ⚠️ `10.005` **não** serve de prova (AD-SQ-164/R6): `10.005 * 100` vale `1000.5000000000001`, o
 * empate SOBE e o atalho binário ACERTA por acidente — ele documenta a regra, não a discrimina.
 *
 * Os valores deste modal são ≥ 0 (`min="0"`, e o back rejeita negativo em V1/V6), então a
 * assimetria do `Math.round` no negativo não é alcançável aqui.
 */
export function normalizar2(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  const texto = String(valor);
  // Fora da notação decimal simples (ex.: `1e-7`) não há centavo a preservar — cai no caminho comum.
  if (!/^-?\d+(\.\d+)?$/.test(texto)) return Math.round(valor * 100) / 100;
  return Math.round(Number(`${texto}e2`)) / 100;
}

/**
 * Decompõe um decimal na forma `{ inteiro, casas }` — `1.5` vira `{15, 1}` — **sem passar pelo
 * binário**. `null` quando o número não está em notação decimal simples ou quando o inteiro sairia
 * fora do alcance seguro: nesses casos quem responde é o caminho antigo, e o back continua sendo a
 * autoridade (§3.2-d).
 */
function decompor(valor: number): { inteiro: number; casas: number } | null {
  const texto = String(valor);
  if (!/^\d+(\.\d+)?$/.test(texto)) return null;
  const casas = texto.includes('.') ? texto.split('.')[1].length : 0;
  const inteiro = Number(`${texto}e${casas}`);
  return Number.isSafeInteger(inteiro) ? { inteiro, casas } : null;
}

/**
 * Arredonda `inteiro ÷ 10^casas` para 2 decimais com **HALF_UP**, em aritmética inteira.
 *
 * O empate é decidido por `resto × 2 >= divisor`, que é exato — enquanto `Math.round(x)` sobre um
 * `x` que já nasceu do binário decide sobre um número que **não é** o que o operador digitou.
 */
function arredondar2(inteiro: number, casas: number): number | null {
  if (casas <= 2) return inteiro / 10 ** (casas - 2) / 100;
  const divisor = 10 ** (casas - 2);
  if (!Number.isSafeInteger(divisor)) return null;
  const quociente = Math.floor(inteiro / divisor);
  const resto = inteiro - quociente * divisor;
  return (resto * 2 >= divisor ? quociente + 1 : quociente) / 100;
}

/**
 * `a × b` arredondado a 2 casas com HALF_UP, **na representação decimal** (BUG-002).
 *
 * ⚠️ **Normalizar DEPOIS da multiplicação não basta — foi o defeito de dinheiro do M7.** Com
 * `quantidade 1,5 × unitário 0,15`, o produto binário é `0.22499999999999998` (medido em `node`): o
 * empate **já se perdeu** antes de qualquer arredondamento, a tela mostrava **R$ 0,22** e o banco
 * gravava **R$ 0,23** (`CalculoFinanceiroTest:130` crava `0.23` para este par) — numa linha
 * **imutável**, que só se corrige com estorno.
 *
 * Aqui os dois fatores viram inteiros (`15` e `15`), o produto é exato (`225`, 3 casas) e o empate é
 * decidido em inteiro: `R$ 0,23`, igual ao back. **Quantidade inteira nunca expôs o defeito** — é
 * por isso que os casos de CA-53 com `8.165 × 2` ficavam verdes: o VALOR discriminava, o PAR não.
 */
export function multiplicar2(a: number, b: number): number {
  const x = decompor(a);
  const y = decompor(b);
  if (!x || !y) return normalizar2(a * b);
  const produto = x.inteiro * y.inteiro;
  if (!Number.isSafeInteger(produto)) return normalizar2(a * b);
  return arredondar2(produto, x.casas + y.casas) ?? normalizar2(a * b);
}

/**
 * `bruto × percentual ÷ 100` arredondado a 2 casas com HALF_UP, na representação decimal.
 *
 * Mesma porta do `multiplicar2`, e ela precisa de prova PRÓPRIA (AD-SQ-167: a discriminação é por
 * **caminho** de arredondamento). Medido: bruto `R$ 0,70` a `45 %` dá `0.31499999999999995` em
 * binário ⇒ a tela descontava **0,31** enquanto o banco desconta **0,32**.
 */
export function percentual2(bruto: number, percentual: number): number {
  const x = decompor(bruto);
  const y = decompor(percentual);
  if (!x || !y) return normalizar2((bruto * percentual) / 100);
  const produto = x.inteiro * y.inteiro;
  if (!Number.isSafeInteger(produto)) return normalizar2((bruto * percentual) / 100);
  return arredondar2(produto, x.casas + y.casas + 2) ?? normalizar2((bruto * percentual) / 100);
}

/**
 * Diálogo de movimentação de estoque — "o livro-caixa da prateleira"
 * (SPEC-M2 §7 T-M2-9, CA-20 parte movimentação / CA-11, AD-SQ-30).
 *
 * Registra ENTRADA/SAÍDA/AJUSTE contra o ledger imutável. A SAÍDA acima do estoque volta `400`
 * com `message:"Estoque insuficiente (X em estoque)."`, que é exibido NO diálogo sem quebrar a
 * tela nem fechar (CA-11). Ao sucesso fecha devolvendo o `MovimentacaoResponse` (a lista-mãe
 * recarrega o estoque). Mostra também as ÚLTIMAS movimentações (`movimentacoes(id, 0, 5)`).
 * Usa `MatDialog` (focus-trap/Esc/backdrop nativos — P2-2/P2-3). Só ADMIN abre (o back barra USER).
 *
 * **RF-2 (REVISÃO 2026-09-04/AD-SQ-64) — contraparte opcional por tipo.** ENTRADA mostra um select
 * **Fornecedor** (opcional); SAÍDA mostra **Cliente** (opcional); AJUSTE nenhum. Trocar o tipo LIMPA a
 * contraparte do outro tipo (controle standalone, fora do group — preserva `form.setValue` de 3 campos
 * dos specs herdados do M2/M4). As opções são carregadas **sob demanda ao abrir o select** (não no
 * `ngOnInit` nem na troca de tipo): assim as suítes herdadas (que nunca abrem o select) mantêm o
 * `httpMock.verify()` limpo — invariante anti-burla (R5.5), mesma tática do RF-1. O contrato observável
 * é honrado (`GET /fornecedores?tamanho=100` / `GET /clientes?tamanho=100`; payload com `fornecedorId`
 * ou `clienteId` só quando há seleção — §R3.3).
 *
 * **M7 (SPEC-M7 §3.12) — valores financeiros.** `valorUnitario`, `descontoTipo` (alternador % / R$)
 * e `descontoValor` são controles **standalone**, fora do `form` group, pelo mesmo motivo da
 * contraparte (§3.12-a): os specs herdados fazem `form.setValue` de 3 chaves e `toEqual` ESTRITO do
 * corpo. Eles só entram no payload quando preenchidos, e **já normalizados a 2 casas** (§3.2-b1) —
 * o total exibido ao vivo usa a mesma normalização, para tela e banco nunca divergirem de 1 centavo.
 * `AJUSTE` esconde e limpa o bloco (PA#1/AD-SQ-160); a SAÍDA pré-preenche o unitário com
 * `produto.preco` quando o campo está intocado (§3.12-d) e **sair da SAÍDA descarta esse prefill**
 * enquanto ele seguir `pristine` (AD-SQ-166). **O back continua sendo a autoridade**
 * (§3.2-d): o que fica gravado é o que a resposta do POST devolve.
 */
@Component({
  selector: 'app-movimentar-estoque',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './movimentar-estoque.html',
  styleUrl: './movimentar-estoque.scss',
})
export class MovimentarEstoque implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ProdutosService);
  private readonly fornecedoresService = inject(FornecedoresService);
  private readonly clientesService = inject(ClientesService);
  private readonly ref = inject(MatDialogRef<MovimentarEstoque, Movimentacao>);
  protected readonly dados = inject<MovimentarEstoqueDados>(MAT_DIALOG_DATA);

  protected readonly produto = this.dados.produto;
  protected readonly opcoesTipo = OPCOES_TIPO;

  protected readonly enviando = signal(false);
  /** Mensagem de bloqueio/erro do 400 (ex.: "Estoque insuficiente (20 em estoque).") — CA-11. */
  protected readonly erroGeral = signal<string | null>(null);

  /** Últimas movimentações (histórico curto) — `criadoEm DESC`. */
  protected readonly historico = signal<Movimentacao[]>([]);
  protected readonly carregandoHistorico = signal(false);
  protected readonly erroHistorico = signal(false);

  protected readonly form = this.fb.group({
    tipo: this.fb.nonNullable.control<TipoMovimentacao | ''>('', [Validators.required]),
    quantidade: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    motivo: this.fb.nonNullable.control('', [Validators.maxLength(255)]),
  });

  /**
   * Contraparte (RF-2/§R3.3) — controle STANDALONE, FORA do `form` group (preserva o `form.setValue`
   * de 3 campos dos specs herdados M2/M4 — anti-burla). Guarda o id do fornecedor (ENTRADA) OU do
   * cliente (SAÍDA); `null` = sem contraparte. Trocar o tipo o zera (limpa a seleção do outro tipo).
   */
  protected readonly contraparteId = this.fb.control<number | null>(null);

  /**
   * Valores financeiros (M7/§3.12-a) — os 3 são controles STANDALONE, FORA do `form` group, pela
   * mesma razão do `contraparteId`: preservam o `form.setValue` de 3 chaves e o `toEqual` estrito do
   * corpo nos specs herdados do M2/M4/M5 (anti-burla). Vazios ⇒ nenhuma chave nova no payload.
   */
  protected readonly valorUnitario = this.fb.control<number | null>(null);
  protected readonly descontoTipo = this.fb.control<DescontoTipo | null>(null);
  protected readonly descontoValor = this.fb.control<number | null>(null);

  /** Opções carregadas sob demanda ao abrir o select (`?tamanho=100`, teto MVP). */
  protected readonly fornecedores = signal<Fornecedor[]>([]);
  protected readonly clientes = signal<Cliente[]>([]);
  private fornecedoresCarregados = false;
  private clientesCarregados = false;

  /** Dica contextual do tipo escolhido (semântica AD-SQ-30). */
  protected readonly dicaTipo = computed(() => {
    const t = this.tipoSelecionado();
    return this.opcoesTipo.find((o) => o.valor === t)?.dica ?? null;
  });

  /** Contraparte admitida pelo tipo vigente (RF-2): ENTRADA→fornecedor, SAÍDA→cliente, resto nenhuma. */
  protected readonly tipoContraparte = computed<TipoContraparte>(() => {
    const t = this.tipoSelecionado();
    if (t === 'ENTRADA') return 'FORNECEDOR';
    if (t === 'SAIDA') return 'CLIENTE';
    return null;
  });

  /** Espelha o valor do select num signal (para o `computed` da dica reagir). */
  private readonly tipoSelecionado = signal<TipoMovimentacao | ''>('');

  /** Espelhos em signal dos 4 valores que alimentam os totais ao vivo (§3.12-c). */
  private readonly quantidadeAtual = signal<number | null>(null);
  private readonly valorUnitarioAtual = signal<number | null>(null);
  protected readonly descontoTipoAtual = signal<DescontoTipo | null>(null);
  private readonly descontoValorAtual = signal<number | null>(null);

  /** O bloco financeiro existe em ENTRADA/SAÍDA; em AJUSTE ele SOME (PA#1/§3.12-e). */
  protected readonly mostrarFinanceiro = computed(() => {
    const t = this.tipoSelecionado();
    return t === 'ENTRADA' || t === 'SAIDA';
  });

  /**
   * Total bruto ao vivo = `quantidade × valorUnitario`, **com o unitário já normalizado** (§3.2-b1).
   * `null` (a tela mostra "—") enquanto não há unitário/quantidade — nunca um `R$ 0,00` fake.
   */
  protected readonly totalBruto = computed<number | null>(() => {
    const vu = this.valorUnitarioAtual();
    const qtd = this.quantidadeAtual();
    if (vu == null || !Number.isFinite(vu) || vu < 0) return null;
    if (qtd == null || !Number.isFinite(qtd) || qtd < 0) return null;
    // A conta acontece na representação DECIMAL (BUG-002): `normalizar2(qtd * vu)` normalizaria um
    // produto que já perdeu o empate no binário — e o centavo perdido fica numa linha imutável.
    return multiplicar2(qtd, normalizar2(vu));
  });

  /** Desconto efetivo em R$ (§3.2-b): PERCENTUAL → `bruto × d ÷ 100` arredondado; VALOR → `d`. */
  protected readonly descontoEfetivo = computed<number | null>(() => {
    const bruto = this.totalBruto();
    const tipo = this.descontoTipoAtual();
    const dv = this.descontoValorAtual();
    if (bruto == null || tipo == null || dv == null || !Number.isFinite(dv) || dv < 0) return null;
    const d = normalizar2(dv);
    return tipo === 'PERCENTUAL' ? percentual2(bruto, d) : d;
  });

  /**
   * Feedback de UX das validações V6/V7/V8 (§3.2-c), com a MESMA frase que o back devolveria — e
   * sobre o valor JÁ NORMALIZADO, como manda o §3.2-b1. Não substitui o back (§3.2-d): só evita o
   * round-trip no celular. Enquanto houver aviso, o total final não é exibido (não há total honesto).
   */
  protected readonly avisoDesconto = computed<string | null>(() => {
    const tipo = this.descontoTipoAtual();
    const dv = this.descontoValorAtual();
    if (tipo == null || dv == null || !Number.isFinite(dv)) return null;
    const d = normalizar2(dv);
    if (d < 0) return 'Desconto deve ser maior ou igual a zero.';
    if (tipo === 'PERCENTUAL' && d > 100) return 'Desconto percentual deve estar entre 0 e 100.';
    const bruto = this.totalBruto();
    if (tipo === 'VALOR' && bruto != null && d > bruto) {
      return 'Desconto não pode exceder o total bruto.';
    }
    return null;
  });

  /** Total final ao vivo = `bruto − desconto efetivo` (§3.2-b). Espelho de UX; o back é a autoridade. */
  protected readonly totalFinal = computed<number | null>(() => {
    const bruto = this.totalBruto();
    if (bruto == null || this.avisoDesconto() != null) return null;
    return normalizar2(bruto - (this.descontoEfetivo() ?? 0));
  });

  ngOnInit(): void {
    this.form.controls.tipo.valueChanges.subscribe((t) => {
      this.tipoSelecionado.set(t);
      // Troca de tipo limpa a contraparte do outro tipo (RF-2 — mutuamente exclusivos por tipo).
      this.contraparteId.setValue(null);
      this.aplicarTipoNoFinanceiro(t);
    });
    this.form.controls.quantidade.valueChanges.subscribe((q) => this.quantidadeAtual.set(q));
    this.valorUnitario.valueChanges.subscribe((v) => this.valorUnitarioAtual.set(v));
    this.descontoTipo.valueChanges.subscribe((t) => this.descontoTipoAtual.set(t));
    this.descontoValor.valueChanges.subscribe((v) => this.descontoValorAtual.set(v));
    this.carregarHistorico();
  }

  /**
   * AJUSTE **limpa e esconde** o bloco financeiro (PA#1/§3.12-e). A SAÍDA pré-preenche o unitário
   * com o preço de catálogo quando o campo está **intocado** (§3.12-d) — editável, e o `reset` do
   * AJUSTE devolve o `pristine`, de modo que voltar para SAÍDA pré-preenche de novo.
   *
   * **AD-SQ-166 — o prefill é preso à SAÍDA.** Sair da SAÍDA **limpa** o unitário quando ele ainda
   * está `pristine` (foi a tela que preencheu, ninguém digitou): o preço de VENDA não pode virar
   * custo de COMPRA numa ENTRADA, que é linha imutável e só se corrige com estorno. O que o
   * operador **digitou** (`dirty`) é preservado — mesma razão pela qual a contraparte já é limpa a
   * cada troca de tipo: o campo muda de significado junto com o tipo.
   */
  private aplicarTipoNoFinanceiro(t: TipoMovimentacao | ''): void {
    if (t === 'AJUSTE') {
      this.valorUnitario.reset(null);
      this.descontoTipo.setValue(null);
      this.descontoValor.setValue(null);
      return;
    }
    if (t !== 'SAIDA' && this.valorUnitario.pristine) {
      this.valorUnitario.setValue(null); // AD-SQ-166: descarta o prefill que ninguém digitou.
    }
    if (t === 'SAIDA' && this.produto.preco != null && this.valorUnitario.pristine) {
      this.valorUnitario.setValue(this.produto.preco);
    }
  }

  /**
   * Alternador % / R$ (D2/§3.12-b): define o `descontoTipo` e **sempre limpa** o `descontoValor` —
   * senão um "10 %" viraria "R$ 10" por acidente. Clicar no botão já ativo desliga o desconto.
   */
  protected escolherDesconto(tipo: DescontoTipo): void {
    this.descontoTipo.setValue(this.descontoTipo.value === tipo ? null : tipo);
    this.descontoValor.setValue(null);
  }

  /** Formata em pt-BR; `null` vira "—" (empty-state honesto: sem valor informado ≠ R$ 0,00). */
  protected moeda(valor: number | null): string {
    return valor == null ? '—' : valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /** Carrega os fornecedores (ENTRADA) ao abrir o select — 1ª página, teto 100. Só na abertura. */
  protected aoAbrirFornecedores(aberto: boolean): void {
    if (!aberto || this.fornecedoresCarregados) return;
    this.fornecedoresCarregados = true;
    this.fornecedoresService.listar(0, 100).subscribe({
      next: (pagina) => this.fornecedores.set(pagina.conteudo),
      error: () => {
        this.fornecedores.set([]);
        this.fornecedoresCarregados = false; // permite nova tentativa numa reabertura
      },
    });
  }

  /** Carrega os clientes (SAÍDA) ao abrir o select — 1ª página, teto 100. Só na abertura. */
  protected aoAbrirClientes(aberto: boolean): void {
    if (!aberto || this.clientesCarregados) return;
    this.clientesCarregados = true;
    this.clientesService.listar(0, 100).subscribe({
      next: (pagina) => this.clientes.set(pagina.conteudo),
      error: () => {
        this.clientes.set([]);
        this.clientesCarregados = false;
      },
    });
  }

  protected carregarHistorico(): void {
    this.carregandoHistorico.set(true);
    this.erroHistorico.set(false);
    this.service.movimentacoes(this.produto.id, 0, 5).subscribe({
      next: (pagina) => {
        this.historico.set(pagina.conteudo);
        this.carregandoHistorico.set(false);
      },
      error: () => {
        this.erroHistorico.set(true);
        this.carregandoHistorico.set(false);
      },
    });
  }

  protected registrar(): void {
    if (this.enviando()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // Desconto fora de faixa (V7/V8): o aviso já está na tela; não gastamos um round-trip no celular.
    if (this.avisoDesconto() != null) {
      return;
    }

    this.enviando.set(true);
    this.erroGeral.set(null);
    const v = this.form.getRawValue();
    const tipo = v.tipo as TipoMovimentacao;
    const req: MovimentacaoRequest = {
      tipo,
      quantidade: v.quantidade!,
      motivo: v.motivo.trim() || null,
    };

    // Contraparte (RF-2): só o campo do tipo vigente, e só quando há seleção (opcional, exclusivo).
    const cp = this.contraparteId.value;
    if (cp != null) {
      if (tipo === 'ENTRADA') req.fornecedorId = cp;
      else if (tipo === 'SAIDA') req.clienteId = cp;
    }

    // Valores (M7/§3.12-a): só entram quando preenchidos — e NORMALIZADOS a 2 casas (§3.2-b1), para
    // o que o operador viu na tela ser exatamente o que o servidor vai congelar. AJUSTE nunca leva
    // dinheiro (PA#1). Desconto viaja em par (tipo + valor) ou não viaja.
    const vu = this.valorUnitario.value;
    if (tipo !== 'AJUSTE' && vu != null && Number.isFinite(vu)) {
      req.valorUnitario = normalizar2(vu);
      const dt = this.descontoTipo.value;
      const dv = this.descontoValor.value;
      if (dt != null && dv != null && Number.isFinite(dv)) {
        req.descontoTipo = dt;
        req.descontoValor = normalizar2(dv);
      }
    }

    this.service.movimentar(this.produto.id, req).subscribe({
      next: (mov) => {
        this.enviando.set(false);
        this.ref.close(mov);
      },
      error: (erro: HttpErrorResponse) => {
        this.enviando.set(false);
        this.tratarErro(erro);
      },
    });
  }

  protected cancelar(): void {
    this.ref.close();
  }

  protected rotuloUnidade(): string {
    return ROTULOS_UNIDADE[this.produto.unidadeMedida] ?? this.produto.unidadeMedida;
  }

  protected rotuloTipo(t: TipoMovimentacao): string {
    return this.opcoesTipo.find((o) => o.valor === t)?.rotulo ?? t;
  }

  /**
   * `400` (estoque insuficiente/validação) → exibe a mensagem do envelope sem fechar (CA-11) e
   * aplica `details` por campo quando houver. `403` → mensagem de permissão. Demais → banner genérico.
   */
  private tratarErro(erro: HttpErrorResponse): void {
    if (erro.status === 400) {
      const corpo = erro.error as ApiResponse<unknown> | null;
      const detalhes = corpo?.error?.details ?? [];
      for (const item of detalhes) {
        this.form.get(item.field)?.setErrors({ servidor: item.message });
      }
      // A mensagem principal (ex.: "Estoque insuficiente (20 em estoque).") vai no banner do diálogo.
      this.erroGeral.set(corpo?.error?.message ?? 'Confira os dados informados.');
      return;
    }
    if (erro.status === 403) {
      this.erroGeral.set('Você não tem permissão para movimentar o estoque.');
      return;
    }
    if (erro.status === 404) {
      this.erroGeral.set('Produto não encontrado. Ele pode ter sido excluído.');
      return;
    }
    this.erroGeral.set('Não foi possível registrar agora. Tente novamente.');
  }
}
