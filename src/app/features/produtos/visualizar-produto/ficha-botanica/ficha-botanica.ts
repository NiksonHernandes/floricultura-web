import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { formatarAltura } from '../../produto-form/atributos-botanicos/atributos-botanicos';
import {
  Caracteristica,
  CorReferencia,
  NecessidadeLuz,
  Produto,
  Toxicidade,
} from '../../../../core/models/produto.model';

/**
 * Rótulos pt-BR dos escalares — os MESMOS textos das `mat-option` do cadastro (T-M6-09a, §3.12):
 * o operador cadastra "Adulta" e lê "Adulta". Um só vocabulário para o mesmo dado.
 */
const ROTULOS_CARACTERISTICA: Readonly<Record<Caracteristica, string>> = {
  MUDA: 'Muda',
  JOVEM: 'Jovem',
  ADULTA: 'Adulta',
};

const ROTULOS_TOXICIDADE: Readonly<Record<Toxicidade, string>> = {
  TOXICA: 'Tóxica',
  NAO_TOXICA: 'Não tóxica',
};

const ROTULOS_LUZ: Readonly<Record<NecessidadeLuz, string>> = {
  SOL_PLENO: 'Sol pleno',
  MEIA_SOMBRA: 'Meia-sombra',
  SOMBRA: 'Sombra',
};

/**
 * Seção "Ficha botânica" do modal "Visualizar produto" (SPEC-M6 §3.12/CA-34) — SOMENTE LEITURA.
 *
 * Exibe os 5 atributos que `GET /produtos/{id}` devolve: cores (pastilha de tinta + nome canônico),
 * característica, altura (R16), toxicidade e necessidade de luz. Todos são OPCIONAIS (R7): o que
 * não veio **não vira linha** — nem "—", nem valor default. A toxicidade é TRI-ESTADO (R8): a
 * ausência é "não informado" e **não** é "Não tóxica"; por isso ela só aparece com valor. Sem
 * nenhum atributo, a seção inteira não é renderizada.
 *
 * Componente próprio (não inline no `visualizar-produto`) por duas razões: o `visualizar-produto.scss`
 * é um dos 7 arquivos que o CA-43/§10 #35 exige **idênticos a `develop`** (diff vazio), e o orçamento
 * de CSS é por arquivo (§9 regra 2). O host é `display: contents`: quando não há ficha, nada ocupa
 * espaço no fluxo do `.ficha__corpo`.
 */
@Component({
  selector: 'app-ficha-botanica',
  imports: [MatIconModule],
  templateUrl: './ficha-botanica.html',
  styleUrl: './ficha-botanica.scss',
})
export class FichaBotanica {
  /** Produto do detalhe (`GET /produtos/{id}`) — só ali as coleções vêm preenchidas (R11). */
  readonly produto = input.required<Produto>();

  /** Cores vinculadas; `null` (lista) e `[]` (detalhe sem cor) dão no mesmo: sem linha. */
  protected readonly cores = computed<CorReferencia[]>(() => this.produto().cores ?? []);

  protected readonly caracteristica = computed<string | null>(() => {
    const c = this.produto().caracteristica;
    return c ? (ROTULOS_CARACTERISTICA[c] ?? c) : null;
  });

  /** R16: `>= 100 cm` em metros pt-BR com 2 casas, abaixo disso em cm. Reusa o utilitário da 09a. */
  protected readonly altura = computed<string | null>(() => {
    const cm = this.produto().alturaCm;
    return cm === null || cm === undefined ? null : formatarAltura(cm);
  });

  /** Tri-estado (R8): `null`/ausente = não informado ⇒ devolve `null` e a linha não existe. */
  protected readonly toxicidade = computed<string | null>(() => {
    const t = this.produto().toxicidade;
    return t ? (ROTULOS_TOXICIDADE[t] ?? t) : null;
  });

  /** Lista de condições separada por "·" (§3.12); string vazia = nada a exibir. */
  protected readonly luz = computed<string>(() =>
    (this.produto().necessidadeLuz ?? []).map((l) => ROTULOS_LUZ[l] ?? l).join(' · '),
  );

  /** Ao menos um atributo preenchido — sem isso a seção não é renderizada (CA-34). */
  protected readonly temFicha = computed<boolean>(
    () =>
      this.cores().length > 0 ||
      this.caracteristica() !== null ||
      this.altura() !== null ||
      this.toxicidade() !== null ||
      this.luz().length > 0,
  );
}
