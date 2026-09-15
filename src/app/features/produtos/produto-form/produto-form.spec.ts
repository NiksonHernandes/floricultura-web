import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { ProdutoForm, TAMANHO_MAX_IMAGEM_BYTES } from './produto-form';
import { ProdutosService } from '../produtos.service';
import { Fornecedor } from '../../../core/models/fornecedor.model';
import { Evento } from '../../../core/models/evento.model';
import {
  Movimentacao,
  Produto,
  ProdutoRequest,
  UnidadeMedida,
} from '../../../core/models/produto.model';

/** Evento sintético de `<input type="file">` para os testes de seleção (CA-12) — sem DOM real. */
function eventoArquivo(arquivo: File): Event {
  return { target: { files: [arquivo], value: '' } } as unknown as Event;
}

/** Valor completo do form no client (mistura strings e números; `''` = ainda não escolhido). */
interface FormValor {
  nome: string;
  descricao: string;
  unidadeMedida: UnidadeMedida | '';
  estoqueMinimo: number | null;
  preco: number | null;
  imagemUrl: string;
}

interface Probe {
  form: {
    setValue(v: FormValor): void;
    get(name: string): { hasError(k: string): boolean; getError(k: string): string } | null;
    readonly invalid: boolean;
  };
  /** Controle STANDALONE da entrada inicial (T-M2-11/AD-SQ-35) — fora do form group. */
  entradaInicial: { setValue(v: number | null): void };
  /**
   * Fornecedor opcional da entrada inicial (T-M5.1-3/CA-5/CA-6; estado disabled T-M5.1-5/CA-13..15) —
   * standalone, fora do form group. As opções chegam por `@Input` da lista-mãe (AD-SQ-72 — form HTTP zero).
   */
  fornecedorInicial: { setValue(v: number | null): void; readonly disabled: boolean; readonly enabled: boolean };
  /** Multiselect de eventos (T-M4-6; estado disabled T-M5.1-5/CA-13..15) — standalone. */
  eventosSelecionados: { readonly disabled: boolean; readonly enabled: boolean };
  salvar(): void;
  enviando(): boolean;
  salvo: { subscribe(fn: (p: Produto) => void): void };
  /** Saída de falha parcial (T-M2-11/CA-22): produto criado, mas a ENTRADA inicial falhou. */
  entradaInicialFalhou: { subscribe(fn: () => void): void };
  /** Imagem (T-M3-5/CA-12): seleção + preview + falha parcial de upload na criação. */
  aoSelecionarArquivo(evento: Event): void;
  removerImagem(): void;
  previewUrl(): string | null;
  erroImagem(): string | null;
  produtoAtual(): Produto | null;
  imagemFalhou: { subscribe(fn: () => void): void };
  /**
   * Cropper (T-M3.1-3/§3.3, §6 ajuste estrutural SANCIONADO): a seleção abre o cropper
   * (`arquivoParaRecorte`); o recorte confirmado entra pelo `aoRecortar`; `aoCancelarRecorte`
   * descarta a fonte. NÃO é afrouxamento — é o novo passo de confirmação de recorte.
   */
  aoRecortar(recorte: File): void;
  aoCancelarRecorte(): void;
  arquivoParaRecorte(): File | null;
}

