import { Clientes } from './clientes';
import { ClientesService } from './clientes.service';
import { baterizarOrdenacaoMobile } from '../../shared/testing/ordenacao-mobile.bateria.spec';

/**
 * Ordenação no CELULAR — Clientes (T-M6-08d, §3.11.1, CA-41/CA-42, R31). Arquivo NOVO; os specs
 * herdados seguem intocados. Dado FICTÍCIO (LGPD): "Maria Flores", `@exemplo.com.br`.
 */
baterizarOrdenacaoMobile({
  titulo: 'Clientes',
  componente: Clientes,
  servico: ClientesService,
  url: 'http://localhost:8080/api/v1/clientes',
  registro: {
    id: 7,
    nome: 'Maria Flores',
    telefone: '(11) 90000-0000',
    email: 'maria@exemplo.com.br',
    observacoes: 'Prefere arranjos de outono.',
  },
});
