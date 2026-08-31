import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';

/**
 * Shell raiz da aplicação (mobile-first, FC-02).
 * Em M0 é apenas o esqueleto responsivo: toolbar Material + área de conteúdo com
 * <router-outlet>. As telas de negócio entram a partir de M2 (SPEC-M0 §2).
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatToolbarModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected title = 'floricultura-web';
}
