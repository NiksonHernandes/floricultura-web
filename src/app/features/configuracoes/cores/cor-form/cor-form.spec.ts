import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CorForm } from './cor-form';
import { CoresService } from '../cores.service';
import { ApiResponse } from '../../../../core/models/api-response.model';
import { Cor } from '../../../../core/models/cor.model';

/**
 * Form de cor (T-M6-06b — SPEC-M6 §3.15, CA-30/CA-40).
 *
 * O que este arquivo trava é a decisão de desenho da task: **o front manda texto CRU** e só
 * PREVÊ o canônico na tela; quem canoniza é o back (§3.2.1, fonte única / armadilha §12 #22). E as
 * mensagens de erro vêm PRONTAS do servidor — nenhuma frase de 400/409 é escrita aqui.
 */
describe('CorForm — criar/editar (T-M6-06b, CA-30/CA-40)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/cores';

  const cinza: Cor = {
    id: 7,
    nome: 'CINZA-ESCURO',
    hex: '#C4326B',
    produtosVinculados: 3,
    criadoEm: '2026-09-11T13:02:11Z',
    atualizadoEm: '2026-09-11T13:02:11Z',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function erro(code: string, message: string, details: { field: string; message: string }[] = []) {
    return { success: false, data: null, error: { code, message, details }, timestamp: '', path: '' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Probe = any;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CorForm],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        CoresService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function montar(cor: Cor | null = null): ComponentFixture<CorForm> {
    const fixture = TestBed.createComponent(CorForm);
    if (cor) {
      fixture.componentRef.setInput('cor', cor);
    }
    fixture.detectChanges();
    return fixture;
  }

  function digitar(fixture: ComponentFixture<CorForm>, campo: string, valor: string): void {
    (fixture.componentInstance as Probe).form.get(campo).setValue(valor);
    fixture.detectChanges();
  }

  // --- CA-40: a padronização é VISÍVEL antes de salvar ---

  it('mostra o hint fixo da padronização, com o exemplo do §3.15', () => {
    const el = montar().nativeElement as HTMLElement;
    expect(el.querySelector('mat-hint')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'O nome é padronizado: MAIÚSCULAS e espaço vira hífen (ex.: cinza escuro → CINZA-ESCURO).',
    );
  });

  it('prévia: "cinza escuro" anuncia CINZA-ESCURO abaixo do campo', () => {
    const fixture = montar();
    digitar(fixture, 'nome', 'cinza escuro');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.previa')?.textContent).toContain('Será salvo como:');
    expect(el.querySelector('.previa__valor')?.textContent?.trim()).toBe('CINZA-ESCURO');
  });

  it('prévia cobre os 5 passos e some quando o digitado JÁ é o canônico', () => {
    const fixture = montar();
    const valor = () =>
      (fixture.nativeElement as HTMLElement).querySelector('.previa__valor')?.textContent?.trim();

    digitar(fixture, 'nome', '  CINZA - ESCURO  ');
    expect(valor()).toBe('CINZA-ESCURO');
    digitar(fixture, 'nome', 'cinza--escuro');
    expect(valor()).toBe('CINZA-ESCURO');
    digitar(fixture, 'nome', '-azul-');
    expect(valor()).toBe('AZUL');
    digitar(fixture, 'nome', 'lilás'); // acento CONTA (R1c): não vira LILAS
    expect(valor()).toBe('LILÁS');

    digitar(fixture, 'nome', 'AZUL'); // nada a avisar
    expect((fixture.nativeElement as HTMLElement).querySelector('.previa')).toBeNull();
  });

  // --- O que vai na rede ---

  it('POST envia o texto CRU (nem trim), e hex em branco vira null', () => {
    const fixture = montar();
    let emitida: Cor | undefined;
    (fixture.componentInstance as Probe).salvo.subscribe((c: Cor) => (emitida = c));

    digitar(fixture, 'nome', '  cinza escuro  ');
    (fixture.componentInstance as Probe).salvar();

    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    // A prova do §12 #22: nenhuma letra é transformada aqui — o canônico é decisão do back.
    expect(req.request.body).toEqual({ nome: '  cinza escuro  ', hex: null });
    req.flush(envelope(cinza));

    // E o que a tela passa a exibir é o nome da RESPOSTA, não o que foi digitado (R1d).
    expect(emitida?.nome).toBe('CINZA-ESCURO');
  });

  it('editar manda PUT no id da cor, com o nome cru e o hex digitado', () => {
    const fixture = montar(cinza);
    expect((fixture.componentInstance as Probe).form.get('nome').value).toBe('CINZA-ESCURO');

    digitar(fixture, 'nome', 'cinza claro');
    digitar(fixture, 'hex', '#aabbcc');
    (fixture.componentInstance as Probe).salvar();

    const req = httpMock.expectOne(`${BASE}/7`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ nome: 'cinza claro', hex: '#aabbcc' });
    req.flush(envelope({ ...cinza, nome: 'CINZA-CLARO', hex: '#AABBCC' }));
  });

  it('nome vazio ou hex fora de #RRGGBB não chegam a sair da tela', () => {
    const fixture = montar();
    (fixture.componentInstance as Probe).salvar(); // nome obrigatório
    httpMock.expectNone(BASE);

    digitar(fixture, 'nome', 'azul');
    digitar(fixture, 'hex', '#zz');
    (fixture.componentInstance as Probe).salvar();
    httpMock.expectNone(BASE);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Informe a cor no formato #RRGGBB.',
    );
  });

  // --- Amostra ao vivo (R2: ausência de dado tem desenho próprio) ---

  it('a pastilha só pinta hex completo; incompleto continua VAZADA', () => {
    const fixture = montar();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.cor__amostra')?.classList).toContain('cor__amostra--sem');

    digitar(fixture, 'hex', '#C432');
    expect(el.querySelector('.cor__amostra')?.classList).toContain('cor__amostra--sem');

    digitar(fixture, 'hex', '#C4326B');
    const pastilha = el.querySelector('.cor__amostra') as HTMLElement;
    expect(pastilha.classList).not.toContain('cor__amostra--sem');
    expect(pastilha.style.backgroundColor).toBe('rgb(196, 50, 107)');
  });

  // --- Erros: a frase é do back, exibida como veio ---

  it('409 de duplicata aparece NO CAMPO nome, com a mensagem do back, e nada é criado', () => {
    const fixture = montar();
    let emitiu = false;
    (fixture.componentInstance as Probe).salvo.subscribe(() => (emitiu = true));

    digitar(fixture, 'nome', 'azul');
    // Submit de VERDADE (e não `salvar()` direto): é o que põe o form em "submitted" e faz o
    // Material trocar o hint pelo erro no subscript — o caminho que o operador percorre.
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    httpMock
      .expectOne(BASE)
      .flush(erro('CONFLICT', 'Já existe uma cor com esse nome.'), {
        status: 409,
        statusText: 'Conflict',
      });
    fixture.detectChanges();

    const nome = (fixture.componentInstance as Probe).form.get('nome');
    expect(nome.getError('servidor')).toBe('Já existe uma cor com esse nome.');
    expect((fixture.nativeElement as HTMLElement).querySelector('mat-error')?.textContent).toContain(
      'Já existe uma cor com esse nome.',
    );
    expect(emitiu).toBeFalse();
  });

  it('400 de nome inválido usa o details[].field do envelope (§3.2.1)', () => {
    const fixture = montar();
    digitar(fixture, 'nome', '---');
    (fixture.componentInstance as Probe).salvar();
    httpMock.expectOne(BASE).flush(
      erro('VALIDATION_ERROR', 'Dados inválidos.', [
        { field: 'nome', message: 'Informe um nome de cor válido.' },
      ]),
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect((fixture.componentInstance as Probe).form.get('nome').getError('servidor')).toBe(
      'Informe um nome de cor válido.',
    );
  });

  it('403 diz o que aconteceu sem inventar causa de negócio', () => {
    const fixture = montar();
    digitar(fixture, 'nome', 'azul');
    (fixture.componentInstance as Probe).salvar();
    httpMock.expectOne(BASE).flush(null, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.pote__erro')?.textContent).toContain(
      'Você não tem permissão para salvar cores.',
    );
  });
});
