import { TestBed } from '@angular/core/testing';

import { Clientes } from './clientes';

/** Placeholder de plumbing (T-M5-6): a suíte real da lista chega na T-M5-7. */
describe('Clientes (T-M5-6 placeholder)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Clientes] });
  });

  it('cria o componente', () => {
    const fixture = TestBed.createComponent(Clientes);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
