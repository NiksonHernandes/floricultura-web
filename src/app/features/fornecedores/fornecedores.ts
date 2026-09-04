import { Component } from '@angular/core';

/**
 * Placeholder de plumbing (T-M5-6). A tela de LISTA de Fornecedores chega na T-M5-9 (espelho da
 * T-M5-7), que SUBSTITUI este componente. Existe agora só para a rota `/fornecedores` compilar sob
 * `authGuard` e o item de menu do shell navegar (CA-10). NÃO adicionar lógica aqui — é descartável.
 */
@Component({
  selector: 'app-fornecedores',
  template: `<p class="em-breve">Fornecedores — em breve.</p>`,
  styles: `.em-breve { padding: 1.5rem; color: var(--cor-texto-suave, #6b6b6b); }`,
})
export class Fornecedores {}
