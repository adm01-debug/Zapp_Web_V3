# Chat UI — Tokens de Design e Contraste WCAG 2.1

**Gerado em:** 2026-08-25 · Origem: `src/styles/tokens.css` (branch `feat/chat-ui-100`)

---

## Tokens de bolha

Os tokens canônicos de bolha de chat são os `--chat-bubble-*` definidos em `:root` e `.dark`.
Os aliases `--chat-sent`/`--chat-received` apontam para `--primary`/`--muted` respectivamente
e são usados em tokens de borda — **não** como background de bolha direto.

### Valores por modo

| Token | Light HSL | Light Hex | Dark HSL | Dark Hex |
|---|---|---|---|---|
| `--chat-bubble-sent` | `221 83% 53%` | `#2463eb` | `221 95% 55%` | `#1f64f9` |
| `--chat-bubble-sent-foreground` | `0 0% 100%` | `#ffffff` | `0 0% 100%` | `#ffffff` |
| `--chat-bubble-received` | `221 15% 95%` | `#f0f2f4` | `0 0% 8%` | `#141414` |
| `--chat-bubble-received-foreground` | `221 20% 15%` | `#1f232e` | `0 0% 98%` | `#fafafa` |

---

## Contraste WCAG 2.1 — Bolhas

Critério mínimo: **4.5:1** (AA — texto normal) · **3.0:1** (AA — texto grande ≥ 18pt/14pt bold)

| Par | Modo | Background | Foreground | Ratio | Status |
|---|---|---|---|---|---|
| sent fg × sent bg | Light | `#2463eb` | `#ffffff` | **5.17:1** | ✅ AA |
| sent fg × sent bg | Dark  | `#1f64f9` | `#ffffff` | **4.94:1** | ✅ AA |
| received fg × received bg | Light | `#f0f2f4` | `#1f232e` | **13.98:1** | ✅ AAA |
| received fg × received bg | Dark  | `#141414` | `#fafafa` | **17.65:1** | ✅ AAA |

Nenhuma violação detectada.

---

## Outros tokens de chat

| Token | Light | Dark | Uso |
|---|---|---|---|
| `--chat-header` | `0 0% 100%` (#fff) | `0 0% 0%` (#000) | Background do header |
| `--chat-input-bg` | `0 0% 100%` (#fff) | `0 0% 0%` (#000) | Background da área de input |
| `--chat-sent` | `var(--primary)` | `var(--primary)` | Alias — borda da bolha enviada |
| `--chat-received` | `var(--muted)` | `var(--muted)` | Alias — borda da bolha recebida |

---

## Metodologia

Cálculo via fórmula WCAG 2.1:

```
L = 0.2126 × R_lin + 0.7152 × G_lin + 0.0722 × B_lin
R_lin = (R/255 ≤ 0.03928) ? R/255/12.92 : ((R/255 + 0.055)/1.055)^2.4
Contrast = (Lbrighter + 0.05) / (Ldarker + 0.05)
```

Verificação independente recomendada: [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
