import { Component } from '@angular/core';

/**
 * Placeholder de plumbing (T-M5-6). A tela de LISTA de Clientes (paginação/filtro/estados + RBAC UX
 * + hard delete) chega na T-M5-7, que SUBSTITUI este componente (html/scss/spec próprios, espelhando
 * `eventos.ts`/`produtos.ts`). Existe agora só para a rota `/clientes` compilar sob `authGuard` e o
 * item de menu do shell navegar (CA-10). NÃO adicionar lógica aqui — é descartável.
 */
@Component({
  selector: 'app-clientes',
  template: `<p class="em-breve">Clientes — em breve.</p>`,
  styles: `.em-breve { padding: 1.5rem; color: var(--cor-texto-suave, #6b6b6b); }`,
})
export class Clientes {}
