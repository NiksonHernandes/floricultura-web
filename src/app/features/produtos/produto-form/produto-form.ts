import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ProdutosService } from '../produtos.service';
import { FornecedoresService } from '../../fornecedores/fornecedores.service';
import { ImagemProduto } from '../imagem-produto/imagem-produto';
import { RecorteFoto } from '../recorte-foto/recorte-foto';
import { ApiResponse } from '../../../core/models/api-response.model';
import {
  MovimentacaoRequest,
  Produto,
  ProdutoRequest,
  UnidadeMedida,
} from '../../../core/models/produto.model';
import { Fornecedor } from '../../../core/models/fornecedor.model';
import { Evento } from '../../../core/models/evento.model';

/**
 * Motivo padrão da ENTRADA lançada na criação do produto (AD-SQ-35/CA-22). Grava no ledger
 * o rastro de que o estoque nasceu junto do cadastro (auditável — o estoque nunca fura o ledger).
 */
export const MOTIVO_ENTRADA_INICIAL = 'Estoque inicial (cadastro)';

/**
 * Whitelist de tipos aceitos no seletor (SPEC-M3 §3.6/CA-12). ESPELHO do back — a validação
 * FORTE (whitelist + anti-spoofing por magic bytes) é do servidor (§3.3); aqui é só orientação de UX.
 */
export const TIPOS_IMAGEM_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Limite de 5 MB espelhado do back (`APP_UPLOAD_IMAGEM_MAX_BYTES` default — §3.3). Só orientação. */
export const TAMANHO_MAX_IMAGEM_BYTES = 5 * 1024 * 1024;

/** Opções do select de unidade (AD-SQ-31): valor = código ASCII persistido; rótulo amigável (`m³`, `L`). */
export const OPCOES_UNIDADE: ReadonlyArray<{ valor: UnidadeMedida; rotulo: string }> = [
  { valor: 'un', rotulo: 'Unidade (un)' },
  { valor: 'kg', rotulo: 'Quilograma (kg)' },
  { valor: 'saco', rotulo: 'Saco' },
  { valor: 'm3', rotulo: 'Metro cúbico (m³)' },
  { valor: 'l', rotulo: 'Litro (L)' },
  { valor: 'g', rotulo: 'Grama (g)' },
];

