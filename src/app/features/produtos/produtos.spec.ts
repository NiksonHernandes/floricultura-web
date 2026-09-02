import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { Produtos } from './produtos';

describe('Produtos (Home, T-M2-6 placeholder)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Produtos],
      providers: [provideNoopAnimations()],
    }).compileComponents();
  });

  it('cria a Home de produtos', () => {
    const fixture = TestBed.createComponent(Produtos);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renderiza um único <h1> "Produtos" (a11y — um h1 por página)', () => {
    const fixture = TestBed.createComponent(Produtos);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const titulos = compiled.querySelectorAll('h1');
    expect(titulos.length).toBe(1);
    expect(titulos[0].textContent).toContain('Produtos');
  });
});
