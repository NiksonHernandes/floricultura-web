import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { ApiService } from './api.service';
import { ApiResponse } from '../models/api-response.model';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  const HEALTH_URL = 'http://localhost:8080/api/v1/health-check';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('healthCheck() consome GET no apiBaseUrl e devolve o envelope de sucesso (data.status === UP)', () => {
    const envelope: ApiResponse<{ status: string }> = {
      success: true,
      data: { status: 'UP' },
      error: null,
      timestamp: '2026-08-31T14:00:00Z',
      path: '/api/v1/health-check',
    };

    let received: ApiResponse<{ status: string }> | undefined;
    service.healthCheck().subscribe((res) => (received = res));

    const req = httpMock.expectOne(HEALTH_URL);
    expect(req.request.method).toBe('GET');
    req.flush(envelope);

    expect(received).toBeDefined();
    expect(received!.success).toBeTrue();
    expect(received!.data?.status).toBe('UP');
    expect(received!.error).toBeNull();
  });
});