/**
 * Form de criar/editar produto — "a ficha do vaso" (SPEC-M2 §7 T-M2-8, CA-20 parte form).
 *
 * Conteúdo de um diálogo modal hospedado pela lista (`Produtos`). Reativo, espelha a validação
 * do §3.2 (a validação forte é do back): `nome` (2..150, req), `descricao` (opcional),
 * `unidadeMedida` (select do enum, req — AD-SQ-31), `estoqueMinimo` (req, ≥0), `preco`
 * (OPCIONAL, ≥0 — ausência = `null`, AD-SQ-28), `imagemUrl` (opcional, ≤1000, sem validação de
 * existência — AD-SQ-32). **NÃO** há campo de estoque atual: estoque só muda por movimentação
 * (AD-SQ-30). Sem `produto` = criar (`POST`); com `produto` = editar (`PUT`).
 *
 * Erro contra o contrato §3.2: `400 VALIDATION_ERROR` → aplica `error.details` por campo;
 * demais falhas → banner geral. Só ADMIN escreve (FC-07) — a lista só abre este form p/ ADMIN.
 * Ao sucesso emite `salvo` (a lista recarrega).
 *
 * T-M2-11 (CA-22, AD-SQ-35): SÓ no modo criação, oferece um campo OPCIONAL de **entrada inicial**
 * de estoque (`FormControl` standalone, FORA do form group — a quantidade NUNCA entra no
 * `ProdutoRequest`). Orquestra 2 chamadas: `POST /produtos` (nasce estoque 0 — AD-SQ-30) → se
 * `entradaInicial > 0`, `POST /produtos/{id}/movimentacoes` (ENTRADA, motivo default). Se a criação
 * dá 201 mas a ENTRADA falha, o produto JÁ existe: emite `salvo` (não recria/deleta) e sinaliza
 * `entradaInicialFalhou` para a lista-mãe avisar (snackbar de warning). O diálogo "Movimentar"
 * (T-M2-9) permanece intacto.
 *
 * T-M3-5 (CA-12, SPEC-M3 §3.6): seletor de imagem (JPG/PNG/WEBP) com **preview local**
 * (`URL.createObjectURL`, funciona SEM backend) e validação client-side ESPELHO (tipo/≤5 MB — a
 * validação forte é do back). **Criação:** o arquivo fica "staged" e sobe DEPOIS do `POST /produtos`
 * (`enviarImagem`), no mesmo padrão de falha parcial da entrada inicial (deriva AD-SQ-35): upload
 * falho ⇒ produto EXISTE, emite `salvo` + sinaliza `imagemFalhou` (warning na lista-mãe), sem
 * recriar/deletar. **Edição:** envio DIRETO/imediato ao selecionar (`enviarImagem`) e botão
 * "Remover imagem" (`removerImagem`) quando `temImagem`; a imagem atual reusa `ImagemProduto`.
 *
 * T-M3.1-3 (SPEC-M3.1 §3.3, AD-SQ-41): a seleção deixa de stagear/enviar a fonte crua — ela abre um
 * cropper (`<app-recorte-foto>`, moldura 16/10, pan+zoom) via `arquivoParaRecorte`; SÓ o recorte
 * confirmado (`aoRecortar`, File JPEG) segue o fluxo acima (staged na criação / envio direto na
 * edição), com a guarda de 5 MB no recorte final. Cancelar o cropper preserva o estado. As
 * assinaturas de `enviarImagem`/`removerImagem` NÃO mudam (o recorte já vem como File).
 */
