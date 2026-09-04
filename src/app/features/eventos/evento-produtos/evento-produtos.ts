import { Component, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { EventosService } from '../eventos.service';
import { ImagemProduto } from '../../produtos/imagem-produto/imagem-produto';
import { Evento } from '../../../core/models/evento.model';
import { Produto, UnidadeMedida } from '../../../core/models/produto.model';

/** Rótulos pt-BR da unidade (ecoa Produtos): `m3` é exibido `m³`; os demais são o próprio código. */
const ROTULOS_UNIDADE: Record<UnidadeMedida, string> = {
  un: 'un',
  kg: 'kg',
  saco: 'saco',
  m3: 'm³',
  l: 'L',
  g: 'g',
};

/** Tamanho da 1ª página da vitrine (PA#1): carrega 50, sem paginador visual num ateliê pequeno. */
export const TAMANHO_VITRINE = 50;

/**
 * Vitrine do evento — "as flores desta data" (SPEC-M4.1 §7 T-M4.1-2, CA-3).
 *
 * Overlay/modal no MESMO padrão do `evento-form` (host fixo que sobe de baixo no celular, caixa
 * centrada na bancada no desktop): recebe o `evento`, carrega a 1ª página de
 * `GET /eventos/{id}/produtos` (`tamanho=50`, PA#1) e lista cada flor reusando
 * `<app-imagem-produto>` + nome + unidade + estoque. Estados honestos: carregando / erro (com
 * "tentar de novo") / vazio. Se `totalElementos > 50`, um rodapé discreto informa "mostrando 50 de N".
 *
 * Leitura para USER **e** ADMIN (a lista abre este modal p/ todos — fora do `@if ehAdmin`). Fecha por
 * botão, Esc (HostListener) ou clique no véu (a lista-mãe hospeda o `.veu`). Mobile-first (FC-02).
 */
@Component({
  selector: 'app-evento-produtos',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, ImagemProduto],
  templateUrl: './evento-produtos.html',
  styleUrl: './evento-produtos.scss',
})
export class EventoProdutos implements OnInit {
  private readonly service = inject(EventosService);

  /** Evento cuja vitrine será exibida (a lista-mãe injeta o evento clicado). */
  readonly evento = input.required<Evento>();

  /** Emite quando o operador fecha o modal (botão/Esc/véu). */
  readonly fechado = output<void>();

  protected readonly produtos = signal<Produto[]>([]);
  protected readonly total = signal(0);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly vazia = computed(
    () => !this.carregando() && !this.erro() && this.produtos().length === 0,
  );
  /** Rodapé discreto "mostrando 50 de N" quando o evento tem mais flores do que a 1ª página (PA#1). */
  protected readonly excedeuPagina = computed(() => this.total() > TAMANHO_VITRINE);
  protected readonly tamanhoPagina = TAMANHO_VITRINE;

  ngOnInit(): void {
    this.carregar();
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.service.listarProdutosDoEvento(this.evento().id, 0, TAMANHO_VITRINE).subscribe({
      next: (pagina) => {
        this.produtos.set(pagina.conteudo);
        this.total.set(pagina.totalElementos);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar as flores deste evento. Tente novamente.');
        this.carregando.set(false);
      },
    });
  }

  @HostListener('document:keydown.escape')
  protected fechar(): void {
    this.fechado.emit();
  }

  protected rotuloUnidade(u: UnidadeMedida): string {
    return ROTULOS_UNIDADE[u] ?? u;
  }
}
