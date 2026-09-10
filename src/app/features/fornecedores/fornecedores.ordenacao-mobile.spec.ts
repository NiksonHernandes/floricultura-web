import { Fornecedores } from './fornecedores';
import { FornecedoresService } from './fornecedores.service';
import { baterizarOrdenacaoMobile } from '../../shared/testing/ordenacao-mobile.bateria.spec';

/**
 * Ordenação no CELULAR — Fornecedores (T-M6-08d, §3.11.1, CA-41/CA-42, R31). Espelho de Clientes:
 * mesma bateria, mesmo contrato. Dado FICTÍCIO (LGPD): "Flores do Vale", `@exemplo.com.br`.
 */
baterizarOrdenacaoMobile({
  titulo: 'Fornecedores',
  componente: Fornecedores,
  servico: FornecedoresService,
  url: 'http://localhost:8080/api/v1/fornecedores',
  registro: {
    id: 7,
    nome: 'Flores do Vale',
    telefone: '(11) 90000-0000',
    email: 'contato@exemplo.com.br',
    observacoes: 'Entrega às terças e sextas.',
  },
});
