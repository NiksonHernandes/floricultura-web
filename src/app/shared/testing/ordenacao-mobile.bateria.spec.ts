import { Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';

/**
 * Bateria de ordenação no CELULAR (T-M6-08d — §3.11.1, CA-41/CA-42, R31). Fábrica compartilhada
 * porque o contrato é o MESMO nas duas telas de contato ("Fornecedores é o espelho"): duplicar as
 * asserções seria convidar as cópias a divergirem — e é a divergência que esta task impede. O que
 * se trava é a PARIDADE: `<select>` do celular e `<th>` do desktop são afordances do MESMO estado,
 * com UM escritor e valor DERIVADO. Termina em `.spec.ts` de propósito (o `tsconfig.app.json` o
 * exclui do build da app); não declara nenhum caso próprio.
 */
export interface CenarioOrdenacaoMobile {
  titulo: string; // nome da tela no `describe`
  componente: Type<unknown>;
  servico: Type<unknown>;
  url: string; // URL absoluta do recurso paginado
  registro: Record<string, unknown>; // um registro FICTÍCIO (LGPD) da lista
}

export function baterizarOrdenacaoMobile(cenario: CenarioOrdenacaoMobile): void {
  describe(`${cenario.titulo} — ordenar no celular (T-M6-08d, CA-41/CA-42)`, () => {
    let httpMock: HttpTestingController;

    /** Envelope + página do §3.4 com o único registro do cenário. */
    function envelope(): object {
      const data = {
        conteudo: [cenario.registro],
        pagina: 0,
        tamanho: 12,
        totalElementos: 1,
        totalPaginas: 1,
        primeira: true,
        ultima: true,
      };
      return { success: true, error: null, timestamp: '', path: '', data };
    }

    beforeEach(() => {
      const dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dialog.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
      TestBed.configureTestingModule({
        imports: [cenario.componente],
        providers: [
          provideNoopAnimations(),
          provideHttpClient(),
          provideHttpClientTesting(),
          cenario.servico,
          { provide: AuthService, useValue: { ehAdmin: signal(true) } },
          { provide: MatDialog, useValue: dialog },
        ],
      });
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    function iniciar(): ComponentFixture<unknown> {
      const fixture = TestBed.createComponent(cenario.componente);
      fixture.detectChanges(); // ngOnInit → carregar()
      httpMock.expectOne((r) => r.url === cenario.url).flush(envelope());
      fixture.detectChanges();
      return fixture;
    }

    function seletor(fixture: ComponentFixture<unknown>): HTMLSelectElement {
      return (fixture.nativeElement as HTMLElement).querySelector(
        '.tabela-ordenar__campo',
      ) as HTMLSelectElement;
    }

    // Escolhe uma opção como o operador faria no picker do sistema.
    function escolher(fixture: ComponentFixture<unknown>, valor: string): void {
      const select = seletor(fixture);
      select.value = valor;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    function thDe(fixture: ComponentFixture<unknown>, rotulo: string): HTMLElement {
      return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('thead th')).find(
        (el) => el.textContent?.trim().startsWith(rotulo),
      ) as HTMLElement;
    }

    function clicarNoCabecalho(fixture: ComponentFixture<unknown>, rotulo: string): void {
      (thDe(fixture, rotulo).querySelector('.tabela__ord') as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    it('é um <select> NATIVO rotulado "Ordenar por", com as 6 opções na ordem do §3.11.1', () => {
      const fixture = iniciar();
      const el = fixture.nativeElement as HTMLElement;
      const select = seletor(fixture);

      // Nativo: zero `mat-select` e zero módulo Material novo NESTE controle. (O único `mat-select`
      // da tela é o "itens por página" que o `mat-paginator` desenha sozinho desde o M2.)
      expect(select.tagName).toBe('SELECT');
      expect(el.querySelector('.tabela-ordenar mat-select')).toBeNull();

      const rotulo = el.querySelector('.tabela-ordenar__rotulo') as HTMLLabelElement;
      expect(rotulo.textContent?.trim()).toBe('Ordenar por');
      expect(rotulo.getAttribute('for')).toBe(select.id); // nunca fica sem nome acessível

      const opcoes = Array.from(select.options);
      expect(opcoes.map((o) => o.value)).toEqual([
        'nome:asc',
        'nome:desc',
        'telefone:asc',
        'telefone:desc',
        'email:asc',
        'email:desc',
      ]);
      expect(opcoes.map((o) => o.textContent?.trim())).toEqual([
        'Nome (A–Z)',
        'Nome (Z–A)',
        'Telefone (crescente)',
        'Telefone (decrescente)',
        'E-mail (A–Z)',
        'E-mail (Z–A)',
      ]);
    });

    it('tem alvo de 44px e fonte de 16px (o zoom do Safari iOS é regressão, não estética)', () => {
      const estilo = getComputedStyle(seletor(iniciar()));
      expect(parseFloat(estilo.fontSize)).toBeGreaterThanOrEqual(16);
      expect(parseFloat(estilo.minHeight)).toBeGreaterThanOrEqual(44);
    });

    it('escolher "E-mail (Z–A)" faz UMA requisição com email/desc e pagina=0 (R20)', () => {
      const fixture = iniciar();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fixture.componentInstance as any).aoPaginar({ pageIndex: 2, pageSize: 12 });
      httpMock.expectOne((r) => r.url === cenario.url).flush(envelope());
      fixture.detectChanges();

      escolher(fixture, 'email:desc');

      const reqs = httpMock.match((r) => r.url === cenario.url);
      expect(reqs.length).toBe(1);
      expect(reqs[0].request.params.get('ordenarPor')).toBe('email');
      expect(reqs[0].request.params.get('direcao')).toBe('desc');
      expect(reqs[0].request.params.get('pagina')).toBe('0'); // a ordenação volta para a 1ª página
      reqs[0].flush(envelope());
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelectorAll('tbody tr.ficha').length).toBe(1);
    });

    // --- CA-42: um só estado entre breakpoints ---

    it('2 cliques no <th> "Telefone" movem o select — com exatamente 2 requisições', () => {
      const fixture = iniciar();
      expect(seletor(fixture).value).toBe('nome:asc'); // o default do estado, projetado no controle

      clicarNoCabecalho(fixture, 'Telefone');
      const primeira = httpMock.match((r) => r.url === cenario.url);
      expect(primeira.length).toBe(1); // nenhuma requisição extra de sincronização
      primeira[0].flush(envelope());
      fixture.detectChanges();
      expect(seletor(fixture).value).toBe('telefone:asc');

      clicarNoCabecalho(fixture, 'Telefone');
      const segunda = httpMock.match((r) => r.url === cenario.url);
      expect(segunda.length).toBe(1);
      expect(segunda[0].request.params.get('direcao')).toBe('desc');
      segunda[0].flush(envelope());
      fixture.detectChanges();
      expect(seletor(fixture).value).toBe('telefone:desc');
    });

    it('escolher "Nome (Z–A)" põe aria-sort="descending" no <th> Nome (1 requisição)', () => {
      const fixture = iniciar();
      escolher(fixture, 'nome:desc');

      const reqs = httpMock.match((r) => r.url === cenario.url);
      expect(reqs.length).toBe(1);
      expect(reqs[0].request.params.get('ordenarPor')).toBe('nome');
      expect(reqs[0].request.params.get('direcao')).toBe('desc');
      reqs[0].flush(envelope());
      fixture.detectChanges();

      expect(thDe(fixture, 'Nome').getAttribute('aria-sort')).toBe('descending');
      expect(thDe(fixture, 'Telefone').getAttribute('aria-sort')).toBe('none');
      expect(thDe(fixture, 'E-mail').getAttribute('aria-sort')).toBe('none');
    });

    it('o valor do select é DERIVADO: não há sinal nem FormControl exclusivo do mobile', () => {
      const fixture = iniciar();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const comp = fixture.componentInstance as any;

      // `computed` não tem `set`/`update` — se alguém trocar por `signal`/`FormControl`, cai aqui.
      expect(typeof comp.ordemSelecionada).toBe('function');
      expect(comp.ordemSelecionada.set).toBeUndefined();
      expect(comp.ordemSelecionada.update).toBeUndefined();
      expect(comp.ordemSelecionada.setValue).toBeUndefined();

      // E o inventário do estado de ordenação é fechado: 2 sinais + 1 derivado, nada mobile-only.
      const campos = Object.keys(comp).filter((k) => /orden|ordem|direcao|sort/i.test(k));
      expect(campos.sort()).toEqual(['direcao', 'ordemSelecionada', 'ordenarPor']);
    });

    it('o select fica SEMPRE no DOM (esconder é papel do CSS, não de um @if)', () => {
      // No Karma o viewport é desktop: sob `@if` o bloco sumiria do DOM e a prova de paridade
      // acima seria impossível de escrever sem truque de viewport.
      const el = iniciar().nativeElement as HTMLElement;
      expect(el.querySelectorAll('.tabela-ordenar').length).toBe(1);
      expect(el.querySelector('.controles')?.lastElementChild?.classList).toContain(
        'tabela-ordenar',
      );
    });
  });
}
