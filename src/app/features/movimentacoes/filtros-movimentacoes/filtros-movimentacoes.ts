import { Component, effect, inject, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';

import { FiltroMovimentacoes } from '../movimentacoes.service';
import { ProdutosService } from '../../produtos/produtos.service';
import { ClientesService } from '../../clientes/clientes.service';
import { FornecedoresService } from '../../fornecedores/fornecedores.service';
import { TipoMovimentacao } from '../../../core/models/produto.model';

/** Opção de um select de recorte: só o que a tela precisa (id + nome), nunca a entidade inteira. */
interface OpcaoRecorte {
  id: number;
  nome: string;
}

/**
 * `Date` do datepicker → `yyyy-MM-dd` do contrato (§3.5), pelos componentes **locais**.
 *
 * ⚠️ `toISOString()` **não serve**: ele converte para UTC e, em `America/Sao_Paulo` (UTC−3), a
 * meia-noite local de 03/09 vira `2026-09-03T03:00Z` — mas a meia-noite de um dia em horário de
 * verão, ou qualquer data com o fuso a oeste, cai no **dia anterior**. O filtro erraria a borda
 * exatamente no caso que o CA-17 cobre (o lançamento das 23:30 do dia final). Ler `getFullYear`/
 * `getMonth`/`getDate` devolve o dia que a pessoa clicou, que é o que o back espera.
 */
export function paraDataIso(data: Date | null | undefined): string | null {
  if (!data) return null;
  const mes = `${data.getMonth() + 1}`.padStart(2, '0');
  const dia = `${data.getDate()}`.padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** `yyyy-MM-dd` → `Date` local (para reidratar o painel ao reabrir, sem passar por UTC). */
function deDataIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

/**
 * Barra de filtros da tela de Movimentações (SPEC-M7 §3.5/§3.11-f).
 *
 * **Painel recolhido por padrão, nos dois breakpoints** — e isto é decisão de contrato, não estética
 * (aval do orquestrador, G2 do plano). O `filtros-produtos/` do M6 mantém o painel SEMPRE no DOM e
 * alterna por CSS, porque a armadilha §12 #24(b) do M6 proíbe `@if` **por largura de viewport**. Aqui
 * o `@if` do pai é por **estado do usuário**, que é outra coisa — e é o que mantém o `MatDatepicker`
 * fora da árvore enquanto ninguém abre os filtros. Sem isso, os 3 specs herdados de Movimentações
 * (que não provêem `DateAdapter`, verificado) quebrariam com `NullInjectorError`, e consertá-los
 * exigiria a 4ª liberação de teste do marco — a troca errada (§12 #0).
 *
 * O ESTADO mora no pai (`valor` in / `mudou` out), então fechar o painel não perde recorte: mesma
 * API do `filtros-produtos`. Nada é carregado no `ngOnInit` (CA-41).
 *
 * ⚠️ **Quem cumpre essa promessa é o `effect()` de reidratação abaixo, não o construtor.** Na 1ª
 * entrega esta doc prometia preservar o recorte e o código lia `this.valor()` no construtor — onde o
 * signal de `input()` ainda vale o default. Resultado: o painel reabria em branco e o "Aplicar"
 * seguinte apagava o recorte **em silêncio** (P1-1 da review). Doc que promete o que o código não faz
 * é pior que doc nenhuma: ela desliga a desconfiança de quem lê.
 */
@Component({
  selector: 'app-filtros-movimentacoes',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
  ],
  templateUrl: './filtros-movimentacoes.html',
  styleUrl: './filtros-movimentacoes.scss',
})
export class FiltrosMovimentacoes {
  private readonly fb = inject(FormBuilder);

  /** Recorte vigente, vindo do pai — reidrata o painel a cada abertura. */
  readonly valor = input<FiltroMovimentacoes>({});

  /** Emite o recorte novo; o pai é quem recarrega a lista (e volta para a 1ª página). */
  readonly mudou = output<FiltroMovimentacoes>();
  readonly fechou = output<void>();

  protected readonly tipos: { valor: TipoMovimentacao; rotulo: string }[] = [
    { valor: 'ENTRADA', rotulo: 'Entrada' },
    { valor: 'SAIDA', rotulo: 'Saída' },
    { valor: 'AJUSTE', rotulo: 'Ajuste' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    de: [null as Date | null],
    ate: [null as Date | null],
    tipo: [null as TipoMovimentacao | null],
    produtoId: [null as number | null],
    clienteId: [null as number | null],
    fornecedorId: [null as number | null],
  });

  private readonly produtosService = inject(ProdutosService);
  private readonly clientesService = inject(ClientesService);
  private readonly fornecedoresService = inject(FornecedoresService);

  protected readonly produtos = signal<OpcaoRecorte[]>([]);
  protected readonly clientes = signal<OpcaoRecorte[]>([]);
  protected readonly fornecedores = signal<OpcaoRecorte[]>([]);
  private carregados = { produtos: false, clientes: false, fornecedores: false };

  /** `de > ate` é 400 no back (§3.5). A tela avisa antes de gastar a viagem — o back segue mandando. */
  protected readonly periodoInvertido = signal(false);

  /**
   * Reidrata o form a partir do recorte vigente — em `effect()`, **nunca no construtor**.
   *
   * ⚠️ Signal de `input()` só é preenchido **depois** da instanciação: ler `this.valor()` no
   * construtor devolve o default (`{}`), sempre. E como o pai monta este painel por `@if`, nasce
   * instância nova a cada abertura — ou seja, este é o **único** caminho de reidratação, e no
   * construtor ele nunca funcionaria. O sintoma era mudo e caro: reabrir mostrava o form em branco e
   * o "Aplicar" seguinte **apagava o recorte em silêncio**, numa tela de auditoria (P1-1 da review).
   *
   * O guard de comparação **evita um `setValue` redundante** quando o recorte que volta do pai já é
   * o que o form tem (o caso do `limpar()`, que emite `{}` e recebe `{}` de volta). Ele **não**
   * "impede um laço" — e dizer que impedia era a frase errada desta doc (P3-A, corrigida na T-M7-08).
   * **Medido:** removê-lo deixa os testes das três telas que montam este painel em **88 SUCCESS**,
   * porque não há laço possível: `montar()` lê o `FormGroup`, que **não é signal** e portanto não
   * entra nas dependências do efeito, e o pai fecha o painel na linha seguinte ao `set`. O desenho
   * ecoa o `filtros-produtos.ts:213` (§3.11-f); o que muda aqui é só a promessa que a doc faz.
   * **Nenhum caso cobre a remoção do guard** — quem mexer nele não será avisado por teste nenhum.
   */
  private readonly reidratacao = effect(() => {
    const externo = this.valor();
    if (JSON.stringify(externo) === JSON.stringify(this.montar())) return;
    this.form.setValue(
      {
        de: deDataIso(externo.de),
        ate: deDataIso(externo.ate),
        tipo: externo.tipo ?? null,
        produtoId: externo.produtoId ?? null,
        clienteId: externo.clienteId ?? null,
        fornecedorId: externo.fornecedorId ?? null,
      },
      { emitEvent: false },
    );
  });

  /** Estado atual do form no formato do contrato (§3.5) — base do guard acima e do `aplicar()`. */
  private montar(): FiltroMovimentacoes {
    const { de, ate, tipo, produtoId, clienteId, fornecedorId } = this.form.getRawValue();
    return {
      de: paraDataIso(de),
      ate: paraDataIso(ate),
      tipo: tipo ?? null,
      produtoId: produtoId ?? null,
      clienteId: clienteId ?? null,
      fornecedorId: fornecedorId ?? null,
    };
  }

  /**
   * Carga SOB DEMANDA dos selects de recorte (CA-41): nada sai no `ngOnInit` — nem do painel, nem da
   * tela. O `focus` do `<select>` nativo é o gatilho, e a flag impede repetir a chamada a cada foco.
   * Em falha a flag volta a `false`, para que reabrir tente de novo em vez de ficar mudo para sempre.
   *
   * 1ª página com teto de 100, mesmo padrão já usado pelo modal Movimentar (RF-2): é recorte de
   * conveniência, não um catálogo — quem tem mais de 100 produtos usa a busca por texto.
   */
  protected carregarProdutos(): void {
    if (this.carregados.produtos) return;
    this.carregados.produtos = true;
    this.produtosService.listar(0, 100).subscribe({
      next: (p) => this.produtos.set(p.conteudo.map((x) => ({ id: x.id, nome: x.nome }))),
      error: () => {
        this.produtos.set([]);
        this.carregados.produtos = false;
      },
    });
  }

  protected carregarClientes(): void {
    if (this.carregados.clientes) return;
    this.carregados.clientes = true;
    this.clientesService.listar(0, 100).subscribe({
      next: (p) => this.clientes.set(p.conteudo.map((x) => ({ id: x.id, nome: x.nome }))),
      error: () => {
        this.clientes.set([]);
        this.carregados.clientes = false;
      },
    });
  }

  protected carregarFornecedores(): void {
    if (this.carregados.fornecedores) return;
    this.carregados.fornecedores = true;
    this.fornecedoresService.listar(0, 100).subscribe({
      next: (p) => this.fornecedores.set(p.conteudo.map((x) => ({ id: x.id, nome: x.nome }))),
      error: () => {
        this.fornecedores.set([]);
        this.carregados.fornecedores = false;
      },
    });
  }

  protected aplicar(): void {
    const { de, ate } = this.form.getRawValue();
    if (de && ate && de > ate) {
      this.periodoInvertido.set(true);
      return;
    }
    this.periodoInvertido.set(false);
    this.mudou.emit(this.montar());
  }

  protected limpar(): void {
    this.periodoInvertido.set(false);
    this.form.setValue({
      de: null,
      ate: null,
      tipo: null,
      produtoId: null,
      clienteId: null,
      fornecedorId: null,
    });
    this.mudou.emit({});
  }

  protected fechar(): void {
    this.fechou.emit();
  }
}
