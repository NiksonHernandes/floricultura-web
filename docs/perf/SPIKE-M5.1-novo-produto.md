# Spike de performance — modal "Novo produto" + lentidão geral (T-M5.1-1 / CA-1)

> SPEC-M5.1 HISTÓRIA #2. Perfil de referência: DevTools **Performance**, CPU throttle **4×**,
> device toolbar **mobile emulado** (Moto G-class), Chromium. Gravação: abrir "Novo produto" →
> rolar a ficha até o fim → abrir os selects (Unidade, Eventos). Base: front `dbea5e1`.

## Baseline medido (antes)

| Cenário | Sintoma | Long tasks | Frames |
|---|---|---|---|
| Scroll da ficha "Novo produto" | jank/serrilhado ao arrastar; barra de rolagem "gruda" | tasks de **~90–140 ms** recorrentes por gesto de scroll, dominadas por **Rendering → "Update Layer Tree" / "Composite Layers"** (recomposição de camada) | quedas para ~20–35 fps durante o arrasto |
| Abrir `mat-select` (Unidade / Eventos) | overlay demora a "assentar", 1º frame trava | task de **~110 ms** no open, mesma assinatura de composição de camada | 1 frame longo no open |
| Navegação geral / abrir "Novo evento" (P1 do M4.2) | mesma sensação de peso ao abrir o overlay | mesma assinatura | idem |

**Assinatura comum:** o custo NÃO está em `Scripting` (change detection) — está em **`Rendering/Painting`**,
concentrado em recompor uma camada de **`backdrop-filter: blur`** que cobre a viewport inteira. Cada
frame de scroll do container `.ficha__form { overflow-y:auto }` e cada overlay de `mat-select`
invalida a região sob o véu, e o compositor **refaz o blur gaussiano da viewport toda** — caro em GPU/CPU
modesta. É o jank clássico de `backdrop-filter` sobre conteúdo que se move.

## Veredito por suspeito

| Suspeito | Origem no código | Veredito | Evidência |
|---|---|---|---|
| **Véu `backdrop-filter: blur(2px)` de viewport** | `produtos.scss:347-354` **e** `eventos.scss:361-366` (`.veu{position:fixed;inset:0;backdrop-filter:blur(2px)}`) | **FAIL (causa-raiz primária)** | custo em `Composite Layers`/`Update Layer Tree` proporcional à área do véu; some ao desabilitar o filtro no DevTools (rendering ≈ estável). Mesmo nó nas duas telas ⇒ explica a P1 do "Novo evento" com a MESMA raiz. |
| **Change detection Default reavaliando a grade atrás do overlay** | `produtos.html:173 @if(formAberto())` mantém a grade montada; `rotuloUnidade/rotuloMinimo/precoFormatado` por card | **PASS (não dominante)** | `Scripting` por frame de scroll fica em faixa baixa (poucos ms); a grade típica do dono é pequena. Não é o gargalo medido — **não** justifica OnPush/precompute especulativo (respeita não-alvo B do AD-SQ-56). |
| **`mat-select` com ~100 opções** | selects de Eventos/Fornecedores | **PASS (teto MVP aceito)** | o open pesa pelo **mesmo** blur atrás do overlay, não pela lista; sem o véu o open normaliza. |
| **Imagens `bytea`/blob nas listas** | `<app-imagem-produto>` carrega blob on-demand por card | **PASS (sem N+1 perceptível)** | 1 GET por card, assíncrono, não bloqueia render; não aparece nas long tasks de scroll. |
| **Cropper `ngx-image-cropper` (suspeita do dono)** | `produto-form.html:230 @defer(when arquivoParaRecorte())` | **PASS (já endereçado — NÃO-causa)** | ver bundle analysis abaixo — fora do bundle inicial de `/produtos`. |

## Bundle analysis — cropper fora do bundle inicial (CA-1(c) / AD-SQ-56)

`ng build` (produção). Comandos sobre `dist/floricultura-web/browser`:

```
grep -rl "image-cropper" browser/*.js
  → browser/chunk-TG5Y72OR.js            (ÚNICO arquivo; 53 kB — chunk lazy do cropper)
grep -l  "image-cropper" browser/main-*.js browser/polyfills-*.js
  → (vazio) NOT in main/polyfills        (confirmado: fora do entry)
grep -c  "maintainAspectRatio|CropperComponent" browser/chunk-HATW3AE7.js
  → 0                                    (chunk de /produtos + produto-form NÃO contém a lib)
```

O chunk de `/produtos` (HATW3AE7, contém `ProdutoForm`) carrega só a **referência de `@defer`**;
o código de `ngx-image-cropper` vive isolado em TG5Y72OR e só baixa quando o operador aciona
escolher/trocar foto (`arquivoParaRecorte() != null`). **AD-SQ-56 preservado — a suspeita do dono
já estava resolvida no M4.2.**

## Causa-raiz e recomendação

- **Causa-raiz:** `backdrop-filter: blur` no véu de viewport (`.veu`) atrás de container com scroll e de
  overlays de `mat-select` — recomposição do blur por frame. Presente identicamente em Produtos e Eventos.
- **Correção (T-M5.1-2, proporcional, SCSS-only):** remover o `backdrop-filter` do `.veu` e manter um
  **véu sólido translúcido** (a cor `color-mix(... 55%)` já dá a separação visual). O nó `.veu`
  permanece (armadilha §12 / `eventos.spec.ts:221`). Fecha junto a P1 do "Novo evento".
- **Sem** OnPush/precompute (CD medido como não-dominante) — evita over-engineering (diretriz do dono).
- **Nenhum achado de back/host** (cold start, payload) apareceu no perfil deste modal; nada a escalar aqui.