@Component({
  selector: 'app-produto-form',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ImagemProduto,
    RecorteFoto,
  ],
  templateUrl: './produto-form.html',
  styleUrl: './produto-form.scss',
})
export class ProdutoForm implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ProdutosService);
  private readonly fornecedoresService = inject(FornecedoresService);

  /** Produto em edição; `null`/ausente = modo criação (nova instância por abertura do diálogo). */
  readonly produto = input<Produto | null>(null);

  /**
   * Opções do multiselect de eventos (SPEC-M4 §3.4/CA-12), carregadas de `GET /eventos` pela
   * lista-mãe e passadas por `input` — assim o form NÃO injeta o serviço de eventos, preservando
   * os specs do M2/M3 (sem HttpClient) intactos (anti-burla).
   */
  readonly eventos = input<Evento[]>([]);

  /** Emite o produto salvo (criado/editado) para a lista-mãe recarregar. */
  readonly salvo = output<Produto>();
  /** Emite quando o operador cancela/fecha sem salvar. */
  readonly cancelado = output<void>();
  /**
   * Sinaliza que o produto foi criado (201) mas a ENTRADA inicial de estoque falhou (AD-SQ-35).
   * Emitido ANTES de `salvo` no ramo de falha; a lista-mãe troca o snackbar de sucesso pelo de
   * warning (o produto existe com estoque 0 — não é desfeito).
   */
  readonly entradaInicialFalhou = output<void>();
  /**
   * Sinaliza que o produto foi criado (201) mas o upload da imagem falhou (T-M3-5, deriva AD-SQ-35).
   * Emitido ANTES de `salvo` no ramo de falha; a lista-mãe troca o snackbar de sucesso pelo de
   * warning (o produto existe SEM imagem — não é desfeito; a imagem pode ser tentada na edição).
   */
  readonly imagemFalhou = output<void>();

  protected readonly enviando = signal(false);
  protected readonly erroGeral = signal<string | null>(null);
  protected readonly opcoesUnidade = OPCOES_UNIDADE;

  protected readonly editando = computed(() => this.produto() !== null);

  // --- Estado da imagem (T-M3-5, CA-12) ---
  /** Produto vivo no diálogo (edição): mutado após enviar/remover imagem para refletir `temImagem`. */
  protected readonly produtoAtual = signal<Produto | null>(null);
  /** object URL do preview local do arquivo selecionado (revogado ao trocar/descartar/destruir). */
  protected readonly previewUrl = signal<string | null>(null);
  /**
   * Foto-fonte aguardando enquadramento no cropper (T-M3.1-3, §3.3). Enquanto `!= null` o overlay
   * `<app-recorte-foto>` fica aberto sobre a ficha; a fonte crua NUNCA é stageada/enviada — só o
   * recorte confirmado (`aoRecortar`) entra no fluxo.
   */
  protected readonly arquivoParaRecorte = signal<File | null>(null);
  /** Erro da imagem (validação client-side ou falha do envio/remoção imediatos na edição). */
  protected readonly erroImagem = signal<string | null>(null);
  /** Upload/remoção imediatos em andamento (só na edição — trava os botões da foto). */
  protected readonly enviandoImagem = signal(false);
  /** Rótulo do botão de seleção muda conforme já haja imagem/preview. */
  protected readonly temFoto = computed(
    () => this.previewUrl() !== null || (this.editando() && (this.produtoAtual()?.temImagem ?? false)),
  );

  /** Arquivo "staged" na CRIAÇÃO (sobe após o POST). Não é signal: lido só no `salvar`. */
  private arquivo: File | null = null;
  /** object URL vivo do preview (fora de signal para revogar sem disparar CD). */
  private previewObjectUrl: string | null = null;

  /** Validação de campo espelha o §3.2; `estoqueAtual` fica de fora (AD-SQ-30). */
  protected readonly form = this.fb.group({
    nome: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(150),
    ]),
    descricao: this.fb.nonNullable.control('', [Validators.maxLength(2000)]),
    unidadeMedida: this.fb.nonNullable.control<UnidadeMedida | ''>('', [Validators.required]),
    estoqueMinimo: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    preco: this.fb.control<number | null>(null, [Validators.min(0)]),
    imagemUrl: this.fb.nonNullable.control('', [Validators.maxLength(1000)]),
  });

  /**
   * Entrada inicial de estoque (AD-SQ-35/CA-22) — controle STANDALONE, FORA do `form` group: a
   * quantidade NUNCA entra no `ProdutoRequest`, só no `MovimentacaoRequest` da 2ª chamada. Opcional
   * (vazio/`null`/`0` = sem ENTRADA); `min(0)` bloqueia negativo. Só é lido/exibido no modo criação.
   */
  protected readonly entradaInicial = this.fb.control<number | null>(null, [Validators.min(0)]);

  /**
   * Fornecedor OPCIONAL da entrada inicial (SPEC-M5.1 HISTÓRIA #3/CA-4..7) — controle STANDALONE,
   * FORA do `form` group (como `entradaInicial`): NUNCA entra no `ProdutoRequest`, só compõe o
   * `MovimentacaoRequest` da ENTRADA quando há quantidade > 0 E fornecedor selecionado. `null` = sem
   * contraparte (payload idêntico ao M5 — backward compat). A validação/snapshot são do back (AD-SQ-64).
   */
  protected readonly fornecedorInicial = this.fb.control<number | null>(null);

  /**
   * Opções do select de fornecedor — carregadas SOB DEMANDA ao abrir o select (`aoAbrirFornecedores`),
   * espelhando `movimentar-estoque`. NÃO no `ngOnInit`: os specs herdados do form nunca abrem o select
   * ⇒ `httpMock.verify()` limpo (invariante anti-burla §12). Só lista fornecedores JÁ cadastrados.
   */
  protected readonly fornecedores = signal<Fornecedor[]>([]);
  private fornecedoresCarregados = false;

  /**
   * Eventos vinculados (SPEC-M4 §3.4/CA-12) — controle STANDALONE, FORA do `form` group: mantém
   * `form.setValue(...)` dos specs do M2/M3 com os 6 campos originais (anti-burla). Vai ao payload
   * como `eventoIds` só quando há seleção ou quando o produto já tinha vínculos (replace-set/limpar).
   */
  protected readonly eventosSelecionados = this.fb.nonNullable.control<number[]>([]);

  /** Vínculos originais do produto em edição (do detalhe `GET /{id}`) — base do replace-set/limpar. */
  private eventosOriginais: number[] = [];

  ngOnInit(): void {
    const p = this.produto();
    if (p) {
      this.eventosOriginais = p.eventoIds ?? [];
      this.eventosSelecionados.setValue([...this.eventosOriginais]);
      // Modo edição: guarda o produto vivo (para a foto atual/remover) e pré-preenche o form
      // (sem `estoqueAtual` — não é editável por CRUD).
      this.produtoAtual.set(p);
      this.form.setValue({
        nome: p.nome,
        descricao: p.descricao ?? '',
        unidadeMedida: p.unidadeMedida,
        estoqueMinimo: p.estoqueMinimo,
        preco: p.preco,
        imagemUrl: p.imagemUrl ?? '',
      });
    }
  }

  ngOnDestroy(): void {
    this.limparPreview();
  }

  protected salvar(): void {
    if (this.enviando()) {
      return;
    }
    // No modo criação, a entrada inicial (standalone) também precisa ser válida (não negativa).
    const entradaInvalida = !this.editando() && this.entradaInicial.invalid;
    if (this.form.invalid || entradaInvalida) {
      this.form.markAllAsTouched();
      this.entradaInicial.markAsTouched();
      return;
    }

    this.enviando.set(true);
    this.erroGeral.set(null);
    const req = this.montarPayload();
    const alvo = this.produto();

    if (alvo) {
      // Edição: PUT nunca toca estoque (AD-SQ-30); a entrada inicial não existe/age aqui.
      this.service.atualizar(alvo.id, req).subscribe({
        next: (salvo) => {
          this.enviando.set(false);
          this.salvo.emit(salvo);
        },
        error: (erro: HttpErrorResponse) => {
          this.enviando.set(false);
          this.tratarErro(erro);
        },
      });
      return;
    }

    // Criação: POST /produtos (nasce estoque 0). Encadeia entrada inicial e imagem, se houver.
    this.service.criar(req).subscribe({
      next: (criado) => this.aposCriar(criado),
      error: (erro: HttpErrorResponse) => {
        this.enviando.set(false);
        this.tratarErro(erro);
      },
    });
  }

  /**
   * Pós-criação (orquestração): passo 1 = ENTRADA inicial (se `> 0`); passo 2 = upload da imagem
   * staged (se houver). Cada passo é NÃO-bloqueante — a falha só sinaliza o output e segue: o produto
   * já existe (CA-22/CA-12), nunca é desfeito/recriado.
   */
  private aposCriar(criado: Produto): void {
    const entrada = this.entradaInicial.value;
    if (entrada !== null && entrada > 0) {
      const req: MovimentacaoRequest = {
        tipo: 'ENTRADA',
        quantidade: entrada,
        motivo: MOTIVO_ENTRADA_INICIAL,
      };
      // Contraparte opcional (HISTÓRIA #3/CA-5): só inclui `fornecedorId` quando há seleção; sem
      // seleção o payload fica IDÊNTICO ao M5 (backward compat). O nome é snapshot server-side.
      const fornecedor = this.fornecedorInicial.value;
      if (fornecedor != null) {
        req.fornecedorId = fornecedor;
      }
      this.service.movimentar(criado.id, req).subscribe({
        next: () => this.enviarImagemCriacao(criado),
        error: () => {
          this.entradaInicialFalhou.emit();
          this.enviarImagemCriacao(criado);
        },
      });
    } else {
      this.enviarImagemCriacao(criado);
    }
  }

  /**
   * Carrega os fornecedores ao ABRIR o select (`?tamanho=100`, teto MVP) — 1ª vez apenas, espelhando
   * `movimentar-estoque.aoAbrirFornecedores`. Falha → lista vazia e permite nova tentativa na reabertura
   * (o select degrada em silêncio; o fornecedor é opcional). NUNCA dispara no `ngOnInit` (anti-burla §12).
   */
  protected aoAbrirFornecedores(aberto: boolean): void {
    if (!aberto || this.fornecedoresCarregados) {
      return;
    }
    this.fornecedoresCarregados = true;
    this.fornecedoresService.listar(0, 100).subscribe({
      next: (pagina) => this.fornecedores.set(pagina.conteudo),
      error: () => {
        this.fornecedores.set([]);
        this.fornecedoresCarregados = false;
      },
    });
  }

  /**
   * Passo 2 da orquestração (T-M3-5): sobe o arquivo staged via `POST /produtos/{id}/imagem`. No
   * sucesso emite o produto ATUALIZADO (`temImagem:true`). Na falha, o produto JÁ existe SEM imagem:
   * sinaliza `imagemFalhou` e AINDA emite `salvo` — não desfaz/recria (deriva AD-SQ-35).
   */
  private enviarImagemCriacao(criado: Produto): void {
    if (!this.arquivo) {
      this.finalizarCriacao(criado);
      return;
    }
    this.service.enviarImagem(criado.id, this.arquivo).subscribe({
      next: (atualizado) => this.finalizarCriacao(atualizado),
      error: () => {
        this.imagemFalhou.emit();
        this.finalizarCriacao(criado);
      },
    });
  }

  private finalizarCriacao(p: Produto): void {
    this.enviando.set(false);
    this.salvo.emit(p);
  }

  // --- Seleção / preview / envio de imagem (T-M3-5, CA-12) ---

  /**
   * Arquivo escolhido no seletor (T-M3.1-3, §3.3): valida SÓ o TIPO (whitelist espelho) e ABRE o
   * cropper com a fonte — NÃO stagea/envia a fonte crua. O enquadramento e a guarda de 5 MB ficam
   * no recorte final (`aoRecortar`). Limpa o `value` do input para permitir reescolher o mesmo arquivo.
   * "Trocar foto" reusa este handler (nova sessão de cropper).
   */
  protected aoSelecionarArquivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0] ?? null;
    input.value = '';
    if (!arquivo) {
      return;
    }
    const erro = this.validarTipoImagem(arquivo);
    if (erro) {
      this.erroImagem.set(erro);
      return;
    }
    this.erroImagem.set(null);
    this.arquivoParaRecorte.set(arquivo); // abre o overlay do cropper
  }

  /**
   * Recorte confirmado no cropper (File JPEG — §3.3). Fecha o overlay, valida `≤ 5 MB` (senão erro
   * local, não segue), gera o preview local (objectURL do recorte) e — na EDIÇÃO — envia DIRETO;
   * na CRIAÇÃO fica "staged" para subir após o POST (mesma semântica de falha parcial, AD-SQ-35).
   * Confirmar substitui o recorte/preview anteriores (destrutivo — AD-SQ-41).
   */
  protected aoRecortar(recorte: File): void {
    this.arquivoParaRecorte.set(null);
    if (recorte.size > TAMANHO_MAX_IMAGEM_BYTES) {
      this.erroImagem.set('Imagem acima de 5 MB. Reduza o zoom ou escolha um arquivo menor.');
      return;
    }
    this.erroImagem.set(null);
    this.definirPreview(recorte);
    if (this.editando()) {
      this.enviarImagemEdicao(recorte);
    } else {
      this.arquivo = recorte;
    }
  }

  /** Cancelar o cropper: descarta a fonte, nada muda (o estado anterior do form é preservado). */
  protected aoCancelarRecorte(): void {
    this.arquivoParaRecorte.set(null);
  }

  /** Validação client-side ESPELHO do TIPO (só orientação; a forte é do back — §3.3). */
  private validarTipoImagem(arquivo: File): string | null {
    if (!TIPOS_IMAGEM_ACEITOS.includes(arquivo.type as (typeof TIPOS_IMAGEM_ACEITOS)[number])) {
      return 'Formato não suportado. Use JPG, PNG ou WEBP.';
    }
    return null;
  }

  /** Edição: envio imediato (`enviarImagem`). Sucesso atualiza a foto atual; falha mantém o preview. */
  private enviarImagemEdicao(arquivo: File): void {
    const alvo = this.produtoAtual();
    if (!alvo) {
      return;
    }
    this.enviandoImagem.set(true);
    this.service.enviarImagem(alvo.id, arquivo).subscribe({
      next: (atualizado) => {
        this.enviandoImagem.set(false);
        this.arquivo = null;
        this.limparPreview(); // passa a exibir a imagem do banco (temImagem:true, novo atualizadoEm)
        this.produtoAtual.set(atualizado);
      },
      error: () => {
        this.enviandoImagem.set(false);
        this.erroImagem.set('Não foi possível enviar a imagem. Tente novamente.');
      },
    });
  }

  /**
   * Botão "Remover imagem". Na EDIÇÃO com `temImagem`, chama `removerImagem` (o card cai de volta
   * para `imagemUrl`, se houver — AD-SQ-37). Na CRIAÇÃO, apenas descarta o arquivo staged/preview.
   */
  protected removerImagem(): void {
    if (this.enviandoImagem()) {
      return;
    }
    this.erroImagem.set(null);
    if (!this.editando()) {
      this.arquivo = null;
      this.limparPreview();
      return;
    }
    const alvo = this.produtoAtual();
    if (!alvo || !alvo.temImagem) {
      return;
    }
    this.enviandoImagem.set(true);
    this.service.removerImagem(alvo.id).subscribe({
      next: () => {
        this.enviandoImagem.set(false);
        this.arquivo = null;
        this.limparPreview();
        this.produtoAtual.set({ ...alvo, temImagem: false });
      },
      error: () => {
        this.enviandoImagem.set(false);
        this.erroImagem.set('Não foi possível remover a imagem. Tente novamente.');
      },
    });
  }

  private definirPreview(arquivo: File): void {
    this.limparPreview();
    this.previewObjectUrl = URL.createObjectURL(arquivo);
    this.previewUrl.set(this.previewObjectUrl);
  }

  private limparPreview(): void {
    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = null;
    }
    this.previewUrl.set(null);
  }

  protected cancelar(): void {
    this.cancelado.emit();
  }

  /**
   * Monta o payload §3.2: opcionais vazios viram `null` (ausência honesta, não string vazia).
   *
   * `eventoIds` (§3.4, replace-set — AD-SQ-48) só é incluído quando há seleção **ou** quando o
   * produto já tinha vínculos (permite limpar enviando `[]`). Se não há seleção nem vínculos
   * anteriores, o campo é OMITIDO — mantém intactos os payloads exatos de 6 campos dos specs do
   * M2/M3 (anti-burla) e o back interpreta ausência como "não altera".
   */
  private montarPayload(): ProdutoRequest {
    const v = this.form.getRawValue();
    const req: ProdutoRequest = {
      nome: v.nome.trim(),
      descricao: v.descricao.trim() || null,
      unidadeMedida: v.unidadeMedida as UnidadeMedida,
      estoqueMinimo: v.estoqueMinimo!,
      preco: v.preco ?? null,
      imagemUrl: v.imagemUrl.trim() || null,
    };
    const ids = this.eventosSelecionados.value;
    if (ids.length > 0 || this.eventosOriginais.length > 0) {
      req.eventoIds = ids;
    }
    return req;
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
      this.erroGeral.set('Você não tem permissão para salvar produtos.');
      return;
    }
    this.erroGeral.set('Não foi possível salvar agora. Tente novamente.');
  }
}
