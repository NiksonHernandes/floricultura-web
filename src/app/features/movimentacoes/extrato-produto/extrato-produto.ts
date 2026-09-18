import { Component, computed, inject, input, output, signal } from '@angular/core';

import { ProdutosService } from '../../produtos/produtos.service';

/** Produto do extrato: só o que a tela precisa (id + nome), nunca a entidade inteira. */
export interface ProdutoDoExtrato {
  id: number;
  nome: string;
}

/**
 * Escolha do produto da visão "Por produto" (SPEC-M7 §3.6/§3.11-a).
 *
 * **Componente próprio por MEDIÇÃO, não por gosto** — mesma razão (e mesmo precedente) do
 * `filtros-movimentacoes/` da AD-SQ-177: com este bloco dentro de `movimentacoes.scss`, o arquivo
 * compilou em **8 074 B** e o `npm run build` falhou com
 * `ERROR … Budget 8.00 kB was not met by 42 bytes with a total of 8.04 kB` (§12 #10: acima de 8 kB é
 * **erro**, não warning). Folha própria = orçamento próprio.
 *
 * **Nada é buscado no `ngOnInit`** (CA-41): o catálogo só sai no `focus` do `<select>`, e a flag
 * impede repetir a viagem a cada foco. Em falha ela volta a `false`, senão a tela ficaria muda para
 * sempre depois de um erro de rede.
 *
 * O ESTADO mora no pai (`valor` in / `escolheu` out), como no painel de filtros: trocar de visão não
 * perde o produto aberto.
 */
@Component({
  selector: 'app-extrato-produto',
  templateUrl: './extrato-produto.html',
  styleUrl: './extrato-produto.scss',
})
export class ExtratoProduto {
  private readonly produtosService = inject(ProdutosService);

  /** Produto vigente, vindo do pai (pode ter sido aberto pelo clique no nome, sem passar por aqui). */
  readonly valor = input<ProdutoDoExtrato | null>(null);

  /** `null` = voltou para "escolha um produto" — o pai é quem decide o que fazer com isso. */
  readonly escolheu = output<ProdutoDoExtrato | null>();

  private readonly catalogo = signal<ProdutoDoExtrato[]>([]);
  private carregado = false;

  /**
   * O produto vigente entra na lista mesmo quando o catálogo ainda não foi buscado — ou quando ele
   * não está nos 100 primeiros. Sem isto, abrir o extrato pelo clique na lista deixaria o `<select>`
   * em branco enquanto a tabela mostra o extrato daquele produto: a tela contradizendo a si mesma.
   *
   * ⚠️ Lido em `computed`/template, **nunca no construtor**: signal de `input()` só é preenchido
   * depois da instanciação (§12 #31).
   */
  protected readonly opcoes = computed(() => {
    const lista = this.catalogo();
    const alvo = this.valor();
    return alvo && !lista.some((p) => p.id === alvo.id) ? [alvo, ...lista] : lista;
  });

  /** 1ª página com teto de 100, mesmo padrão do painel de filtros: é conveniência, não catálogo. */
  protected carregarCatalogo(): void {
    if (this.carregado) return;
    this.carregado = true;
    this.produtosService.listar(0, 100).subscribe({
      next: (p) => this.catalogo.set(p.conteudo.map((x) => ({ id: x.id, nome: x.nome }))),
      error: () => {
        this.catalogo.set([]);
        this.carregado = false;
      },
    });
  }

  /** O `value` de um `<select>` nativo é texto — a comparação é feita como texto, de propósito. */
  protected escolher(id: string): void {
    this.escolheu.emit(this.opcoes().find((p) => `${p.id}` === id) ?? null);
  }
}
