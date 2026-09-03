import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ImagemProduto } from './imagem-produto';
import { ProdutosService } from '../produtos.service';
import { Produto } from '../../../core/models/produto.model';

/**
 * Exibição por prioridade banco → URL → placeholder (SPEC-M3 §3.6, T-M3-4, CA-11, AD-SQ-37).
 *
 * Cobre: `temImagem` → blob + object URL (revogado ao trocar/descartar); só `imagemUrl` → URL
 * externa; nenhum → placeholder; erro/404 do banco → fallback SEM quebrar/deslogar. Não desloga
 * porque o componente nunca chama `logout` e o `404` do serviço não é `401` (§12 — o interceptor
 * só desloga no `401`, coberto por `auth.interceptor.spec`).
 */
describe('ImagemProduto (T-M3-4, CA-11)', () => {
  let httpMock: HttpTestingController;
  let service: ProdutosService;

  const BASE = 'http://localhost:8080/api/v1/produtos';

  const base: Produto = {
    id: 10,
    nome: 'Rosa Vermelha',
    descricao: null,
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 25,
    preco: null,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-02T14:00:00Z',
    atualizadoEm: '2026-09-02T14:00:00Z',
    temImagem: false,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ImagemProduto],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(ProdutosService);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:fake-1');
    spyOn(URL, 'revokeObjectURL');
  });

  afterEach(() => httpMock.verify());

  function criar(p: Produto): ComponentFixture<ImagemProduto> {
    const fixture = TestBed.createComponent(ImagemProduto);
    fixture.componentRef.setInput('produto', p);
    return fixture;
  }

  function html(fixture: ComponentFixture<ImagemProduto>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('temImagem:true → carrega o blob do banco (Bearer via interceptor) e usa object URL no <img>', () => {
    const p: Produto = { ...base, temImagem: true };
    const fixture = criar(p);

    // Carrega por HttpClient (blob) na URL versionada — NUNCA <img src> direto ao endpoint.
    const req = httpMock.expectOne(service.urlImagem(p));
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    fixture.detectChanges();

    const img = html(fixture).querySelector('.vaso__img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(img.getAttribute('src')).toBe('blob:fake-1');
    expect(html(fixture).querySelector('.vaso__placeholder')).toBeNull();
  });

  it('só imagemUrl (temImagem:false) → usa a URL externa direto, sem tocar o back', () => {
    const fixture = criar({ ...base, imagemUrl: 'https://exemplo.local/rosa.jpg' });
    fixture.detectChanges();

    const img = html(fixture).querySelector('.vaso__img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://exemplo.local/rosa.jpg');
    // Sem imagem no banco → nenhum GET de blob.
    httpMock.expectNone((r) => r.url.includes('/imagem'));
  });

  it('nenhuma fonte → placeholder botânico (local_florist)', () => {
    const fixture = criar({ ...base, imagemUrl: null });
    fixture.detectChanges();

    expect(html(fixture).querySelector('.vaso__placeholder')).toBeTruthy();
    expect(html(fixture).querySelector('.vaso__img')).toBeNull();
  });

  it('erro/404 do banco → cai para a URL externa SEM quebrar nem deslogar', () => {
    const p: Produto = { ...base, temImagem: true, imagemUrl: 'https://exemplo.local/rosa.jpg' };
    const fixture = criar(p);

    httpMock
      .expectOne(service.urlImagem(p))
      .flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    const img = html(fixture).querySelector('.vaso__img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://exemplo.local/rosa.jpg');
    expect(html(fixture).querySelector('.vaso__placeholder')).toBeNull();
  });

  it('erro do banco e sem imagemUrl → placeholder (fallback final, card intacto)', () => {
    const p: Produto = { ...base, temImagem: true, imagemUrl: null };
    const fixture = criar(p);

    httpMock
      .expectOne(service.urlImagem(p))
      .flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(html(fixture).querySelector('.vaso__placeholder')).toBeTruthy();
    expect(html(fixture).querySelector('.vaso__img')).toBeNull();
  });

  it('<img> da URL externa dispara (error) → placeholder (AD-SQ-32)', () => {
    const fixture = criar({ ...base, imagemUrl: 'https://exemplo.local/quebrada.jpg' });
    fixture.detectChanges();

    const img = html(fixture).querySelector('.vaso__img') as HTMLImageElement;
    img.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(html(fixture).querySelector('.vaso__img')).toBeNull();
    expect(html(fixture).querySelector('.vaso__placeholder')).toBeTruthy();
  });

  it('revoga o object URL ao descartar o componente (sem vazamento)', () => {
    const p: Produto = { ...base, temImagem: true };
    const fixture = criar(p);
    httpMock.expectOne(service.urlImagem(p)).flush(new Blob([new Uint8Array([1])]));
    fixture.detectChanges();

    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-1');
  });

  it('revoga o object URL anterior ao TROCAR de produto (evita vazamento entre cards)', () => {
    const p: Produto = { ...base, temImagem: true };
    const fixture = criar(p);
    httpMock.expectOne(service.urlImagem(p)).flush(new Blob([new Uint8Array([1])]));
    fixture.detectChanges();

    // Trocar para um produto sem imagem do banco deve revogar o object URL carregado.
    fixture.componentRef.setInput('produto', { ...base, id: 11, temImagem: false });
    fixture.detectChanges();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-1');
  });
});
