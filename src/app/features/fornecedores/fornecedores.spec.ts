import { TestBed } from '@angular/core/testing';

import { Fornecedores } from './fornecedores';

/** Placeholder de plumbing (T-M5-6): a suíte real da lista chega na T-M5-9. */
describe('Fornecedores (T-M5-6 placeholder)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Fornecedores] });
  });

  it('cria o componente', () => {
    const fixture = TestBed.createComponent(Fornecedores);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
