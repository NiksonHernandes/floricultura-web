import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { MatDialog } from '@angular/material/dialog';

import { MovimentacoesService, FiltroMovimentacoes } from './movimentacoes.service';
import { ProdutosService } from '../produtos/produtos.service';
import { FiltrosMovimentacoes } from './filtros-movimentacoes/filtros-movimentacoes';
import { ExtratoProduto, ProdutoDoExtrato } from './extrato-produto/extrato-produto';
import {
  VisualizarLancamento,
  VisualizarLancamentoDados,
} from './visualizar-lancamento/visualizar-lancamento';
import {
  ConfirmarEstorno,
  ConfirmarEstornoDados,
} from './confirmar-estorno/confirmar-estorno';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { Movimentacao, TipoMovimentacao } from '../../core/models/produto.model';

/** MatPaginator em pt-BR — ecoa `produtos.ts`, rótulo do domínio (o ledger é o "livro-caixa"). */
function paginatorPtBr(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Lançamentos por página';
  intl.nextPageLabel = 'Próxima página';
  intl.previousPageLabel = 'Página anterior';
  intl.firstPageLabel = 'Primeira página';
  intl.lastPageLabel = 'Última página';
  intl.getRangeLabel = (page, size, length) => {
    if (length === 0) return '0 de 0';
    const inicio = page * size + 1;
    const fim = Math.min((page + 1) * size, length);
    return `${inicio}–${fim} de ${length}`;
  };
  return intl;
}

/**
 * Mensagem do ENVELOPE §3.1 (`{ error: { message } }`), com fallback honesto por status.
 *
 * O estorno recusa por motivos que só o servidor conhece — "já foi estornado", "AJUSTE não é
 * estornável", "estoque insuficiente" (§3.4-d). Inventar um texto local aqui trocaria a razão real
 * por um palpite; por isso a mensagem do back vem primeiro, e o genérico só cobre falha sem corpo
 * (rede/502), onde não há nada de verdadeiro a dizer sobre o lançamento.
 */
function mensagemDoEnvelope(erro: HttpErrorResponse): string {
  const envelope = (erro.error as ApiResponse<unknown> | null)?.error ?? null;
  if (envelope?.message) return envelope.message;
  if (erro.status === 403) return 'Você não tem permissão para estornar lançamentos.';
  return 'Não foi possível estornar agora. Tente novamente.';
}

/** As duas visões da tela (SPEC-M7 §3.11-a): a lista global ou o extrato de UM produto. */
export type VisaoMovimentacoes = 'TODAS' | 'PRODUTO';

/** Rótulos pt-BR dos tipos do ledger (AD-SQ-30). */
export const ROTULOS_TIPO_MOV: Record<TipoMovimentacao, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
};

/**
 * Movimentações — "o livro-caixa do estoque" (SPEC-M4 §7 T-M4-11, CA-22/CA-24).
 *
 * Primeira visão consolidada do ledger imutável (leitura USER+ADMIN). Lista paginada server-side
 * (`MatPaginator` 0-based, AD-SQ-29), filtro `q` com `debounceTime(300)` que casa **produto OU
 * autor** (ILIKE no back), ordem `criado_em DESC`. Card mobile-first: tipo, quantidade, produto,
 * **autor** (`usuarioNome` ou `—` — CA-21) e data+hora pt-BR `dd/MM/yyyy HH:mm` em
 * `America/Sao_Paulo` (AD-SQ-40). Estados honestos de carregando/erro/vazio.
 *
 * **RF-3 (REVISÃO 2026-09-04/AD-SQ-67):** o card mostra a **contraparte quando houver** (fornecedor na
 * ENTRADA / cliente na SAÍDA — snapshot do ledger, R3.3) e ganha a ação **"Visualizar"**, que abre a
 * ficha completa do lançamento (`VisualizarLancamento`, `MatDialog`). Nada muda na fonte de dados: o
 * `GET /movimentacoes` (paginação/filtro/ordem `criado_em DESC`) continua igual — a contraparte é
 * aditiva no `MovimentacaoResponse`; a lista **não regride** (anti-regressão dos testes do M4).
 *
 * **T-M7-08 (SPEC-M7 §3.11-a/§3.6):** a MESMA tela ganha a 2ª visão, **"Por produto"** — o extrato de
 * um produto, servido por `GET /produtos/{id}/movimentacoes` (sem endpoint novo). A coluna **Saldo**
 * continua sendo `quantidadeResultante`, que o back grava linha a linha: **nada é somado aqui**, e é
 * essa a razão de o §3.6 ter recusado um "saldo acumulado" calculado no navegador — ele mudaria de
 * significado conforme a paginação. A visão "Por produto" **não requisita nada ao ser ativada**
 * (CA-41): o catálogo do `<select>` vem no foco, e o extrato só quando há produto escolhido.
 */