describe('ProdutoForm (T-M2-8, CA-20 — parte form)', () => {
  let serviceSpy: jasmine.SpyObj<
    Pick<
      ProdutosService,
      'criar' | 'atualizar' | 'movimentar' | 'enviarImagem' | 'removerImagem' | 'urlImagem' | 'imagemBlob'
    >
  >;

  const rosa: Produto = {
    id: 10,
    nome: 'Rosa Vermelha',
    descricao: 'Maço com 12 hastes',
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 25,
    preco: 4.5,
    imagemUrl: 'https://exemplo.local/rosa.jpg',
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-02T14:00:00Z',
    atualizadoEm: '2026-09-02T14:00:00Z',
    temImagem: false,
  };

  /** Form mínimo válido em modo criação: só o obrigatório; opcionais vazios. */
  const minimo: FormValor = {
    nome: 'Girassol',
    descricao: '',
    unidadeMedida: 'un',
    estoqueMinimo: 5,
    preco: null,
    imagemUrl: '',
  };

  /** Payload §3.2 esperado no `POST /produtos` do form mínimo — 6 campos, SEM a entrada inicial. */
  const payloadMinimo: ProdutoRequest = {
    nome: 'Girassol',
    descricao: null,
    unidadeMedida: 'un',
    estoqueMinimo: 5,
    preco: null,
    imagemUrl: null,
  };

  /** Resposta da 2ª chamada (ENTRADA inicial) — não é asserida no conteúdo, só que ocorre. */
  const movEntrada: Movimentacao = {
    id: 100,
    produtoId: 10,
    produtoNome: 'Rosa Vermelha',
    tipo: 'ENTRADA',
    quantidade: 30,
    quantidadeResultante: 30,
    motivo: 'Estoque inicial (cadastro)',
    usuarioId: 3,
    criadoEm: '2026-09-02T14:05:00Z',
  };

  function montar(): Probe {
    const fixture = TestBed.createComponent(ProdutoForm);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Probe;
  }

  function montarEditando(p: Produto): ComponentFixture<ProdutoForm> {
    const fixture = TestBed.createComponent(ProdutoForm);
    fixture.componentRef.setInput('produto', p);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<
      Pick<
        ProdutosService,
        'criar' | 'atualizar' | 'movimentar' | 'enviarImagem' | 'removerImagem' | 'urlImagem' | 'imagemBlob'
      >
    >('ProdutosService', [
      'criar',
      'atualizar',
      'movimentar',
      'enviarImagem',
      'removerImagem',
      'urlImagem',
      'imagemBlob',
    ]);
    // Defaults p/ o `ImagemProduto` embutido no form (edição): resolve a foto atual sem tocar
    // enviarImagem/removerImagem. `urlImagem`/`imagemBlob` são leitura da foto do banco (T-M3-4).
    serviceSpy.urlImagem.and.returnValue('http://localhost:8080/api/v1/produtos/10/imagem?v=1');
    serviceSpy.imagemBlob.and.returnValue(of(new Blob()));
    TestBed.configureTestingModule({
      imports: [ProdutoForm],
      // provideHttpClient(Testing) permite construir o `FornecedoresService` real injetado pelo form
      // (T-M5.1-3). A carga é sob demanda: nenhum GET dispara sem abrir o select ⇒ os testes herdados
      // seguem sem tráfego HTTP (anti-burla §12). Só os testes NOVOS do fornecedor usam o httpMock.
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProdutosService, useValue: serviceSpy },
      ],
    });
  });

  it('não chama o serviço com o form vazio (nome/unidade/estoqueMinimo obrigatórios)', () => {
    const probe = montar();
    probe.salvar();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
    expect(serviceSpy.atualizar).not.toHaveBeenCalled();
  });

  it('sem unidadeMedida o form é inválido e não submete (select required — AD-SQ-31)', () => {
    const probe = montar();
    probe.form.setValue({ ...minimo, unidadeMedida: '' });
    probe.salvar();
    expect(probe.form.get('unidadeMedida')?.hasError('required')).toBeTrue();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
  });

  it('cria: POST com opcionais vazios viram null e emite `salvo` (preço opcional — AD-SQ-28/CA-9)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    const probe = montar();
    let emitido: Produto | undefined;
    probe.salvo.subscribe((p) => (emitido = p));

    probe.form.setValue(minimo);
    probe.salvar();

    const esperado: ProdutoRequest = {
      nome: 'Girassol',
      descricao: null,
      unidadeMedida: 'un',
      estoqueMinimo: 5,
      preco: null,
      imagemUrl: null,
    };
    expect(serviceSpy.criar).toHaveBeenCalledWith(esperado);
    expect(serviceSpy.atualizar).not.toHaveBeenCalled();
    expect(emitido).toEqual(rosa);
    expect(probe.enviando()).toBeFalse();
  });

  it('cria: preenche todos os campos e envia o payload completo (com preço e imagem)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    const probe = montar();

    probe.form.setValue({
      nome: '  Rosa Vermelha  ',
      descricao: '  Maço com 12 hastes  ',
      unidadeMedida: 'm3',
      estoqueMinimo: 10,
      preco: 4.5,
      imagemUrl: '  https://exemplo.local/rosa.jpg  ',
    });
    probe.salvar();

    expect(serviceSpy.criar).toHaveBeenCalledWith({
      nome: 'Rosa Vermelha',
      descricao: 'Maço com 12 hastes',
      unidadeMedida: 'm3',
      estoqueMinimo: 10,
      preco: 4.5,
      imagemUrl: 'https://exemplo.local/rosa.jpg',
    });
  });

  it('edição: pré-preenche do produto e faz PUT com o id (sem estoqueAtual — AD-SQ-30)', () => {
    serviceSpy.atualizar.and.returnValue(of({ ...rosa, nome: 'Rosa Branca' }));
    const fixture = montarEditando(rosa);
    const probe = fixture.componentInstance as unknown as Probe;

    // O form nasceu preenchido a partir do produto; muda só o nome e salva.
    probe.form.setValue({
      nome: 'Rosa Branca',
      descricao: rosa.descricao ?? '',
      unidadeMedida: rosa.unidadeMedida,
      estoqueMinimo: rosa.estoqueMinimo,
      preco: rosa.preco,
      imagemUrl: rosa.imagemUrl ?? '',
    });
    probe.salvar();

    expect(serviceSpy.atualizar).toHaveBeenCalledWith(10, {
      nome: 'Rosa Branca',
      descricao: 'Maço com 12 hastes',
      unidadeMedida: 'un',
      estoqueMinimo: 10,
      preco: 4.5,
      imagemUrl: 'https://exemplo.local/rosa.jpg',
    });
    expect(serviceSpy.criar).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_ERROR aplica os details por campo (trata 400 por campo — CA-20)', () => {
    serviceSpy.criar.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'Bad Request',
            error: {
              success: false,
              data: null,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Dados inválidos.',
                details: [{ field: 'nome', message: 'nome já usado' }],
              },
              timestamp: '',
              path: '',
            },
          }),
      ),
    );
    const probe = montar();
    probe.form.setValue(minimo);
    probe.salvar();

    const nome = probe.form.get('nome');
    expect(nome?.hasError('servidor')).toBeTrue();
    expect(nome?.getError('servidor')).toBe('nome já usado');
    expect(probe.enviando()).toBeFalse();
  });

  // --- Entrada inicial de estoque opcional no cadastro (T-M2-11, CA-22, AD-SQ-35) ---

  it('cria com entrada inicial > 0: após criar, chama movimentar (ENTRADA + motivo) e emite salvo (CA-22)', () => {
    serviceSpy.criar.and.returnValue(of(rosa)); // rosa.id === 10
    serviceSpy.movimentar.and.returnValue(of(movEntrada));
    const probe = montar();
    let emitido: Produto | undefined;
    probe.salvo.subscribe((p) => (emitido = p));

    probe.form.setValue(minimo);
    probe.entradaInicial.setValue(30);
    probe.salvar();

    // 1ª chamada: POST /produtos com EXATAMENTE os 6 campos — a entrada NÃO vaza no ProdutoRequest.
    expect(serviceSpy.criar).toHaveBeenCalledWith(payloadMinimo);
    // 2ª chamada: POST /produtos/{id}/movimentacoes com ENTRADA + motivo default.
    expect(serviceSpy.movimentar).toHaveBeenCalledWith(10, {
      tipo: 'ENTRADA',
      quantidade: 30,
      motivo: 'Estoque inicial (cadastro)',
    });
    expect(emitido).toEqual(rosa);
    expect(serviceSpy.atualizar).not.toHaveBeenCalled();
    expect(probe.enviando()).toBeFalse();
  });

  it('cria com entrada inicial vazia/0: NÃO chama movimentar (produto fica com estoque 0 — CA-22)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    const probe = montar();
    let emitido: Produto | undefined;
    probe.salvo.subscribe((p) => (emitido = p));

    probe.form.setValue(minimo);
    probe.entradaInicial.setValue(0);
    probe.salvar();

    expect(serviceSpy.criar).toHaveBeenCalledWith(payloadMinimo);
    expect(serviceSpy.movimentar).not.toHaveBeenCalled();
    expect(emitido).toEqual(rosa);
    expect(probe.enviando()).toBeFalse();
  });

  it('entrada inicial falha: salvo ainda emite, entradaInicialFalhou dispara e criar NÃO é re-chamado (CA-22)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    serviceSpy.movimentar.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    const probe = montar();
    let emitido: Produto | undefined;
    let falhou = false;
    probe.salvo.subscribe((p) => (emitido = p));
    probe.entradaInicialFalhou.subscribe(() => (falhou = true));

    probe.form.setValue(minimo);
    probe.entradaInicial.setValue(15);
    probe.salvar();

    // Produto considerado criado: salvo emite mesmo com a ENTRADA falhando.
    expect(emitido).toEqual(rosa);
    expect(falhou).toBeTrue();
    // NÃO recria o produto (evita duplicata) — criar chamado uma única vez.
    expect(serviceSpy.criar).toHaveBeenCalledTimes(1);
    expect(probe.enviando()).toBeFalse();
  });

  // --- Upload de imagem no form (T-M3-5, CA-12) ---

  const jpg = new File(['\xff\xd8\xff'], 'rosa.jpg', { type: 'image/jpeg' });
  /**
   * Recorte que o `<app-recorte-foto>` emitiria após Confirmar — File JPEG DISTINTO da fonte
   * (§6: o objeto enviado passa a ser o RECORTE, não a fonte). Dirigimos o form via `aoRecortar`.
   */
  const recorte = new File(['\xff\xd8\xff\xe0'], 'rosa-recortada.jpg', { type: 'image/jpeg' });

  it('criação: seleção ABRE o cropper (não stagea a fonte); ao confirmar gera preview LOCAL e NÃO envia antes de salvar (CA-12/CA-8)', () => {
    const probe = montar();
    // Passo 1: selecionar abre o cropper com a fonte — sem preview/stage ainda (§3.3).
    probe.aoSelecionarArquivo(eventoArquivo(jpg));
    expect(probe.arquivoParaRecorte()).toBe(jpg);
    expect(probe.previewUrl()).toBeNull();
    // Passo 2: confirmar o recorte → preview local do RECORTE; ainda sem envio na criação.
    probe.aoRecortar(recorte);
    expect(probe.arquivoParaRecorte()).toBeNull(); // cropper fechou
    expect(probe.previewUrl()).toContain('blob:'); // object URL do recorte (createObjectURL)
    expect(probe.erroImagem()).toBeNull();
    // ÂNCORA preservada: enviarImagem NÃO é chamado antes de salvar (criação).
    expect(serviceSpy.enviarImagem).not.toHaveBeenCalled();
  });

  it('criação: tipo inválido é barrado na SELEÇÃO — erro, cropper não abre, sem preview, sem envio (CA-12)', () => {
    const probe = montar();
    probe.aoSelecionarArquivo(eventoArquivo(new File(['x'], 'nota.txt', { type: 'text/plain' })));
    expect(probe.erroImagem()).toContain('JPG'); // validação de tipo ocorre antes do cropper
    expect(probe.arquivoParaRecorte()).toBeNull();
    expect(probe.previewUrl()).toBeNull();
    expect(serviceSpy.enviarImagem).not.toHaveBeenCalled();
  });

  it('criação: RECORTE acima de 2 MB é barrado no cliente (guarda no recorte final) — erro, sem envio (CA-5/CA-8)', () => {
    const probe = montar();
    const grande = new File(['x'], 'grande.jpg', { type: 'image/jpeg' });
    Object.defineProperty(grande, 'size', { value: TAMANHO_MAX_IMAGEM_BYTES + 1 });
    probe.aoSelecionarArquivo(eventoArquivo(jpg)); // abre o cropper
    probe.aoRecortar(grande); // recorte final estoura 2 MB
    expect(probe.erroImagem()).toContain('2 MB');
    expect(probe.previewUrl()).toBeNull(); // recorte inválido não vira preview
    // ÂNCORA preservada: arquivo grande NÃO é enviado.
    expect(serviceSpy.enviarImagem).not.toHaveBeenCalled();
  });

  it('criação com imagem: após criar, envia a imagem e emite o produto ATUALIZADO (CA-12)', () => {
    const atualizado: Produto = { ...rosa, temImagem: true };
    serviceSpy.criar.and.returnValue(of(rosa)); // rosa.id === 10
    serviceSpy.enviarImagem.and.returnValue(of(atualizado));
    const probe = montar();
    let emitido: Produto | undefined;
    probe.salvo.subscribe((p) => (emitido = p));

    probe.form.setValue(minimo);
    probe.aoSelecionarArquivo(eventoArquivo(jpg));
    probe.aoRecortar(recorte); // confirma o enquadramento
    probe.salvar();

    // ÂNCORA: a imagem NÃO vaza no ProdutoRequest — payload de 6 campos intacto.
    expect(serviceSpy.criar).toHaveBeenCalledWith(payloadMinimo);
    // O objeto enviado agora é o RECORTE (File image/jpeg), não a fonte crua.
    expect(serviceSpy.enviarImagem).toHaveBeenCalledWith(10, jasmine.any(File));
    const enviado = serviceSpy.enviarImagem.calls.mostRecent().args[1] as File;
    expect(enviado.type).toBe('image/jpeg');
    expect(enviado).toBe(recorte);
    // ÂNCORA: ordem criar → enviarImagem, e criar chamado uma única vez.
    expect(serviceSpy.criar).toHaveBeenCalledBefore(serviceSpy.enviarImagem);
    expect(serviceSpy.criar).toHaveBeenCalledTimes(1);
    expect(emitido).toEqual(atualizado);
    expect(probe.enviando()).toBeFalse();
  });

  it('criação com imagem: upload falho ⇒ salvo emite (produto existe), imagemFalhou dispara, sem recriar (CA-12)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    serviceSpy.enviarImagem.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 400, statusText: 'Bad Request' })),
    );
    const probe = montar();
    let emitido: Produto | undefined;
    let falhou = false;
    probe.salvo.subscribe((p) => (emitido = p));
    probe.imagemFalhou.subscribe(() => (falhou = true));

    probe.form.setValue(minimo);
    probe.aoSelecionarArquivo(eventoArquivo(jpg));
    probe.aoRecortar(recorte); // confirma o enquadramento
    probe.salvar();

    // ÂNCORA (AD-SQ-35): produto considerado criado (sem imagem); salvo emite mesmo com o upload falho.
    expect(emitido).toEqual(rosa);
    expect(falhou).toBeTrue();
    expect(serviceSpy.criar).toHaveBeenCalledTimes(1); // não recria/deleta
    // E o objeto que TENTOU subir era o recorte (File), não a fonte.
    expect(serviceSpy.enviarImagem).toHaveBeenCalledWith(10, jasmine.any(File));
    expect(probe.enviando()).toBeFalse();
  });

  it('edição: selecionar + confirmar recorte envia DIRETO (enviarImagem) e reflete temImagem na foto atual (CA-7/CA-12)', () => {
    const atualizado: Produto = { ...rosa, temImagem: true };
    serviceSpy.enviarImagem.and.returnValue(of(atualizado));
    const fixture = montarEditando(rosa); // rosa.temImagem === false
    const probe = fixture.componentInstance as unknown as Probe;

    probe.aoSelecionarArquivo(eventoArquivo(jpg)); // abre o cropper
    probe.aoRecortar(recorte); // confirma → envia direto

    expect(serviceSpy.enviarImagem).toHaveBeenCalledWith(10, jasmine.any(File));
    const enviado = serviceSpy.enviarImagem.calls.mostRecent().args[1] as File;
    expect(enviado.type).toBe('image/jpeg');
    expect(serviceSpy.criar).not.toHaveBeenCalled();
    expect(probe.produtoAtual()?.temImagem).toBeTrue();
    expect(probe.previewUrl()).toBeNull(); // passa a exibir a foto do banco
  });

  it('edição: "Remover foto" chama removerImagem e o produto passa a temImagem false (CA-12)', () => {
    serviceSpy.removerImagem.and.returnValue(of(void 0));
    const fixture = montarEditando({ ...rosa, temImagem: true });
    const probe = fixture.componentInstance as unknown as Probe;

    probe.removerImagem();

    expect(serviceSpy.removerImagem).toHaveBeenCalledWith(10);
    expect(probe.produtoAtual()?.temImagem).toBeFalse();
  });

  it('criação: CANCELAR o cropper não stagea nem envia — estado preservado (CA-8)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    const probe = montar();

    probe.form.setValue(minimo);
    probe.aoSelecionarArquivo(eventoArquivo(jpg)); // abre o cropper
    expect(probe.arquivoParaRecorte()).toBe(jpg);
    probe.aoCancelarRecorte(); // desiste
    expect(probe.arquivoParaRecorte()).toBeNull();
    expect(probe.previewUrl()).toBeNull(); // nada stageado/preview

    probe.salvar();
    // Cria normalmente (payload de 6 campos), mas SEM imagem — nada foi recortado/enviado.
    expect(serviceSpy.criar).toHaveBeenCalledWith(payloadMinimo);
    expect(serviceSpy.enviarImagem).not.toHaveBeenCalled();
  });

  // --- Fornecedor na entrada inicial: payload (T-M5.1-3) + selects vazios desabilitados (T-M5.1-5) ---

  /** Fornecedor FICTÍCIO (LGPD — SPEC §9): "Sítio das Flores". */
  const sitio: Fornecedor = {
    id: 7,
    nome: 'Sítio das Flores',
    telefone: null,
    email: null,
    observacoes: null,
    produtoIds: null,
    criadoEm: '2026-09-05T14:00:00Z',
    atualizadoEm: '2026-09-05T14:00:00Z',
  };

  /** Evento FICTÍCIO para os testes de habilitação do multiselect. */
  const natal: Evento = {
    id: 1,
    nome: 'Natal',
    tipo: 'COMEMORATIVA',
    dataInicio: '2026-12-25',
    dataFim: null,
    dataUnica: true,
    repeteTodoAno: true,
    descricao: null,
    criadoEm: '2026-09-05T14:00:00Z',
    atualizadoEm: '2026-09-05T14:00:00Z',
  };

  /**
   * Monta o form dirigindo os `@Input` de vínculo (HISTÓRIA #5/AD-SQ-72) — as opções chegam da lista-mãe,
   * não de um GET do form. `detectChanges()` roda o `estadoVinculosEffect` que decide o disabled.
   */
  function montarComInputs(inputs: {
    produto?: Produto | null;
    eventos?: Evento[];
    eventosProntos?: boolean;
    fornecedores?: Fornecedor[];
    fornecedoresProntos?: boolean;
  }): ComponentFixture<ProdutoForm> {
    const fixture = TestBed.createComponent(ProdutoForm);
    if (inputs.produto !== undefined) fixture.componentRef.setInput('produto', inputs.produto);
    if (inputs.eventos) fixture.componentRef.setInput('eventos', inputs.eventos);
    if (inputs.eventosProntos !== undefined)
      fixture.componentRef.setInput('eventosProntos', inputs.eventosProntos);
    if (inputs.fornecedores) fixture.componentRef.setInput('fornecedores', inputs.fornecedores);
    if (inputs.fornecedoresProntos !== undefined)
      fixture.componentRef.setInput('fornecedoresProntos', inputs.fornecedoresProntos);
    fixture.detectChanges();
    // 2ª passada: reflete no DOM o disable aplicado pelo `estadoVinculosEffect` (a classe/aria reagem).
    fixture.detectChanges();
    return fixture;
  }

  it('CA-16: form tem superfície HTTP ZERO — montar/interagir não dispara NENHUM GET (httpMock.verify limpo)', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const fixture = montarComInputs({
      eventos: [natal],
      eventosProntos: true,
      fornecedores: [sitio],
      fornecedoresProntos: true,
    });
    const probe = fixture.componentInstance as unknown as Probe;
    // Preencher o form e selecionar um fornecedor não fala com o back (as opções vêm por @Input).
    probe.form.setValue(minimo);
    probe.fornecedorInicial.setValue(7);
    httpMock.verify(); // nenhum GET de fornecedores/eventos saiu do form
  });

  it('CA-13/CA-17: fornecedores=[] + prontos ⇒ select de fornecedor DESABILITADO + hint "nada a vincular"', () => {
    const fixture = montarComInputs({ fornecedores: [], fornecedoresProntos: true });
    const probe = fixture.componentInstance as unknown as Probe;
    expect(probe.fornecedorInicial.disabled).toBeTrue();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Nenhum fornecedor cadastrado para vincular.');
    // Cinza escuro por classe de estado (SCSS token — sem hex novo).
    expect(el.querySelector('.ficha__campo--vazio')).toBeTruthy();
  });

  it('CA-14: fornecedores=[sitio] ⇒ select de fornecedor HABILITADO (opções selecionáveis)', () => {
    const fixture = montarComInputs({ fornecedores: [sitio], fornecedoresProntos: true });
    const probe = fixture.componentInstance as unknown as Probe;
    expect(probe.fornecedorInicial.enabled).toBeTrue();
    expect(probe.fornecedorInicial.disabled).toBeFalse();
  });

  it('CA-13/CA-17: eventos=[] + prontos ⇒ multiselect de eventos DESABILITADO + hint "nada a vincular"', () => {
    const fixture = montarComInputs({ eventos: [], eventosProntos: true });
    const probe = fixture.componentInstance as unknown as Probe;
    expect(probe.eventosSelecionados.disabled).toBeTrue();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Nenhum evento cadastrado para vincular.');
  });

  it('CA-14: eventos=[natal] ⇒ multiselect de eventos HABILITADO', () => {
    const fixture = montarComInputs({ eventos: [natal], eventosProntos: true });
    const probe = fixture.componentInstance as unknown as Probe;
    expect(probe.eventosSelecionados.enabled).toBeTrue();
  });

  it('CA-15 (anti-flash): carregando (!prontos) ⇒ selects NÃO desabilitam e o hint "nada a vincular" NÃO aparece', () => {
    const fixture = montarComInputs({
      eventos: [],
      eventosProntos: false,
      fornecedores: [],
      fornecedoresProntos: false,
    });
    const probe = fixture.componentInstance as unknown as Probe;
    expect(probe.eventosSelecionados.disabled).toBeFalse();
    expect(probe.fornecedorInicial.disabled).toBeFalse();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Nenhum evento cadastrado para vincular.');
    expect(el.textContent).not.toContain('Nenhum fornecedor cadastrado para vincular.');
  });

  it('CA-15 (edição com vínculos): eventoIds=[...] + eventos=[] + prontos ⇒ multiselect NÃO desabilita (seleção > 0)', () => {
    const fixture = montarComInputs({
      produto: { ...rosa, eventoIds: [1, 2] },
      eventos: [],
      eventosProntos: true,
    });
    const probe = fixture.componentInstance as unknown as Probe;
    expect(probe.eventosSelecionados.disabled).toBeFalse();
  });

  it('CA-5: entrada > 0 + fornecedor selecionado ⇒ movimentar inclui fornecedorId', () => {
    serviceSpy.criar.and.returnValue(of(rosa)); // rosa.id === 10
    serviceSpy.movimentar.and.returnValue(of(movEntrada));
    const probe = montar();

    probe.form.setValue(minimo);
    probe.entradaInicial.setValue(30);
    probe.fornecedorInicial.setValue(7);
    probe.salvar();

    // POST /produtos com 6 campos intacto (fornecedor NÃO vaza no ProdutoRequest).
    expect(serviceSpy.criar).toHaveBeenCalledWith(payloadMinimo);
    // ENTRADA leva a contraparte.
    expect(serviceSpy.movimentar).toHaveBeenCalledWith(10, {
      tipo: 'ENTRADA',
      quantidade: 30,
      motivo: 'Estoque inicial (cadastro)',
      fornecedorId: 7,
    });
  });

  it('CA-5: entrada > 0 SEM fornecedor ⇒ payload da ENTRADA idêntico ao M5 (sem fornecedorId)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    serviceSpy.movimentar.and.returnValue(of(movEntrada));
    const probe = montar();

    probe.form.setValue(minimo);
    probe.entradaInicial.setValue(30);
    // fornecedorInicial permanece null (backward compat).
    probe.salvar();

    expect(serviceSpy.movimentar).toHaveBeenCalledWith(10, {
      tipo: 'ENTRADA',
      quantidade: 30,
      motivo: 'Estoque inicial (cadastro)',
    });
  });

  it('CA-6: entrada 0 ignora o fornecedor selecionado (nenhuma movimentação — AD-SQ-35 intacto)', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    const probe = montar();

    probe.form.setValue(minimo);
    probe.entradaInicial.setValue(0);
    probe.fornecedorInicial.setValue(7);
    probe.salvar();

    expect(serviceSpy.criar).toHaveBeenCalledWith(payloadMinimo);
    expect(serviceSpy.movimentar).not.toHaveBeenCalled();
  });

  it('CA-6: fornecedorId inexistente (400 field=fornecedorId) ⇒ falha parcial (salvo + entradaInicialFalhou), sem recriar', () => {
    serviceSpy.criar.and.returnValue(of(rosa));
    serviceSpy.movimentar.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'Bad Request',
            error: {
              success: false,
              data: null,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Fornecedor inexistente.',
                details: [{ field: 'fornecedorId', message: 'Fornecedor não encontrado.' }],
              },
              timestamp: '',
              path: '',
            },
          }),
      ),
    );
    const probe = montar();
    let emitido: Produto | undefined;
    let falhou = false;
    probe.salvo.subscribe((p) => (emitido = p));
    probe.entradaInicialFalhou.subscribe(() => (falhou = true));

    probe.form.setValue(minimo);
    probe.entradaInicial.setValue(30);
    probe.fornecedorInicial.setValue(999);
    probe.salvar();

    // Produto já existe (deriva AD-SQ-35): salvo emite, sinaliza a falha, criar NÃO é re-chamado.
    expect(emitido).toEqual(rosa);
    expect(falhou).toBeTrue();
    expect(serviceSpy.criar).toHaveBeenCalledTimes(1);
    expect(serviceSpy.movimentar).toHaveBeenCalledWith(
      10,
      jasmine.objectContaining({ fornecedorId: 999 }),
    );
  });
});
