/**
 * Ambiente PROD. A URL real do back é definida no deploy (env do host) — aqui fica
 * o default relativo/same-origin. Nunca conter segredo (FC-15).
 */
export const environment = {
  production: true,
  apiBaseUrl: '/api/v1',
};