@Component({
  selector: 'app-movimentacoes',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    FiltrosMovimentacoes,
    ExtratoProduto,
  ],
  providers: [{ provide: MatPaginatorIntl, useFactory: paginatorPtBr }],
  templateUrl: './movimentacoes.html',
  styleUrl: './movimentacoes.scss',
})
export class Movimentacoes implements OnInit {
  private readonly service = inject(MovimentacoesService);
  private readonly produtosService = inject(ProdutosService);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);

  /**
   * Visão ativa (§3.11-a). "Todas" é o default, e é o que mantém a carga inicial em **uma** só
   * requisição (CA-41): trocar de visão não busca nada por si — nem o catálogo do `<select>`, que só
   * é lido quando alguém o foca.
   */
  protected readonly visao = signal<VisaoMovimentacoes>('TODAS');

  /** Produto cujo extrato está aberto. `null` = ninguém escolheu ainda ⇒ nenhuma requisição sai. */
  protected readonly produtoExtrato = signal<ProdutoDoExtrato | null>(null);

  /**
   * Visão "Por produto" ainda sem alvo. Separa "escolha um produto" de "este produto não tem
   * movimentação" (CA-44): são duas verdades diferentes, e a segunda só pode ser dita **depois** de
   * o servidor responder. Dizer a segunda sem ter perguntado seria a tela inventando um fato.
   */
  protected readonly semProduto = computed(() => this.visao() === 'PRODUTO' && !this.produtoExtrato());

  /**
   * RBAC de UX (§3.11-d): a ação "Estornar" só aparece para ADMIN. É orientação de interface — quem
   * barra de verdade é o back (403 do `SecurityConfig`, §3.9). Signal do `AuthService`: com sessão
   * anônima (o caso das suítes herdadas) vale `false` e nada é renderizado nem requisitado.
   */
  protected readonly ehAdmin = this.auth.ehAdmin;

  /** Erro do ESTORNO (409/400) — banner na LISTA, separado do `erro()` de carregar a página. */
  protected readonly erroEstorno = signal<string | null>(null);

  /**
   * Recorte vigente (§3.5) e estado do painel. O painel nasce FECHADO nos dois breakpoints, e o
   * `@if` do template é o que mantém o `MatDatepicker` fora da árvore enquanto ninguém o abre —
   * ver a explicação no cabeçalho de `filtros-movimentacoes.ts`. O estado mora aqui, então fechar
   * o painel não perde recorte.
   */
  protected readonly filtros = signal<FiltroMovimentacoes>({});
  protected readonly filtrosAbertos = signal(false);

  /** Quantos recortes estão ativos — alimenta o rótulo "Filtros (n)" do gatilho. */
  protected readonly filtrosAtivos = computed(
    () =>
      Object.values(this.filtros()).filter((v) => v !== null && v !== undefined && v !== '').length,
  );

  /**
   * Houve recorte aplicado? É o que separa "o livro está vazio" de "este recorte não achou nada" no
   * estado vazio — dizer "nenhuma movimentação registrada" a quem filtrou seria mentira (AD-SQ-168:
   * id sem correspondência é **200 com lista vazia**, resposta honesta, nunca erro).
   */
  protected readonly comRecorte = computed(() => this.filtrosAtivos() > 0 || !!this.filtro.value);

  protected readonly movimentacoes = signal<Movimentacao[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly totalElementos = signal(0);
  protected readonly pagina = signal(0);
  protected readonly tamanho = signal(20);
  protected readonly vazia = computed(
    () => !this.carregando() && !this.erro() && this.movimentacoes().length === 0,
  );

  /** Filtro `q` server-side com debounce (§3.5 — casa produto OU autor por ILIKE). */
  protected readonly filtro = new FormControl('', { nonNullable: true });

  constructor() {
    this.filtro.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => {
        this.pagina.set(0); // novo filtro reinicia na 1ª página
        this.carregar();
      });
  }

  ngOnInit(): void {
    this.carregar();
  }

  /**
   * Geração da carga vigente — **descarta resposta vencida** (P1 da review do delta).
   *
   * Esvaziar o array em `recomecar()` **não basta**: a requisição da visão anterior continua no ar e,
   * quando pousa, escreve na lista. Reproduzido no app real com o `GET /movimentacoes` inicial
   * segurado 9 s (o cold start do host grátis é de **30–50 s**, `HISTORICO.md`): a aba "Por produto"
   * ficava pressionada, o `<select>` em "Escolha um produto…" e a tabela listando **dois produtos
   * diferentes** — a mentira exata que o comentário do `recomecar()` promete impedir.
   *
   * Contador em vez de RxJS (`switchMap`/`takeUntil`) por leveza: o efeito é o mesmo para 3
   * chamadores e não muda a forma do componente. A regra é uma só — **só a última carga pedida pode
   * escrever no estado**, e isso vale para o `next` E para o `error`.
   */
  private geracao = 0;

  /**
   * Carrega a página vigente **da visão ativa**.
   *
   * "Todas" ⇒ `GET /movimentacoes` (o de sempre, com `q` e os recortes do §3.5). "Por produto" ⇒
   * `GET /produtos/{id}/movimentacoes`, que **já existe desde o M2** — o §3.6 decidiu reusá-lo em vez
   * de criar endpoint novo, e é por isso que o Saldo não precisa de conta nenhuma aqui: ele chega
   * gravado em `quantidadeResultante`, linha a linha.
   *
   * Sem produto escolhido **não há o que pedir**: a tela mostra o convite e não gasta viagem.
   */
  protected carregar(): void {
    const alvo = this.produtoExtrato();
    // Sem produto não há o que pedir. Encerrar o "carregando" aqui é parte do contrato: sem isto, o
    // spinner da carga anterior fica preso no lugar do convite (efeito irmão do P1).
    if (this.visao() === 'PRODUTO' && !alvo) {
      this.geracao++;
      this.carregando.set(false);
      return;
    }

    const minha = ++this.geracao;
    this.carregando.set(true);
    this.erro.set(null);
    const fonte =
      this.visao() === 'PRODUTO' && alvo
        ? this.produtosService.movimentacoes(alvo.id, this.pagina(), this.tamanho())
        : this.service.listar(this.pagina(), this.tamanho(), this.filtro.value, this.filtros());
    fonte.subscribe({
      next: (pagina) => {
        if (minha !== this.geracao) return; // resposta vencida: a pergunta na tela é outra
        this.movimentacoes.set(pagina.conteudo);
        this.totalElementos.set(pagina.totalElementos);
        this.carregando.set(false);
      },
      error: () => {
        if (minha !== this.geracao) return; // idem: quem manda no estado é a carga vigente
        this.erro.set('Não foi possível carregar as movimentações. Tente novamente.');
        this.carregando.set(false);
      },
    });
  }

  /**
   * Toda troca de visão/alvo **recomeça na 1ª página e esvazia a lista**.
   *
   * Esvaziar não é zelo: sem isso, as linhas da visão anterior ficariam na tela enquanto a nova
   * carrega — e numa tela de auditoria isso é a pior mentira possível, porque as linhas são
   * verdadeiras, só que de outra pergunta.
   */
  private recomecar(): void {
    this.filtrosAbertos.set(false);
    this.pagina.set(0);
    this.movimentacoes.set([]);
    this.totalElementos.set(0);
    this.erro.set(null);
    this.carregar();
  }

  /** Alternador do §3.11-a. Trocar de visão **não** dispara busca de catálogo (CA-41). */
  protected mudarVisao(nova: VisaoMovimentacoes): void {
    if (this.visao() === nova) return;
    this.visao.set(nova);
    this.recomecar();
  }

  /** Escolha vinda do `<select>` do filho. `null` ⇒ volta ao convite, sem pedir nada. */
  protected escolherProduto(alvo: ProdutoDoExtrato | null): void {
    this.produtoExtrato.set(alvo);
    this.recomecar();
  }

  /**
   * CA-43: clicar no nome do produto abre o extrato **daquele** produto, sem recarregar a página.
   *
   * Linha órfã (produto hard-deletado, `produtoId = null` — FC-08) **não** oferece o clique: não há
   * produto a consultar, e um botão que só pode falhar é promessa falsa. Quem faz o produto aparecer
   * no `<select>` sem catálogo carregado é o `opcoes()` do filho, a partir do `valor` que vai daqui.
   */
  protected abrirExtrato(m: Movimentacao): void {
    if (m.produtoId == null) return;
    this.produtoExtrato.set({ id: m.produtoId, nome: m.produtoNome });
    this.visao.set('PRODUTO');
    this.recomecar();
  }

  protected aoPaginar(evento: PageEvent): void {
    this.pagina.set(evento.pageIndex);
    this.tamanho.set(evento.pageSize);
    this.carregar();
  }

  protected limparFiltro(): void {
    this.filtro.setValue('');
  }

  /** Novo recorte (§3.5): volta à 1ª página — senão a pessoa cai na página 4 de um resultado de 1. */
  protected aplicarFiltros(novo: FiltroMovimentacoes): void {
    this.filtros.set(novo);
    this.filtrosAbertos.set(false);
    this.pagina.set(0);
    this.carregar();
  }

  protected rotuloTipo(t: TipoMovimentacao): string {
    return ROTULOS_TIPO_MOV[t] ?? t;
  }

  /**
   * Produto do lançamento foi hard-deletado (SPEC-M5.2 §3.1, B-R1). O ledger é imutável: o back anula
   * `produtoId` (FK `ON DELETE SET NULL`, FC-08/AD-SQ-34) mas preserva `produtoNome` (snapshot legível).
   * Deriva-se do contrato já existente — **sem** flag nova no back. `== null` cobre `null` e `undefined`
   * (fixtures herdados usam `produtoId:5` → não acionam o selo).
   */
  protected produtoExcluido(m: Movimentacao): boolean {
    return m.produtoId === null || m.produtoId === undefined;
  }

  /**
   * Rótulo da contraparte do lançamento (RF-3): ENTRADA→"Fornecedor" (quando há `fornecedorNome`),
   * SAÍDA→"Cliente" (quando há `clienteNome`); `null` = sem contraparte (não renderiza no card). Usa o
   * NOME (snapshot preservado após hard delete FC-08), não o id.
   */
  protected contraparteRotulo(m: Movimentacao): string | null {
    if (m.tipo === 'ENTRADA' && m.fornecedorNome) return 'Fornecedor';
    if (m.tipo === 'SAIDA' && m.clienteNome) return 'Cliente';
    return null;
  }

  protected contraparteNome(m: Movimentacao): string | null {
    return m.fornecedorNome ?? m.clienteNome ?? null;
  }

  /**
   * Esta linha É um estorno de outra (SPEC-M7 §3.11-e): `estornaMovimentacaoId != null`. A tela marca
   * a linha com o selo `Estorno de #<id>` — as DUAS linhas ficam visíveis, que é o ponto do D-A
   * (corrigir lançamento é inserir linha nova, nunca editar). O ponteiro é só para frente: "esta linha
   * JÁ FOI estornada" não é derivável daqui e se descobre pelo 409 do back (§12 #5).
   */
  protected ehEstorno(m: Movimentacao): boolean {
    return m.estornaMovimentacaoId !== null && m.estornaMovimentacaoId !== undefined;
  }

  /**
   * Formata dinheiro em pt-BR (§3.11-b, colunas "Unitário" e "Total").
   *
   * ⚠️ **`== null`, NUNCA `!valor`** — e isto é contrato, não estilo (§4.4): desconto de 100 % grava
   * `total_final = 0.00`, que é um valor REAL e tem de aparecer como **R$ 0,00**; `null` é "sem valor
   * informado" (P6) e aparece como **—**. Um `if (!valor)` colapsaria os dois casos e faria a tela
   * mentir sobre um brinde/doação. Coberto pelo caso de `0` × `null` em `movimentacoes.tabela.spec.ts`.
   *
   * Aqui **não há arredondamento**: o valor chega do servidor em `NUMERIC(14,2)` (§3.1-a) e esta função
   * só formata. É de propósito que ela não consome `normalizar2` (AD-SQ-165) — normalizar de novo o que
   * já veio normalizado seria reimplementar a aritmética do §3.2-b no navegador.
   */
  protected moeda(valor: number | null | undefined): string {
    return valor == null
      ? '—'
      : valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * O lançamento é estornável **pela regra de UX** (§3.4-d): `AJUSTE` não é estornável, linha que já É
   * um estorno não é estornável, e linha órfã de produto excluído não é (não há estoque a devolver).
   *
   * Isto **não substitui** o back — ele devolve 409 para cada um desses casos e é a autoridade. O que
   * a tela faz é não oferecer um botão que só pode falhar. "Esta linha JÁ FOI estornada" **não** é
   * derivável do payload (o ponteiro é só para frente, §12 #5): esse caso chega como 409 e vira banner.
   */
  protected podeEstornar(m: Movimentacao): boolean {
    return m.tipo !== 'AJUSTE' && !this.ehEstorno(m) && !this.produtoExcluido(m);
  }

  /**
   * Abre a confirmação e, se o operador assinar com um motivo, dispara o `POST` (§3.11-d).
   *
   * Sucesso ⇒ **recarrega a página atual**: a linha nova aparece no topo e a original permanece — as
   * duas visíveis, que é o ponto do D-A. Erro ⇒ mostra a mensagem DO ENVELOPE e **não mexe na lista**;
   * remover a linha otimistamente seria inventar um efeito que o servidor recusou.
   */
  protected estornar(m: Movimentacao): void {
    const dados: ConfirmarEstornoDados = { movimentacao: m };
    this.dialog
      .open(ConfirmarEstorno, { data: dados, maxWidth: 'min(34rem, calc(100vw - 2rem))' })
      .afterClosed()
      .subscribe((motivo?: string) => {
        if (!motivo) return; // cancelou / Esc / backdrop
        this.erroEstorno.set(null);
        this.service.estornar(m.id, motivo).subscribe({
          next: () => this.carregar(),
          error: (falha: HttpErrorResponse) => this.erroEstorno.set(mensagemDoEnvelope(falha)),
        });
      });
  }

  /** Abre a ficha do lançamento (`MatDialog`, só leitura — RF-3/R-CA-11). */
  protected visualizar(m: Movimentacao): void {
    const dados: VisualizarLancamentoDados = { movimentacao: m };
    this.dialog.open(VisualizarLancamento, {
      data: dados,
      maxWidth: 'min(34rem, calc(100vw - 2rem))',
    });
  }
}
