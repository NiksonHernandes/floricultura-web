import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

/**
 * T-M6-03 (CA-26 — SPEC-M6 §3.8). Spec NOVO (anti-burla: nenhum spec herdado tocado).
 *
 * Tokens de CSS não têm superfície de TypeScript: a única prova honesta de que eles "existem e
 * valem" é renderizar e MEDIR. A sonda abaixo aplica os mixins do ateliê num componente de teste
 * e lê `getComputedStyle`. Ela trava três coisas:
 *   (1) os 7 hex + `--display` do M1 continuam com o MESMO valor (nada aditivo os corrompeu);
 *   (2) os tokens novos de tipografia/tinta/densidade produzem font/cor REAIS (D1: se `--corpo`
 *       voltar a ser `--mat-sys-body-*`, a declaração fica inválida e a medida desaba);
 *   (3) o defeito do D1, isolado em `.sonda__defeito`, continua sendo descartado pelo navegador —
 *       é o que justifica ter varrido as 23 declarações do app.
 */
@Component({
  selector: 'app-sonda-atelie',
  standalone: true,
  template: `<p class="sonda__dado">dado</p>
    <p class="sonda__forte">forte</p>
    <p class="sonda__rotulo">rótulo</p>
    <p class="sonda__defeito">defeito</p>`,
  styleUrl: './atelie-tokens.spec.scss',
})
class SondaAtelie {}

describe('T-M6-03/CA-26 — tokens do ateliê (sonda de getComputedStyle)', () => {
  let host: HTMLElement;
  let raiz: CSSStyleDeclaration;

  /** px de 1rem no ambiente do runner — não presumir 16px. */
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);

  const estilo = (classe: string) =>
    getComputedStyle(host.querySelector(`.${classe}`) as HTMLElement);

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SondaAtelie] });
    const fixture = TestBed.createComponent(SondaAtelie);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    raiz = getComputedStyle(host);
  });

  it('preserva os 7 hex do M1 e o --display (adições são ADITIVAS)', () => {
    const cores: Record<string, string> = {
      '--folhagem': '#1f3a2e',
      '--estufa': '#f3f6f0',
      '--tinta': '#14241c',
      '--caule': '#6b8f71',
      '--dalia': '#c4326b',
      '--orvalho': '#e4ece2',
      '--sais': '#a9c6ae',
    };
    for (const [token, hex] of Object.entries(cores)) {
      expect(raiz.getPropertyValue(token).trim()).withContext(token).toBe(hex);
    }
    expect(raiz.getPropertyValue('--display')).toContain('Fraunces');
  });

  it('expõe os tokens de densidade e de tinta exigidos pelo CA-26', () => {
    const esperado: Record<string, string> = {
      '--esp-1': '0.35rem',
      '--esp-2': '0.75rem',
      '--esp-3': '1.25rem',
      '--linha-densa': '2.25rem',
      '--toque': '44px',
      '--raio': '12px', // D9: raio único do ateliê
      '--txt-rotulo-track': '0.18em',
    };
    for (const [token, valor] of Object.entries(esperado)) {
      expect(raiz.getPropertyValue(token).trim()).withContext(token).toBe(valor);
    }
    for (const token of ['--tinta-forte', '--tinta-media', '--tinta-fraca']) {
      expect(raiz.getPropertyValue(token).trim()).withContext(token).not.toBe('');
    }
  });

  // ---- D1: o shorthand `font:` precisa de uma FAMÍLIA de verdade no fim -------------------------

  it('--corpo resolve para uma família REAL (e não para o shorthand do tema)', () => {
    const corpo = raiz.getPropertyValue('--corpo');
    expect(corpo).toContain('Roboto'); // veio de --mat-sys-body-medium-font
    expect(corpo).not.toMatch(/\d/); // shorthand traria "400 .875rem/1.25rem"
  });

  it('--txt-dado e --txt-valor-forte aplicam peso e tamanho REAIS', () => {
    const dado = estilo('sonda__dado');
    expect(parseFloat(dado.fontSize)).toBeCloseTo(0.85 * rem(), 1);
    expect(dado.fontWeight).toBe('500');
    expect(dado.fontFamily).toContain('Roboto');

    const forte = estilo('sonda__forte');
    expect(parseFloat(forte.fontSize)).toBeCloseTo(1.05 * rem(), 1);
    expect(forte.fontWeight).toBe('700');
  });

  it('--txt-rotulo usa o display serifado, com versalete espaçado e tinta mais fraca', () => {
    const rotulo = estilo('sonda__rotulo');
    expect(rotulo.fontFamily).toContain('Fraunces');
    expect(parseFloat(rotulo.fontSize)).toBeCloseTo(0.66 * rem(), 1);
    expect(parseFloat(rotulo.letterSpacing)).toBeGreaterThan(0);
    // --tinta-fraca a 65% (D2) tem que ser mais CLARA que a tinta cheia, mas ainda escrita.
    expect(rotulo.color).not.toBe(estilo('sonda__dado').color);
  });

  it('o padrão do defeito (var(--mat-sys-body-*) como família) é DESCARTADO pelo navegador', () => {
    const defeito = estilo('sonda__defeito');
    // Mesmos peso/tamanho pedidos em .sonda__dado — se a declaração valesse, bateriam.
    expect(parseFloat(defeito.fontSize)).not.toBeCloseTo(0.85 * rem(), 1);
    expect(defeito.fontWeight).not.toBe('500');
  });
});
