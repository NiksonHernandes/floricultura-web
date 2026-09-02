import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Produtos — Home pós-login (AD-SQ-33, CA-16).
 *
 * Placeholder honesto do M2/Onda 1: a rota `/produtos` já existe como Home dentro do
 * shell, mas a LISTA real (cards, paginação, filtro, selo de estoque baixo) é a T-M2-7.
 * Empty-state rotulado como "em preparação" — nada de número/label fake (regra do squad).
 */
@Component({
  selector: 'app-produtos',
  imports: [MatIconModule],
  templateUrl: './produtos.html',
  styleUrl: './produtos.scss',
})
export class Produtos {}
