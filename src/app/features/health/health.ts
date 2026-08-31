import { Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ApiService } from '../../core/services/api.service';

/**
 * Prova de consumo do envelope (SPEC-M0 §3.1/§3.5, CA-5): chama GET /api/v1/health-check
 * e exibe o `data.status` retornado pelo back. Sem regra de negócio — é o smoke de integração.
 */
@Component({
  selector: 'app-health',
  imports: [MatCardModule, MatProgressSpinnerModule, MatButtonModule, MatIconModule],
  templateUrl: './health.html',
  styleUrl: './health.scss',
})
export class Health implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly loading = signal(false);
  protected readonly status = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.check();
  }

  check(): void {
    this.loading.set(true);
    this.status.set(null);
    this.error.set(null);

    this.api.healthCheck().subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.success && res.data) {
          this.status.set(res.data.status);
        } else {
          this.error.set(res.error?.message ?? 'Resposta sem status.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Falha ao contatar a API. Verifique se o back está no ar.');
      },
    });
  }
}
