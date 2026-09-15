import { TAMANHO_MAX_IMAGEM_BYTES } from '../produto-form/produto-form';
import { TAMANHO_MAX_RECORTE_BYTES } from './recorte-foto';

/**
 * Guarda ANTI-DERIVA do teto de imagem (D1 residual — SPEC-M6.1 §3.10, CA-32).
 *
 * O mesmo número já saiu de sincronia duas vezes entre a tela e o servidor (a dica da foto e,
 * depois, o cropper, que ficou num teto maior do que o do `produto-form` e o do back — AD-SQ-77,
 * FC-09). Aqui ele deixa de ser convenção e passa a ser contrato executável: as DUAS asserções
 * são obrigatórias — a 1ª amarra os dois tetos um ao outro, a 2ª impede que alguém "alinhe" os
 * dois para CIMA e volte a divergir do back.
 *
 * Sem componente, sem TestBed: é uma asserção sobre as constantes exportadas.
 */
describe('Teto de imagem: cropper × formulário (D1 — anti-deriva)', () => {
  it('o teto do cropper é o MESMO do formulário (anti-deriva do 5 MB — D1)', () => {
    expect(TAMANHO_MAX_RECORTE_BYTES).toBe(TAMANHO_MAX_IMAGEM_BYTES);
    expect(TAMANHO_MAX_RECORTE_BYTES).toBe(2 * 1024 * 1024);
  });
});
