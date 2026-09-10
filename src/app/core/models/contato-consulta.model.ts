/**
 * Filtros e ordenação das listas de CONTATO — clientes **e** fornecedores (SPEC-M6 §3.7, T-M6-08a).
 *
 * O contrato do back é IDÊNTICO nos dois cadastros (D3: nenhum campo novo), então o tipo mora aqui,
 * em `core/models`, e não dentro de uma das duas features: a T-M6-08b o declarou em
 * `clientes.service.ts` e a T-M6-08c (o espelho de Fornecedores) o promoveu para cá — em vez de
 * duplicar as três declarações ou fazer Fornecedores importar da feature Clientes.
 * `clientes.service.ts` **re-exporta** os três nomes, então a API pública entregue pela 08b segue
 * válida (nenhum import existente muda).
 */

/** Campo de ordenação aceito pelo back em `GET /clientes` e `GET /fornecedores` (§3.7). */
export type OrdemContato = 'nome' | 'telefone' | 'email';

/** Direção da ordenação (§3.7; default `asc`). */
export type DirecaoOrdem = 'asc' | 'desc';

/**
 * `comTelefone`/`comEmail` são TRI-ESTADO: `null`/ausente = sem filtro · `true` = tem ·
 * `false` = **não** tem (nulo ou vazio após trim, R25). Vai como 4º argumento OPCIONAL de
 * `listar` de propósito: a assinatura posicional `(pagina, tamanho, nome?)` do M5 continua
 * válida para os chamadores que não filtram (`movimentar-estoque`, `produto-form`, testes herdados).
 */
export interface ContatoConsulta {
  comTelefone?: boolean | null;
  comEmail?: boolean | null;
  ordenarPor?: OrdemContato;
  direcao?: DirecaoOrdem;
}
