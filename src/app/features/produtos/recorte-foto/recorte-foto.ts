import { Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  ImageCropperComponent,
  ImageCroppedEvent,
  ImageTransform,
  OutputFormat,
} from 'ngx-image-cropper';

/**
 * Aspecto da moldura = faixa da foto do card (`.vaso__planta` 16/10). O recorte enviado é
 * EXATAMENTE o que o card mostrará (SPEC-M3.1 §3.5/§4, AD-SQ-41 / PA#1). = 1.6.
 */
export const ASPECTO_RECORTE = 16 / 10;

/** Saída JPEG q~0.85 (PA#2): foto opaca dentro da whitelist do back (JPG/PNG/WEBP). */
export const FORMATO_SAIDA: OutputFormat = 'jpeg';
export const QUALIDADE_SAIDA = 85;

/** Cap do lado maior do recorte (PA#3); com `onlyScaleDown` nunca faz upscale. */
export const LARGURA_MAX_RECORTE = 1920;

/** Guarda de 5 MB no recorte FINAL, antes de emitir (espelho do back — §4/CA-5). */
export const TAMANHO_MAX_RECORTE_BYTES = 5 * 1024 * 1024;

/** Limites do zoom (só pan + zoom; SEM rotação/flip — AD-SQ-41). */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
export const ZOOM_PASSO = 0.1;

/**
 * Recorte da foto — "enquadrar a muda antes de plantar" (SPEC-M3.1 §3.2, T-M3.1-2, CA-3/4/5/8/9).
 *
 * Embrulha o `<image-cropper>` (ngx-image-cropper@9) com a UX **moldura fixa 16/10 + imagem que
 * se move (pan) e amplia (zoom)**, SEM rotação/flip. A orientação de fotos de celular vem do
 * **EXIF** (default da lib, não desabilitado — CA-4). Saída **JPEG q~0.85**, lado maior ≤ ~1920px.
 *
 * Contrato de I/O (front-only, zero delta de API — o envelope blob→File mantém a assinatura de
 * `enviarImagem` intacta na T-M3.1-3, PA#4):
 *  - entrada `arquivo` = a foto-fonte escolhida;
 *  - `recortado` = o **File JPEG** do recorte final (após validar `size ≤ 5 MB`);
 *  - `cancelado` = o operador desistiu (o form descarta a fonte, nada muda).
 *
 * Design distintivo (CA-9): usa os tokens do ateliê (`_atelie-tokens.scss`); a dália segue
 * reservada à ação primária "Confirmar recorte". Mobile-first, alvos de toque ≥ 44px.
 */
