/**
 * Ambiente DEV (default). Substituído por environment.prod.ts na build de produção
 * (fileReplacements em angular.json).
 *
 * `apiBaseUrl` — base do back (SPEC-M0 §3.5). Nunca conter segredo (FC-15): só a URL pública.
 */
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8080/api/v1',
};
