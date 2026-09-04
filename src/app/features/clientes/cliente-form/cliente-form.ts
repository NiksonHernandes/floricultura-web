import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ClientesService } from '../clientes.service';
import { ProdutosService } from '../../produtos/produtos.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { Cliente, ClienteRequest } from '../../../core/models/cliente.model';
import { Produto } from '../../../core/models/produto.model';

/**
 * Form de criar/editar cliente — "a folha da agenda" (SPEC-M5 §7 T-M5-8, §3.6, CA-12/CA-13/CA-15).
 *
 * Conteúdo de um overlay modal hospedado pela lista (`Clientes`), no mesmo padrão do `evento-form`/
 * `produto-form`. Reativo; a validação espelha o §4.1 (a forte é do back): `nome` (req, ≤150),
 * `telefone` (≤40, string livre), `email` (`Validators.email` quando presente, ≤180), `observacoes`
 * (≤500) com **aviso LGPD** anti-dado-sensível. Multiselect informativo de produtos (`mat-select
 * multiple`) — vínculo N:N (AD-SQ-44). Sem `cliente` = criar (`POST`); com `cliente` = editar (`PUT`).
 *
 * **Opções do multiselect (§3.6/Q3):** carregadas por `GET /produtos?tamanho=100` (1ª página, teto
 * de 100 no MVP). Diferente do `produto-form` (que recebe eventos por `input` da lista), aqui o form
 * carrega as próprias opções: a lista de Clientes não guarda `ProdutosService` (root) e o gancho de
 * teste da lista (T-M5-7) foi escrito p/ NÃO renderizar overlay sem `detectChanges` — carregar aqui
 * mantém a suíte de lista intacta (anti-burla). O contrato observável (endpoint das opções +
 * `produtoIds` replace-set) é honrado igual.
 *
 * **`produtoIds` (§4.2, replace-set):** o front SEMPRE envia o campo (inclusive `[]` = limpar). Em
 * edição, o item de LISTA traz `produtoIds=null` (AD-SQ-38/44), então o form busca o DETALHE
 * (`GET /{id}`) para pré-selecionar os vínculos vigentes.
 *
 * Só ADMIN escreve (FC-07) — a lista só abre este form p/ ADMIN; o back é a fonte de verdade (403).
 * Ao sucesso emite `salvo` (a lista fecha o overlay e recarrega). O hard delete (FC-08) é da lista.
 */
@Component({
  selector: 'app-cliente-form',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './cliente-form.html',
  styleUrl: './cliente-form.scss',
})
export class ClienteForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ClientesService);
  private readonly produtosService = inject(ProdutosService);

  /** Cliente em edição; `null`/ausente = modo criação. */
  readonly cliente = input<Cliente | null>(null);

  /** Emite o cliente salvo (criado/editado) para a lista-mãe recarregar. */
  readonly salvo = output<Cliente>();
  /** Emite quando o operador cancela/fecha sem salvar. */
  readonly cancelado = output<void>();

  protected readonly enviando = signal(false);
  protected readonly erroGeral = signal<string | null>(null);

  /** Opções do multiselect (§3.6): `GET /produtos?tamanho=100`. Falha degrada p/ lista vazia. */
  protected readonly produtos = signal<Produto[]>([]);

  protected readonly editando = computed(() => this.cliente() !== null);

  /**
   * Validação espelha o §4.1 (a forte é do back). `email` usa `Validators.email` — vazio é VÁLIDO
   * (campo opcional), valor presente inválido bloqueia o envio. Todos os opcionais viram `null` no
   * payload quando em branco (`montarPayload`).
   */
  protected readonly form = this.fb.group({
    nome: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(150)]),
    telefone: this.fb.nonNullable.control('', [Validators.maxLength(40)]),
    email: this.fb.nonNullable.control('', [Validators.email, Validators.maxLength(180)]),
    observacoes: this.fb.nonNullable.control('', [Validators.maxLength(500)]),
  });

  /**
   * Produtos vinculados (§3.6/§4.2) — controle STANDALONE, FORA do `form` group. Vai ao payload como
   * `produtoIds` SEMPRE (replace-set — o front nunca omite o campo, §4.2). Em edição é pré-preenchido
   * pelos `produtoIds` do DETALHE (o item de lista vem `null`).
   */
  protected readonly produtosSelecionados = this.fb.nonNullable.control<number[]>([]);

  ngOnInit(): void {
    this.carregarProdutos();
    const c = this.cliente();
    if (c) {
      // Campos escalares já vêm no item de lista; os vínculos só no detalhe (produtoIds=null na lista).
      this.form.setValue({
        nome: c.nome,
        telefone: c.telefone ?? '',
        email: c.email ?? '',
        observacoes: c.observacoes ?? '',
      });
      this.carregarDetalhe(c.id);
    }
  }

  /** Opções do multiselect (1ª página, teto 100 — Q3/§3.6). Falha = lista vazia, sem travar o form. */
  private carregarProdutos(): void {
    this.produtosService.listar(0, 100).subscribe({
      next: (pagina) => this.produtos.set(pagina.conteudo),
      error: () => this.produtos.set([]),
    });
  }

  /** Detalhe (`GET /{id}`) só para pré-selecionar os `produtoIds` vigentes (a lista vem `null`). */
  private carregarDetalhe(id: number): void {
    this.service.detalhar(id).subscribe({
      next: (detalhe) => this.produtosSelecionados.setValue(detalhe.produtoIds ?? []),
      error: () => this.produtosSelecionados.setValue([]),
    });
  }

  protected salvar(): void {
    if (this.enviando()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.erroGeral.set(null);
    const req = this.montarPayload();
    const alvo = this.cliente();

    const requisicao = alvo ? this.service.atualizar(alvo.id, req) : this.service.criar(req);
    requisicao.subscribe({
      next: (salvo) => {
        this.enviando.set(false);
        this.salvo.emit(salvo);
      },
      error: (erro: HttpErrorResponse) => {
        this.enviando.set(false);
        this.tratarErro(erro);
      },
    });
  }

  protected cancelar(): void {
    this.cancelado.emit();
  }

  /**
   * Monta o payload §3.3: opcionais em branco viram `null` (ausência honesta, não string vazia);
   * `produtoIds` SEMPRE presente (replace-set — §4.2; `[]` limpa os vínculos).
   */
  private montarPayload(): ClienteRequest {
    const v = this.form.getRawValue();
    return {
      nome: v.nome.trim(),
      telefone: v.telefone.trim() || null,
      email: v.email.trim() || null,
      observacoes: v.observacoes.trim() || null,
      produtoIds: this.produtosSelecionados.value,
    };
  }

  /** `400 VALIDATION_ERROR` → `details` por campo; sem details/erro genérico → banner geral. */
  private tratarErro(erro: HttpErrorResponse): void {
    if (erro.status === 400) {
      const detalhes = (erro.error as ApiResponse<unknown> | null)?.error?.details ?? [];
      for (const item of detalhes) {
        this.form.get(item.field)?.setErrors({ servidor: item.message });
      }
      if (detalhes.length === 0) {
        this.erroGeral.set('Confira os dados informados.');
      }
      return;
    }
    if (erro.status === 403) {
      this.erroGeral.set('Você não tem permissão para salvar clientes.');
      return;
    }
    this.erroGeral.set('Não foi possível salvar agora. Tente novamente.');
  }
}