@Component({
  selector: 'app-recorte-foto',
  imports: [ImageCropperComponent, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './recorte-foto.html',
  styleUrl: './recorte-foto.scss',
})
export class RecorteFoto {
  /** Foto-fonte a enquadrar (o `<image-cropper>` a carrega direto via `[imageFile]`). */
  readonly arquivo = input.required<File>();

  /** Recorte confirmado: File JPEG (blob→File envelopado, ≤ 5 MB). */
  readonly recortado = output<File>();
  /** O operador cancelou o enquadramento. */
  readonly cancelado = output<void>();

  // --- Config canônica (§3.2) — exposta ao template E às asserções de teste (CA-3/CA-5). ---
  protected readonly aspectRatio = ASPECTO_RECORTE;
  protected readonly formatoSaida = FORMATO_SAIDA;
  protected readonly qualidade = QUALIDADE_SAIDA;
  protected readonly larguraMax = LARGURA_MAX_RECORTE;
  protected readonly ZOOM_MIN = ZOOM_MIN;
  protected readonly ZOOM_MAX = ZOOM_MAX;
  protected readonly ZOOM_PASSO = ZOOM_PASSO;

  protected readonly carregando = signal(true);
  protected readonly falhou = signal(false);
  protected readonly erro = signal<string | null>(null);

  /**
   * Transformação aplicada à imagem. Só `scale` (zoom) e `translateH/V` (pan) mudam; `rotate`
   * fica 0 e `flipH/V` false — SEM rotação/flip (AD-SQ-41). O pan por arraste é da própria lib
   * (`allowMoveImage`); sincronizamos via `(transformChange)` para o zoom não resetar a posição.
   */
  protected readonly transform = signal<ImageTransform>({
    scale: ZOOM_MIN,
    rotate: 0,
    flipH: false,
    flipV: false,
    translateH: 0,
    translateV: 0,
  });

  protected readonly escala = computed(() => this.transform().scale ?? ZOOM_MIN);
  protected readonly prontoParaZoom = computed(() => !this.carregando() && !this.falhou());
  protected readonly noZoomMinimo = computed(() => this.escala() <= ZOOM_MIN);
  protected readonly noZoomMaximo = computed(() => this.escala() >= ZOOM_MAX);

  /** Último evento de recorte da lib (v9 traz `blob`); consumido no Confirmar. */
  private ultimoEvento: ImageCroppedEvent | null = null;

  /** A lib emitiu um recorte (auto-crop): guardamos o evento com o blob para o Confirmar. */
  protected aoRecortar(evento: ImageCroppedEvent): void {
    this.ultimoEvento = evento;
  }

  /** Imagem carregada / cropper pronto → some o estado "preparando". */
  protected aoCarregar(): void {
    this.carregando.set(false);
  }

  /** Falha ao abrir a imagem (`loadImageFailed`) → estado de erro visível, sem emitir nada. */
  protected aoFalharImagem(): void {
    this.carregando.set(false);
    this.falhou.set(true);
    this.erro.set('Não foi possível abrir esta imagem. Escolha outra.');
  }

  /** Pan (arraste) e pinça mexem a transform interna da lib — mantemos em sincronia. */
  protected aoTransformar(t: ImageTransform): void {
    this.transform.set({ ...t });
  }

  protected aumentarZoom(): void {
    this.aplicarEscala(this.escala() + ZOOM_PASSO);
  }

  protected diminuirZoom(): void {
    this.aplicarEscala(this.escala() - ZOOM_PASSO);
  }

  protected aoAjustarZoom(evento: Event): void {
    this.aplicarEscala(Number((evento.target as HTMLInputElement).value));
  }

  private aplicarEscala(valor: number): void {
    const s = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(valor * 100) / 100));
    this.transform.update((t) => ({ ...t, scale: s }));
  }

  /**
   * Confirmar: envelopa o blob do último recorte em `File` (nome derivado, `image/jpeg`), valida
   * `size ≤ 5 MB` (senão erro local, NÃO emite) e emite `recortado` (CA-5/CA-8).
   */
  protected confirmar(): void {
    const blob = this.ultimoEvento?.blob;
    if (!blob) {
      this.erro.set('Não foi possível preparar o recorte. Ajuste o enquadramento e tente de novo.');
      return;
    }
    // Guarda de 5 MB no payload do recorte (== tamanho do File para bytes reais). Rede de
    // segurança antes do round-trip: o recorte capado a 1920px/JPEG q85 fica bem abaixo disso.
    if (blob.size > TAMANHO_MAX_RECORTE_BYTES) {
      this.erro.set('O recorte ficou acima de 5 MB. Reduza o zoom ou escolha uma imagem menor.');
      return;
    }
    this.erro.set(null);
    this.recortado.emit(this.envelopar(blob));
  }

  protected cancelar(): void {
    this.cancelado.emit();
  }

  /** blob → File JPEG (PA#4): nome derivado do original, extensão `.jpg`, ≤ 255 chars. */
  private envelopar(blob: Blob): File {
    const original = this.arquivo().name || 'foto';
    const base = original.replace(/\.[^./\\]+$/, '') || 'foto';
    const nome = `${base.slice(0, 250)}.jpg`;
    return new File([blob], nome, { type: 'image/jpeg' });
  }
}
