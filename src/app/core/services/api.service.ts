import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';

/** Payload do health-check de aplicação (SPEC-M0 §3.3: data: { status: "UP" }). */
export interface HealthStatus {
  status: string;
}

/**
 * ApiService base — ponto único de acesso ao back.
 * Lê a URL de `environment.apiBaseUrl` (dev: http://localhost:8080/api/v1) e devolve
 * sempre o envelope padrão (ApiResponse<T>, SPEC-M0 §3.1/§3.5). Serviços de negócio
 * (M2+) reutilizam esta base.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  /** GET /api/v1/health-check → envelope de sucesso com { status }. */
  healthCheck(): Observable<ApiResponse<HealthStatus>> {
    return this.http.get<ApiResponse<HealthStatus>>(`${this.baseUrl}/health-check`);
  }
}
