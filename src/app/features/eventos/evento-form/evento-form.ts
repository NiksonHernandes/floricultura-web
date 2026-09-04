import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';

import { EventosService } from '../eventos.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { Evento, EventoRequest, TipoEvento } from '../../../core/models/evento.model';

/** Opções do select de tipo (§4.1): valor = código ASCII persistido; rótulo pt-BR do front. */
export const OPCOES_TIPO_EVENTO: ReadonlyArray<{ valor: TipoEvento; rotulo: string }> = [
  { valor: 'COMEMORATIVA', rotulo: 'Comemorativa' },
  { valor: 'FEIRA', rotulo: 'Feira' },
  { valor: 'BENEFICENTE', rotulo: 'Beneficente' },
  { valor: 'ENCOMENDA_CLIENTE', rotulo: 'Encomenda de cliente' },
];

/**
 * `Date` do datepicker → string do contrato `yyyy-MM-dd` (§3.2). Usa **componentes locais**
 * (`getFullYear/getMonth/getDate`), NUNCA `toISOString` — em fuso negativo (UTC-3) o UTC pularia
 * um dia (AD-SQ-40).
 */
export function dataParaIso(d: Date): string {
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** `yyyy-MM-dd` (edição) → `Date` LOCAL (meia-noite local): `new Date(ano, mês-1, dia)`. */
export function isoParaData(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

/**
 * Form de criar/editar evento — "a folha do calendário" (SPEC-M4 §7 T-M4-5, CA-1/2/3/6/7).
 *
 * Conteúdo de um overlay modal hospedado pela lista (`Eventos`), no mesmo padrão do `produto-form`.
 * Reativo, espelha a validação do §3.2 (a forte é do back): `nome` (req, ≤150), `tipo` (select do
 * enum, req — §4.1), `dataInicio` (req). Um toggle **Data única × Período** (AD-SQ-43) revela o
 * `dataFim` só no período; quando período, `dataFim` é obrigatório e **≥ `dataInicio`** (senão erro
 * local + o back devolve `400 field="dataFim"`). `repeteTodoAno` é um slide-toggle; `descricao`
 * opcional. Sem `evento` = criar (`POST`); com `evento` = editar (`PUT`).
 *
 * Só ADMIN escreve (FC-07) — a lista só abre este form p/ ADMIN. Ao sucesso emite `salvo` (a lista
 * recarrega). O hard delete (FC-08) é da lista (reusa `confirmar-exclusao`).
 */
@Component({
  selector: 'app-evento-form',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
  ],
  templateUrl: './evento-form.html',
  styleUrl: './evento-form.scss',
})
export class EventoForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(EventosService);

  /** Evento em edição; `null`/ausente = modo criação. */
  readonly evento = input<Evento | null>(null);

  /** Emite o evento salvo (criado/editado) para a lista-mãe recarregar. */
  readonly salvo = output<Evento>();
  /** Emite quando o operador cancela/fecha sem salvar. */
  readonly cancelado = output<void>();

  protected readonly enviando = signal(false);
  protected readonly erroGeral = signal<string | null>(null);
  protected readonly opcoesTipo = OPCOES_TIPO_EVENTO;

  protected readonly editando = computed(() => this.evento() !== null);

  /**
   * Validação espelha o §3.2; `dataFim` só é exigido/validado quando o toggle `periodo` está ligado.
   * As datas agora são `Date` (do `MatDatepicker`); a conversão p/ `yyyy-MM-dd` é no `montarPayload`.
   */
  protected readonly form = this.fb.group({
    nome: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(150)]),
    tipo: this.fb.nonNullable.control<TipoEvento | ''>('', [Validators.required]),
    dataInicio: this.fb.control<Date | null>(null, [Validators.required]),
    dataFim: this.fb.control<Date | null>(null),
    repeteTodoAno: this.fb.nonNullable.control(false),
    descricao: this.fb.nonNullable.control('', [Validators.maxLength(2000)]),
    /** Toggle Data única × Período (AD-SQ-43): não vai ao payload; controla a presença de `dataFim`. */
    periodo: this.fb.nonNullable.control(false),
  });

  ngOnInit(): void {
    const e = this.evento();
    if (e) {
      this.form.setValue({
        nome: e.nome,
        tipo: e.tipo,
        // Carrega `yyyy-MM-dd` → `Date` local (sem -1/+1 dia); o datepicker reexibe em `dd/MM/yyyy`.
        dataInicio: isoParaData(e.dataInicio),
        dataFim: e.dataFim ? isoParaData(e.dataFim) : null,
        repeteTodoAno: e.repeteTodoAno,
        descricao: e.descricao ?? '',
        periodo: !e.dataUnica,
      });
    }
  }

  protected salvar(): void {
    if (this.enviando()) {
      return;
    }
    this.aplicarValidacaoPeriodo();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.erroGeral.set(null);
    const req = this.montarPayload();
    const alvo = this.evento();

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
   * Regra cruzada §3.2 (só quando período): `dataFim` obrigatório e **≥ `dataInicio`**. Compara os
   * `Date` por `getTime()`. Data única (toggle off) limpa qualquer erro de `dataFim`. Espelha a
   * validação do back (fonte de verdade — 400 `field="dataFim"`).
   */
  private aplicarValidacaoPeriodo(): void {
    const c = this.form.controls;
    if (!c.periodo.value) {
      c.dataFim.setErrors(null);
      return;
    }
    const inicio = c.dataInicio.value;
    const fim = c.dataFim.value;
    if (!fim) {
      c.dataFim.setErrors({ required: true });
    } else if (inicio && fim.getTime() < inicio.getTime()) {
      c.dataFim.setErrors({ periodoInvalido: true });
    } else {
      c.dataFim.setErrors(null);
    }
  }

  /**
   * Monta o payload §3.2: `Date` → `yyyy-MM-dd` por componentes locais (sem fuso, AD-SQ-40); data
   * única ⇒ `dataFim=null`; opcionais vazios viram `null`. `dataInicio` é garantido pela validação
   * `required` (o `salvar` só chega aqui com o form válido).
   */
  private montarPayload(): EventoRequest {
    const v = this.form.getRawValue();
    return {
      nome: v.nome.trim(),
      tipo: v.tipo as TipoEvento,
      dataInicio: dataParaIso(v.dataInicio!),
      dataFim: v.periodo && v.dataFim ? dataParaIso(v.dataFim) : null,
      repeteTodoAno: v.repeteTodoAno,
      descricao: v.descricao.trim() || null,
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
      this.erroGeral.set('Você não tem permissão para salvar eventos.');
      return;
    }
    this.erroGeral.set('Não foi possível salvar agora. Tente novamente.');
  }
}
