import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';

import { AtributosBotanicos, formatarAltura, paraCentimetros } from './atributos-botanicos';
import { ProdutoForm } from '../produto-form';
import { ProdutosService } from '../../produtos.service';
import { CoresService } from '../../../configuracoes/cores/cores.service';
import { environment } from '../../../../../environments/environment';
import { Produto, ProdutoRequest } from '../../../../core/models/produto.model';

/**
 * T-M6-09a — atributos botânicos no cadastro (SPEC-M6 §3.12, CA-32/CA-33; §10 #26).
 *
 * Os casos de payload rodam pelo `ProdutoForm` de verdade (não pelo filho isolado): o que o CA
 * promete é o que sai no `POST`/`PUT`, e é isso que precisa estar provado ponta a ponta.
 */
describe('AtributosBotanicos (T-M6-09a, CA-32/CA-33)', () => {
  let serviceSpy: jasmine.SpyObj<
    Pick<ProdutosService, 'criar' | 'atualizar' | 'movimentar' | 'urlImagem' | 'imagemBlob'>
  >;

  const criado: Produto = {
    id: 7,
    nome: 'Costela-de-adão',
    descricao: null,
    unidadeMedida: 'un',
    estoqueMinimo: 1,
    estoqueAtual: 0,
    preco: null,
    imagemUrl: null,
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-11T10:00:00Z',
    atualizadoEm: '2026-09-11T10:00:00Z',
    temImagem: false,
  };

  /** Produto em edição que JÁ tem atributos — base do "desligar o box limpa" e do "nasce ligado". */
  const comAtributos: Produto = {
    ...criado,
    id: 12,
    caracteristica: 'ADULTA',
    alturaCm: 120,
    toxicidade: 'TOXICA',
    necessidadeLuz: ['MEIA_SOMBRA', 'SOMBRA'],
    cores: [
      { id: 4, nome: 'VERDE', hex: '#2E7D32' },
      { id: 9, nome: 'ROSA', hex: null },
    ],
  };

  const minimo = {
    nome: 'Costela-de-adão',
    descricao: '',
    unidadeMedida: 'un' as const,
    estoqueMinimo: 1,
    preco: null,
    imagemUrl: '',
  };

  /** Acesso tipado ao que o form expõe (membros `protected` — o teste é do mesmo contrato). */
  interface FormProbe {
    form: { setValue(v: typeof minimo): void };
    salvar(): void;
  }

  interface BoxProbe {
    boxCores: { set(v: boolean): void };
    boxPorte: { set(v: boolean): void };
    boxToxicidade: { set(v: boolean): void };
    boxLuz: { set(v: boolean): void };
    corIds: { setValue(v: number[]): void; readonly value: number[]; readonly disabled: boolean };
    caracteristica: { setValue(v: string | null): void };
    altura: { setValue(v: number | null): void; readonly value: number | null };
    toxicidade: { setValue(v: string | null): void };
    luz: { setValue(v: string[]): void };
    unidade: { set(v: 'cm' | 'm'): void };
    catalogo(): { id: number; nome: string; hex: string | null }[];
    alternarCores(ligado: boolean): void;
    alternarPorte(ligado: boolean): void;
    aoTrocarCaracteristica(): void;
    trocarUnidade(u: 'cm' | 'm'): void;
    alturaLegivel(): string | null;
    alturaRemovida(): boolean;
    erros(): Record<string, string>;
  }

  function montarForm(produto?: Produto): {
    fixture: ComponentFixture<ProdutoForm>;
    form: FormProbe;
    box: BoxProbe;
  } {
    const fixture = TestBed.createComponent(ProdutoForm);
    if (produto) {
      fixture.componentRef.setInput('produto', produto);
    }
    fixture.detectChanges();
    const filho = fixture.debugElement.query(By.directive(AtributosBotanicos));
    return {
      fixture,
      form: fixture.componentInstance as unknown as FormProbe,
      box: filho.componentInstance as unknown as BoxProbe,
    };
  }

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<
      Pick<ProdutosService, 'criar' | 'atualizar' | 'movimentar' | 'urlImagem' | 'imagemBlob'>
    >('ProdutosService', ['criar', 'atualizar', 'movimentar', 'urlImagem', 'imagemBlob']);
    serviceSpy.criar.and.returnValue(of(criado));
    serviceSpy.atualizar.and.returnValue(of(criado));
    serviceSpy.urlImagem.and.returnValue('http://localhost/imagem');
    serviceSpy.imagemBlob.and.returnValue(of(new Blob()));
    TestBed.configureTestingModule({
      imports: [ProdutoForm],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProdutosService, useValue: serviceSpy },
      ],
    });
  });

  // --- Conversão e exibição (funções puras — R14/R15/R16) ---------------------------------------

  it('converte metros para cm inteiro com HALF_UP (1,2 → 120; 1,255 → 126 — R14/CA-33)', () => {
    expect(paraCentimetros(1.2, 'm')).toBe(120);
    expect(paraCentimetros(1.255, 'm')).toBe(126);
    expect(paraCentimetros(0.01, 'm')).toBe(1);
    expect(paraCentimetros(100, 'm')).toBe(10000);
  });

  it('arredonda HALF_UP também quando a digitação é em cm (45,4 → 45; 45,5 → 46 — R15)', () => {
    expect(paraCentimetros(45.4, 'cm')).toBe(45);
    expect(paraCentimetros(45.5, 'cm')).toBe(46);
    expect(paraCentimetros(30, 'cm')).toBe(30);
  });

  it('exibe ≥100 cm em metros pt-BR e abaixo disso em cm inteiro (R16/CA-33)', () => {
    expect(formatarAltura(120)).toBe('1,20 m');
    expect(formatarAltura(250)).toBe('2,50 m');
    expect(formatarAltura(100)).toBe('1,00 m');
    expect(formatarAltura(99)).toBe('99 cm');
    expect(formatarAltura(45)).toBe('45 cm');
  });

  // --- Os 4 boxes (CA-32) ------------------------------------------------------------------------

  it('abre com os 4 boxes DESLIGADOS e o conteúdo de cada um oculto (CA-32)', () => {
    const { fixture } = montarForm();
    const chaves = fixture.nativeElement.querySelectorAll('app-atributos-botanicos .caixa__chave');
    const conteudos: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('app-atributos-botanicos .caixa__conteudo'),
    );
    expect(chaves.length).toBe(4);
    expect(conteudos.length).toBe(4);
    expect(conteudos.every((c) => c.hasAttribute('hidden'))).toBeTrue();
  });

  it('ligar um box revela o conteúdo daquele box (CA-32)', () => {
    const { fixture, box } = montarForm();
    box.alternarPorte(true);
    fixture.detectChanges();
    const conteudos: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('app-atributos-botanicos .caixa__conteudo'),
    );
    expect(conteudos[1].hasAttribute('hidden')).toBeFalse();
    expect(conteudos[0].hasAttribute('hidden')).toBeTrue();
  });

  it('cria com os 4 boxes desligados: payload SEM campo botânico nenhum (CA-32)', () => {
    const { form } = montarForm();
    form.form.setValue(minimo);
    form.salvar();

    const enviado = serviceSpy.criar.calls.mostRecent().args[0] as ProdutoRequest;
    expect(Object.keys(enviado).sort()).toEqual([
      'descricao',
      'estoqueMinimo',
      'imagemUrl',
      'nome',
      'preco',
      'unidadeMedida',
    ]);
  });

  it('cria com os 4 boxes preenchidos: os 5 campos do §3.3 viajam (CA-32/CA-33)', () => {
    const { fixture, box, form } = montarForm();
    box.alternarCores(true);
    box.corIds.setValue([4, 9]);
    box.alternarPorte(true);
    box.caracteristica.setValue('ADULTA');
    box.aoTrocarCaracteristica();
    box.unidade.set('m');
    box.altura.setValue(1.255);
    box.boxToxicidade.set(true);
    box.toxicidade.setValue('NAO_TOXICA');
    box.boxLuz.set(true);
    box.luz.setValue(['MEIA_SOMBRA', 'SOMBRA']);
    fixture.detectChanges();

    form.form.setValue(minimo);
    form.salvar();

    const enviado = serviceSpy.criar.calls.mostRecent().args[0] as ProdutoRequest;
    expect(enviado.caracteristica).toBe('ADULTA');
    expect(enviado.alturaCm).toBe(126); // 1,255 m → HALF_UP
    expect(enviado.toxicidade).toBe('NAO_TOXICA');
    expect(enviado.necessidadeLuz).toEqual(['MEIA_SOMBRA', 'SOMBRA']);
    expect(enviado.corIds).toEqual([4, 9]);
  });

  it('box LIGADO E VAZIO bloqueia o submit, sem requisição, com erro no box (CA-32)', () => {
    const { form, box } = montarForm();
    box.alternarCores(true); // ligado, nenhuma cor escolhida
    form.form.setValue(minimo);
    form.salvar();

    expect(serviceSpy.criar).not.toHaveBeenCalled();
    expect(box.erros()['cores']).toBe('Escolha ao menos uma opção ou desligue este item.');
  });

  it('edição: os boxes nascem ligados e pré-selecionados com o que o produto já tem (CA-32)', () => {
    const { fixture, box } = montarForm(comAtributos);
    const conteudos: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('app-atributos-botanicos .caixa__conteudo'),
    );
    expect(conteudos.some((c) => c.hasAttribute('hidden'))).toBeFalse();
    expect(box.corIds.value).toEqual([4, 9]);
    // As opções do catálogo já estão semeadas com as cores do produto (o trigger do `mat-select`
    // não é verificável no Karma: o painel é lazy e nenhuma `mat-option` existe no DOM fechado —
    // vale para QUALQUER select do app, inclusive o de unidade, herdado do M2).
    expect(box.catalogo().map((c) => c.nome)).toEqual(['VERDE', 'ROSA']);
    const selecao: HTMLElement = fixture.nativeElement.querySelector(
      'app-atributos-botanicos .selecao',
    );
    expect(selecao.textContent).toContain('VERDE');
    expect(selecao.textContent).toContain('ROSA');
    expect(box.altura.value).toBe(1.2); // 120 cm exibido em metros (R17)
    expect(box.alturaLegivel()).toBe('1,20 m');
  });

  it('edição: desligar os boxes LIMPA os atributos no PUT (null nos escalares, [] nas coleções)', () => {
    const { fixture, box, form } = montarForm(comAtributos);
    box.alternarCores(false);
    box.alternarPorte(false);
    box.boxToxicidade.set(false);
    box.boxLuz.set(false);
    fixture.detectChanges();

    form.form.setValue(minimo);
    form.salvar();

    const enviado = serviceSpy.atualizar.calls.mostRecent().args[1] as ProdutoRequest;
    expect(enviado.caracteristica).toBeNull();
    expect(enviado.alturaCm).toBeNull();
    expect(enviado.toxicidade).toBeNull();
    expect(enviado.necessidadeLuz).toEqual([]);
    expect(enviado.corIds).toEqual([]);
  });

  // --- Altura × característica (CA-33/R13) -------------------------------------------------------

  it('a altura só aparece com Jovem/Adulta (CA-33)', () => {
    const { fixture, box } = montarForm();
    box.alternarPorte(true);
    box.caracteristica.setValue('MUDA');
    box.aoTrocarCaracteristica();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.altura')).toBeNull();

    box.caracteristica.setValue('JOVEM');
    box.aoTrocarCaracteristica();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.altura')).not.toBeNull();
  });

  it('trocar para Muda LIMPA a altura e avisa — o payload não leva altura (R13/CA-33)', () => {
    const { fixture, box, form } = montarForm();
    box.alternarPorte(true);
    box.caracteristica.setValue('JOVEM');
    box.aoTrocarCaracteristica();
    box.altura.setValue(80);
    box.caracteristica.setValue('MUDA');
    box.aoTrocarCaracteristica();
    fixture.detectChanges();

    expect(box.altura.value).toBeNull();
    expect(box.alturaRemovida()).toBeTrue();

    form.form.setValue(minimo);
    form.salvar();
    const enviado = serviceSpy.criar.calls.mostRecent().args[0] as ProdutoRequest;
    expect(enviado.caracteristica).toBe('MUDA');
    expect('alturaCm' in enviado).toBeFalse(); // nada a limpar na criação ⇒ campo omitido
  });

  it('trocar a unidade converte o valor já digitado (120 cm → 1,2 m — R14)', () => {
    const { box } = montarForm();
    box.alternarPorte(true);
    box.caracteristica.setValue('ADULTA');
    box.aoTrocarCaracteristica();
    box.altura.setValue(120);
    box.trocarUnidade('m');
    expect(box.altura.value).toBe(1.2);
    expect(box.alturaLegivel()).toBe('1,20 m');
  });

  it('altura fora de 1..10000 cm é bloqueada no front, sem requisição (CA-33)', () => {
    const { box, form } = montarForm();
    box.alternarPorte(true);
    box.caracteristica.setValue('ADULTA');
    box.aoTrocarCaracteristica();
    box.altura.setValue(10001);
    form.form.setValue(minimo);
    form.salvar();

    expect(serviceSpy.criar).not.toHaveBeenCalled();
    expect(box.erros()['porte']).toContain('altura');
  });

  // --- Catálogo de cores e erro do back ----------------------------------------------------------

  it('sem CoresService registrado (specs herdados do M2/M3) NENHUM GET /cores é disparado', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const { fixture, box } = montarForm();
    box.alternarCores(true);
    fixture.detectChanges(); // roda o effect do "vazio settled"
    httpMock.verify(); // zero requisição pendente: o inject opcional devolveu null
    expect(box.catalogo()).toEqual([]);
    expect(box.corIds.disabled).toBeTrue(); // vazio settled ⇒ select inerte (AD-SQ-72)
  });

  it('com o serviço provido, ligar o box carrega o catálogo UMA vez (§3.12)', () => {
    TestBed.configureTestingModule({ providers: [CoresService] });
    const httpMock = TestBed.inject(HttpTestingController);
    const { box } = montarForm();

    box.alternarCores(true);
    box.alternarCores(false);
    box.alternarCores(true);

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cores?pagina=0&tamanho=100`);
    req.flush({
      success: true,
      data: {
        conteudo: [{ id: 4, nome: 'VERDE', hex: '#2E7D32', produtosVinculados: 0 }],
        pagina: 0,
        tamanho: 100,
        totalElementos: 1,
        totalPaginas: 1,
        primeira: true,
        ultima: true,
      },
    });
    expect(box.catalogo().length).toBe(1);
    httpMock.verify();
  });

  it('400 com field botânico é exibido no box dono do campo (§3.3/AD-SQ-119)', () => {
    serviceSpy.criar.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Dados inválidos',
                details: [
                  {
                    field: 'alturaCm',
                    message: 'A altura só pode ser informada quando a característica for JOVEM ou ADULTA.',
                  },
                ],
              },
            },
          }),
      ),
    );
    const { box, form } = montarForm();
    form.form.setValue(minimo);
    form.salvar();

    expect(box.erros()['porte']).toContain('JOVEM ou ADULTA');
  });
});
