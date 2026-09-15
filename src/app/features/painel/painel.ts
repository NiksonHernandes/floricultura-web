import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProdutosService } from '../produtos/produtos.service';
import { ClientesService } from '../clientes/clientes.service';
import { MovimentacoesService } from '../movimentacoes/movimentacoes.service';
import { AuthService } from '../../core/services/auth.service';
import { FILTRO_VAZIO } from '../../core/models/produto-filtro.model';
import { Produto, Movimentacao } from '../../core/models/produto.model';
import { EventoProximo } from '../../core/models/evento.model';
import { ApiResponse } from '../../core/models/api-response.model';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-painel',
  imports: [RouterLink, DatePipe, DecimalPipe, MatIconModule, MatButtonModule],
  templateUrl: './painel.html',
  styleUrl: './painel.scss',
})
export class Painel {
  private readonly produtos = inject(ProdutosService);
  private readonly clientes = inject(ClientesService);
  private readonly movimentacoes = inject(MovimentacoesService);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly usuario = inject(AuthService).usuarioAtual;
  protected readonly hoje = new Date();
  protected readonly carregando = signal(false);
  protected readonly erro = signal(false);
  protected readonly dados = signal<{
    produtos: number;
    clientes: number;
    baixo: number;
    reposicao: Produto[];
    atividade: Movimentacao[];
    eventos: EventoProximo[];
  } | null>(null);

  constructor() {
    this.carregar();
  }

  protected carregar(): void {
    if (this.carregando()) return;
    this.carregando.set(true);
    this.erro.set(false);
    forkJoin({
      produtos: this.produtos.listar(0, 1),
      clientes: this.clientes.listar(0, 1),
      baixo: this.produtos.listar(0, 5, undefined, {
        ...FILTRO_VAZIO,
        estoque: 'BAIXO',
        ordenarPor: 'estoque',
      }),
      atividade: this.movimentacoes.listar(0, 5),
      eventos: this.http.get<ApiResponse<EventoProximo[]>>(
        `${environment.apiBaseUrl}/eventos/proximos`,
      ),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.dados.set({
            produtos: r.produtos.totalElementos,
            clientes: r.clientes.totalElementos,
            baixo: r.baixo.totalElementos,
            reposicao: r.baixo.conteudo,
            atividade: r.atividade.conteudo,
            eventos: r.eventos.data ?? [],
          });
          this.carregando.set(false);
        },
        error: () => {
          this.erro.set(true);
          this.carregando.set(false);
        },
      });
  }
}
