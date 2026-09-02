import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Raiz da aplicação (AD-SQ-33): `router-outlet` puro. O hero "Hello" do M0 saiu — o
 * shell pós-login mora em `layout/shell` (rota `''`) e o `/login` renderiza fora dele.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
