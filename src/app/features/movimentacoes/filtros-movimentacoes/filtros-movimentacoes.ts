import { Component, inject, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';

import { FiltroMovimentacoes } from '../movimentacoes.service';
import { TipoMovimentacao } from '../../../core/models/produto.model';

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
  });

  /** `de > ate` é 400 no back (§3.5). A tela avisa antes de gastar a viagem — o back segue mandando. */
  protected readonly periodoInvertido = signal(false);

  constructor() {
    const atual = this.valor();
    this.form.setValue({
      de: deDataIso(atual.de),
      ate: deDataIso(atual.ate),
      tipo: atual.tipo ?? null,
    });
  }

  protected aplicar(): void {
    const { de, ate, tipo } = this.form.getRawValue();
    if (de && ate && de > ate) {
      this.periodoInvertido.set(true);
      return;
    }
    this.periodoInvertido.set(false);
    this.mudou.emit({
      ...this.valor(),
      de: paraDataIso(de),
      ate: paraDataIso(ate),
      tipo: tipo ?? null,
    });
  }

  protected limpar(): void {
    this.periodoInvertido.set(false);
    this.form.setValue({ de: null, ate: null, tipo: null });
    this.mudou.emit({});
  }

  protected fechar(): void {
    this.fechou.emit();
  }
}
