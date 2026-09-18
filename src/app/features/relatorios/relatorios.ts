import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { FiltroRelatorio, RelatoriosService } from './relatorios.service';
import { FiltrosMovimentacoes } from '../movimentacoes/filtros-movimentacoes/filtros-movimentacoes';
import { FiltroMovimentacoes } from '../movimentacoes/movimentacoes.service';
import { ApiResponse } from '../../core/models/api-response.model';
import {
  FormatoExport,
  Granularidade,
  PeriodoRelatorio,
  Relatorio,
} from '../../core/models/relatorio.model';

/**
 * Mensagem do envelope §3.1 num erro de request **binário**.
 *
 * ⚠️ Com `responseType: 'blob'`, o corpo de ERRO também chega como `Blob` — `erro.error.error.message`
 * não existe, e ler o envelope exige **descompactar o texto** (assíncrono). O §3.13 é silente sobre
 * isto, e sem tratar o caso a tela teria de adivinhar a razão do 400, que pode ser "formato
 * inválido", "período ausente" ou "passou de 5.000 lançamentos" (§3.8) — três coisas diferentes. O
 * genérico só cobre corpo ilegível (rede/proxy), onde não há nada de verdadeiro a dizer.
 */
async function mensagemDoEnvelope(erro: HttpErrorResponse): Promise<string> {
  const corpo: unknown = erro.error;
  const texto = corpo instanceof Blob ? await corpo.text().catch(() => '') : '';
  const envelope = lerEnvelope(texto);
  if (envelope?.error?.message) return envelope.error.message;
  if (erro.status === 403) return 'Você não tem permissão para baixar este relatório.';
  return 'Não foi possível gerar o arquivo agora. Tente novamente.';
}

/** Corpo que não é JSON (binário truncado, HTML de proxy) vira `null` — e cai no genérico. */
function lerEnvelope(texto: string): ApiResponse<unknown> | null {
  try {
    return texto ? (JSON.parse(texto) as ApiResponse<unknown>) : null;
  } catch (naoEhJson) {
    return null;
  }
}

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
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, FiltrosMovimentacoes],
  templateUrl: './relatorios.html',
  styleUrl: './relatorios.scss',
})
export class Relatorios implements OnInit {
  private readonly service = inject(RelatoriosService);

  protected readonly relatorio = signal<Relatorio | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);

  /**
   * Recorte vigente (§3.7). `de`/`ate` nascem do atalho "Este mês" (CA-46).
   *
   * É um `FiltroMovimentacoes` — **sem** a granularidade —, porque é este objeto que vai e volta do
   * painel de filtros reusado. A granularidade entra só na hora do pedido (`carregar`).
   */
  protected readonly filtros = signal<FiltroMovimentacoes>({});
  protected readonly filtrosAbertos = signal(false);
  protected readonly atalho = signal<Atalho>('MES');
  protected readonly granularidade = signal<Granularidade>('MES');

  /** Quantos recortes além do período estão ativos — alimenta o rótulo "Filtros (n)". */
  protected readonly filtrosAtivos = computed(() => {
    const { tipo, produtoId, clienteId, fornecedorId } = this.filtros();
    return [tipo, produtoId, clienteId, fornecedorId].filter((v) => v !== null && v !== undefined)
      .length;
  });

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
    // "Intervalo" não calcula período nenhum: ele abre o painel, que é onde moram os dois
    // datepickers pt-BR (§3.13). O painel é o MESMO da tela de Movimentações — consumido, não
    // duplicado (aval do orquestrador; mesma postura do §3.7-a1 no back).
    if (atalho === 'INTERVALO') {
      this.filtrosAbertos.set(true);
      return;
    }

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

  /**
   * Recorte novo vindo do painel (§3.5): o período passa a ser o que o operador escolheu, então o
   * atalho vigente vira "Intervalo" — deixar "Este mês" aceso com outro período na mão seria a tela
   * afirmando algo que não é verdade.
   */
  protected aplicarFiltros(novo: FiltroMovimentacoes): void {
    this.filtros.set(novo);
    this.filtrosAbertos.set(false);
    this.atalho.set('INTERVALO');
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

  /**
   * Rótulo do balde: `dd/MM` → `dd/MM` a partir do `yyyy-MM-dd` que o servidor manda (§3.7-c), sem
   * passar por `Date`.
   *
   * Recortar a string é **mais honesto** que formatar: `new Date('2026-09-01')` é interpretado como
   * UTC e, em `America/Sao_Paulo`, voltaria 31/08 — o erro de fronteira que o §12 #12 descreve. De
   * quebra, esta tela não usa `| date` e por isso **não** depende do `registerLocaleData` que o
   * §12 #30 exige: `toLocaleString` de número é `Intl`, não pipe do Angular.
   */
  protected intervalo(p: PeriodoRelatorio): string {
    const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    return p.inicio === p.fim ? dia(p.inicio) : `${dia(p.inicio)} a ${dia(p.fim)}`;
  }

  /** Formato em geração (desabilita os dois botões) e o erro do download, em banner próprio. */
  protected readonly baixando = signal<FormatoExport | null>(null);
  protected readonly erroDownload = signal<string | null>(null);

  /**
   * Baixa o relatório como arquivo (§3.8/CA-47, CA-48).
   *
   * O nome é montado **aqui**, com a mesma regra do §3.8, e não lido do `Content-Disposition`: o
   * `CorsConfig` do back não declara `exposedHeaders`, então **o navegador não enxerga aquele
   * header** entre origens (conferido no código da API, não suposto). Duplicar a regra do nome é o
   * preço de não depender de um header inalcançável — e um teste que só conferisse "o header existe"
   * ficaria verde sem a exposição, porque ele sempre existiu na resposta.
   */
  protected baixar(formato: FormatoExport): void {
    if (this.semPeriodo() || this.baixando()) return;
    this.baixando.set(formato);
    this.erroDownload.set(null);
    this.service.exportar(this.filtros(), formato).subscribe({
      next: (blob) => {
        this.salvar(blob, formato);
        this.baixando.set(null);
      },
      error: (falha: HttpErrorResponse) => {
        void mensagemDoEnvelope(falha).then((mensagem) => {
          this.erroDownload.set(mensagem);
          this.baixando.set(null); // o botão VOLTA a ficar habilitado (CA-48)
        });
      },
    });
  }

  /** Object URL + `<a download>` clicado por código, e **revogado em seguida** (CA-47). */
  private salvar(blob: Blob, formato: FormatoExport): void {
    const { de, ate } = this.filtros();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `movimentacoes-${de}_a_${ate}.${formato.toLowerCase()}`;
    // O `<a>` entra no DOM antes do clique e sai depois (P2-2 da review da T-M7-09): Chrome, Edge e
    // Firefox disparam o download de um link desanexado, mas o **Safari não** — e `download` sobre
    // `blob:` é o caso mais frágil dele. Como ~90 % do uso é celular, essa é a plataforma onde a
    // falha apareceria; e ela apareceria **sem erro e sem banner**, que é o pior modo de falhar.
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url); // sem isto o blob fica retido na aba até recarregar
  }
}
