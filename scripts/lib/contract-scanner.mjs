/**
 * Scanner estrutural compartilhado pelos guards de contrato
 * (check-contract-parity, check-api-contract-guard).
 *
 * Extrai `export const X = { ... }` e fatia as entradas de nível 1 por
 * profundidade de `{}`, ignorando strings e comentários — sem eval,
 * sem regex com backtracking (Sonar S1523/S8786).
 */

/** Extrai o bloco {...} de uma `export const X = {...}` e retorna o body. */
export function extractObjectBody(src, exportName) {
  const start = src.indexOf(`export const ${exportName}`);
  if (start < 0) throw new Error(`${exportName} não encontrado`);
  const braceStart = src.indexOf("{", src.indexOf("=", start));
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(braceStart + 1, i);
}

/**
 * Retorna o índice do `}` que fecha o `{` em `openBrace`, pulando strings,
 * template literals e comentários. Sem isso o contador ingênuo encerrava o
 * valor no primeiro `}` dentro de literal/comentário — os contratos
 * seguintes sumiam da varredura (achado do Devin Review). Retorna -1 se
 * não houver fechamento.
 */
function matchBrace(body, openBrace) {
  let d = 0;
  for (let k = openBrace; k < body.length; k++) {
    const c = body[k];
    if (c === '"' || c === "'" || c === "`") {
      const q = c; k++;
      while (k < body.length && body[k] !== q) { if (body[k] === "\\") { k += 2; continue; } k++; }
      continue;
    }
    if (c === "/" && body[k + 1] === "/") { while (k < body.length && body[k] !== "\n") k++; continue; }
    if (c === "/" && body[k + 1] === "*") { k += 2; while (k < body.length && !(body[k] === "*" && body[k + 1] === "/")) k++; k += 2; continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return k; }
  }
  return -1;
}

/**
 * Mapa chave → valor de cada entrada de nível 1 do body {...}.
 * `mapValue(inner)` recebe o texto interno do valor {...} e define o
 * valor armazenado; default: o próprio texto (ou "" para valor não-objeto).
 */
export function entryInners(body, mapValue = (inner) => inner) {
  const entries = {};
  let depth = 0, i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c; let str = ""; i++;
      while (i < body.length && body[i] !== q) { if (body[i] === "\\") { str += body[i + 1]; i += 2; continue; } str += body[i]; i++; }
      i++;
      if (depth === 0) {
        let j = i; while (body[j] === " " || body[j] === "\t") j++;
        if (body[j] === ":") {
          j++; while (body[j] === " " || body[j] === "\t" || body[j] === "\n") j++;
          if (body[j] === "{") {
            const k = matchBrace(body, j);
            entries[str] = mapValue(k < 0 ? body.slice(j + 1) : body.slice(j + 1, k));
            i = k < 0 ? body.length : k + 1;
          } else {
            entries[str] = mapValue(null);
          }
        }
      }
      continue;
    }
    if (c === "/" && body[i + 1] === "/") { while (i < body.length && body[i] !== "\n") i++; continue; }
    if (c === "/" && body[i + 1] === "*") { i += 2; while (i < body.length && !(body[i] === "*" && body[i + 1] === "/")) i++; i += 2; continue; }
    // Chave sem aspas (foo: {...}): identificador JS válido seguido de ':'.
    // Sem isso o scanner era cego a contratos declarados sem aspas (achado
    // MEDIO da validação 5-agentes — bypass silencioso dos guards).
    if (depth === 0 && /[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < body.length && /[A-Za-z0-9_$]/.test(body[j])) j++;
      let k = j;
      while (body[k] === " " || body[k] === "\t" || body[k] === "\n") k++;
      if (body[k] === ":") {
        const key = body.slice(i, j);
        k++;
        while (body[k] === " " || body[k] === "\t" || body[k] === "\n") k++;
        if (body[k] === "{") {
          const openBrace = k;
          const close = matchBrace(body, openBrace);
          entries[key] = mapValue(close < 0 ? body.slice(openBrace + 1) : body.slice(openBrace + 1, close));
          i = close < 0 ? body.length : close + 1;
        } else {
          entries[key] = mapValue(null);
          i = k;
        }
        continue;
      }
      i = j;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return entries;
}

/** Remove comentários // e /** *\/ preservando strings. */
export function stripComments(src) {
  let out = "", i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out += c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === "\\") { out += src.slice(i, i + 2); i += 2; continue; } out += src[i]; i++; }
      if (i < src.length) { out += src[i]; i++; }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

/** CONTRACTS (contract-versions.ts) → { key: { current, supported, sunset } } */
export function parseContractsBody(body) {
  const entries = entryInners(body);
  const out = {};
  for (const [key, inner] of Object.entries(entries)) {
    const current = inner.match(/\bcurrent:\s*"([^"]+)"/)?.[1] ?? null;
    const supSrc = inner.match(/\bsupported:\s*\[([^\]]*)\]/)?.[1] ?? "";
    const supported = [...supSrc.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const sunset = {};
    const sunsetSrc = inner.match(/\bsunset:\s*\{([^}]*)\}/)?.[1];
    if (sunsetSrc) {
      // parse por chunk: sem regex com backtracking (S8786); comentários
      // antes/entre entradas são removidos antes do split (Devin Review)
      for (const chunk of stripComments(sunsetSrc).split(",")) {
        const kv = chunk.match(/^\s*([A-Za-z0-9_]+)\s*:\s*"([^"]+)"\s*$/);
        if (kv) sunset[kv[1]] = kv[2];
      }
    }
    out[key] = { current, supported, sunset };
  }
  return out;
}
