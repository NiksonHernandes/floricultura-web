import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ProdutosService } from './produtos.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { Produto } from '../../core/models/produto.model';

/**
 * Fatia de imagem no banco do `ProdutosService` (SPEC-M3 §3.6, T-M3-4, CA-11/CA-12).
 * Arquivo NOVO (o `produtos.service.spec.ts` do M2 só ganhou `temImagem` na fixture — §6).
 */
describe('ProdutosService — imagem (T-M3-4)', () => {
  let service: ProdutosService;
  let httpMock: HttpTestingController;

  const BASE = 'http://localhost:8080/api/v1/produtos';

  const rosa: Produto = {
    id: 10,
    nome: 'Rosa Vermelha',
    descricao: 'Maço com 12 hastes',
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 25,
    preco: 4.5,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-02T14:00:00Z',
    atualizadoEm: '2026-09-02T14:00:00Z',
    temImagem: true,
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProdutosService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('enviarImagem() faz POST /{id}/imagem com FormData na parte "arquivo" e desembrulha o Produto', () => {
    const arquivo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'rosa.jpg', {
      type: 'image/jpeg',
    });

    let recebido: Produto | undefined;
    service.enviarImagem(10, arquivo).subscribe((p) => (recebido = p));

    const req = httpMock.expectOne(`${BASE}/10/imagem`);
    expect(req.request.method).toBe('POST');
    // multipart: o corpo é um FormData com a parte `arquivo` (nome do campo do contrato §3.3).
    const corpo = req.request.body as FormData;
    expect(corpo instanceof FormData).toBeTrue();
    const parte = corpo.get('arquivo') as File;
    expect(parte).toBeTruthy();
    expect(parte.name).toBe('rosa.jpg');

    req.flush(envelope(rosa));
    expect(recebido).toEqual(rosa);
    expect(recebido?.temImagem).toBeTrue();
  });

  it('removerImagem() faz DELETE /{id}/imagem (204, idempotente)', () => {
    let concluiu = false;
    service.removerImagem(10).subscribe(() => (concluiu = true));

    const req = httpMock.expectOne(`${BASE}/10/imagem`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(concluiu).toBeTrue();
  });

  it('urlImagem() versiona a URL com ?v=<atualizadoEm epoch> (cache imutável × troca de foto)', () => {
    const url = service.urlImagem(rosa);
    const epoch = Date.parse(rosa.atualizadoEm);
    expect(url).toBe(`${BASE}/10/imagem?v=${epoch}`);
    // O `?v` muda quando `atualizadoEm` muda (upload/delete bumpam) → invalida o cache.
    const outro = service.urlImagem({ ...rosa, atualizadoEm: '2026-09-03T09:00:00Z' });
    expect(outro).not.toBe(url);
  });

  it('imagemBlob() faz GET com responseType blob e devolve o Blob', () => {
    const url = service.urlImagem(rosa);
    let blob: Blob | undefined;
    service.imagemBlob(url).subscribe((b) => (blob = b));

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');

    const corpo = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    req.flush(corpo);
    expect(blob).toBe(corpo);
  });
});
