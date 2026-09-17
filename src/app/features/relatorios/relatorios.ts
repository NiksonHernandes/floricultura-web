import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { FiltroRelatorio, RelatoriosService } from './relatorios.service';
import { Granularidade, Relatorio } from '../../core/models/relatorio.model';

/** Fuso de TODA fronteira de data do projeto (§4.8, AD-SQ-47). */
const ZONA = 'America/Sao_Paulo';

/**
 * Hoje **em São Paulo**, ancorado em UTC.
 *
 * O `Intl` com `timeZone` devolve a data de CALENDÁRIO daquele fuso (`en-CA` ⇒ `yyyy-MM-dd`), que é
 * o que o operador chama de "hoje" — e não a do relógio da máquina, que num CI pode estar em
 * qualquer lugar. Depois disso a conta é aritmética de calendário: o `Date` é construído em UTC e
 * só lido por getters UTC, então `toISOString()` **não** pode deslocar o dia (é a armadilha que o
 * `paraDataIso` do painel de filtros documenta ao contrário — lá o `Date` é local).
 */
function hojeEmSaoPaulo(): Date {
  const [ano, mes, dia] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA })
    .format(new Date())
    .split('-')
    .map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** `Date` ancorado em UTC → `yyyy-MM-dd` do contrato (§3.7). */
function iso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function somarDias(data: Date, dias: number): Date {
  return new Date(data.getTime() + dias * 86_400_000);
}

/** Atalhos de período (§3.13). `INTERVALO` não calcula nada — quem escolhe é o operador. */
export type Atalho = 'SEMANA' | 'MES' | 'INTERVALO';

/**
 * Relatórios — o fechamento do livro-caixa (SPEC-M7 §3.13, T-M7-09; CA-45..CA-49).
 *
 * **Só ADMIN**: a rota tem `adminGuard` e o item de menu é `@if (ehAdmin())`, mas quem barra de
 * verdade é o back (`/api/v1/relatorios/**` com `hasRole('ADMIN')`, §3.9) — o front é UX (FC-07).
 *
 * ⚠️ **Esta tela não calcula nada.** `resumo`, `resultadoValor` e cada balde vêm prontos do
 * servidor (§3.7); o navegador só formata. É o §4.7 valendo: nenhum total é somado aqui — inclusive
 * porque o par estornado sai da conta no `WHERE` do back (§3.7-d), e uma soma local reintroduziria
 * exatamente o dinheiro que o dono mandou excluir.
 */
@Component({
  selector: 'app-relatorios',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './relatorios.html',
  styleUrl: './relatorios.scss',
})
export class Relatorios implements OnInit {
  private readonly service = inject(RelatoriosService);

  protected readonly relatorio = signal<Relatorio | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);

  /** Recorte vigente (§3.7). `de`/`ate` nascem do atalho "Este mês" (CA-46). */
  protected readonly filtros = signal<FiltroRelatorio>({});
  protected readonly atalho = signal<Atalho>('MES');
  protected readonly granularidade = signal<Granularidade>('MES');

  /** Sem período não há o que pedir — o back responderia 400 `field=de` (§3.7-a0). */
  protected readonly semPeriodo = computed(() => !this.filtros().de || !this.filtros().ate);

  /**
   * O recorte não achou lançamento nenhum. Vem do CONTADOR do servidor, não de `periodos.length`:
   * a série é contínua e nunca vem vazia (CA-21), então medir o tamanho do array diria "tem dado"
   * num relatório de zeros.
   */
  protected readonly semLancamentos = computed(() => {
    const r = this.relatorio();
    if (!r) return false;
    const { entradas, saidas, ajustes } = r.resumo;
    return entradas.lancamentos + saidas.lancamentos + ajustes.lancamentos === 0;
  });

  ngOnInit(): void {
    this.escolherAtalho('MES');
  }

  /**
   * Atalhos do §3.13, em `America/Sao_Paulo`:
   * - **Esta semana**: segunda→domingo (ISO, o mesmo corte dos baldes do §3.7-c);
   * - **Este mês**: 1º → último dia do mês corrente (CA-46);
   * - **Intervalo**: mantém o que estiver escolhido e deixa o operador definir no painel.
   *
   * A granularidade acompanha o atalho porque "esta semana em baldes de mês" seria **um** balde
   * parcial — o recorte e o corte da série falariam de coisas diferentes. Trocar a granularidade
   * depois continua sendo do operador.
   */
  protected escolherAtalho(atalho: Atalho): void {
    this.atalho.set(atalho);
    if (atalho === 'INTERVALO') return;

    const hoje = hojeEmSaoPaulo();
    let de: Date;
    let ate: Date;
    if (atalho === 'SEMANA') {
      de = somarDias(hoje, -((hoje.getUTCDay() + 6) % 7)); // 0=domingo ⇒ segunda é a âncora
      ate = somarDias(de, 6);
    } else {
      de = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
      ate = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0));
    }
    this.granularidade.set(atalho);
    this.filtros.update((f) => ({ ...f, de: iso(de), ate: iso(ate) }));
    this.carregar();
  }

  protected trocarGranularidade(valor: Granularidade): void {
    if (this.granularidade() === valor) return;
    this.granularidade.set(valor);
    this.carregar();
  }

  protected carregar(): void {
    if (this.semPeriodo()) {
      this.relatorio.set(null);
      return;
    }
    this.carregando.set(true);
    this.erro.set(null);
    this.service.gerar({ ...this.filtros(), granularidade: this.granularidade() }).subscribe({
      next: (r) => {
        this.relatorio.set(r);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível gerar o relatório. Tente novamente.');
        this.carregando.set(false);
      },
    });
  }

  /**
   * Dinheiro em pt-BR — cópia local, como a de `movimentacoes.ts` (§3.11-b).
   *
   * **Não há arredondamento aqui**, e isso é contrato: o valor chega `NUMERIC(14,2)` do servidor e
   * esta função só formata. Por isso ela **não** consome a `normalizar2` da AD-SQ-165 — normalizar
   * de novo o que já veio normalizado seria reimplementar a aritmética do back no navegador.
   * `== null` (nunca `!valor`): `R$ 0,00` é um valor REAL, `—` é "não se aplica" (§4.4).
   */
  protected moeda(valor: number | null | undefined): string {
    return valor == null
      ? '—'
      : valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Quantidade em pt-BR. O back manda **3 casas** (`NUMERIC(14,3)`) e a tela mostra as 3 —
   * `toLocaleString` sem opção já usa `maximumFractionDigits: 3`. Formatar como moeda (2 casas)
   * arredondaria `140,125` para `140,13`: número que ninguém digitou, numa tela de conferência.
   */
  protected quantidade(valor: number): string {
    return valor.toLocaleString('pt-BR');
  }
}
