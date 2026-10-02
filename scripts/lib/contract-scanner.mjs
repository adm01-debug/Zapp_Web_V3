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
            let d = 0, k = j;
            for (; k < body.length; k++) {
              if (body[k] === "{") d++;
              else if (body[k] === "}") { d--; if (d === 0) break; }
            }
            entries[str] = mapValue(body.slice(j + 1, k));
            i = k + 1;
          } else {
            entries[str] = mapValue(null);
          }
        }
      }
      continue;
    }
    if (c === "/" && body[i + 1] === "/") { while (i < body.length && body[i] !== "\n") i++; continue; }
    if (c === "/" && body[i + 1] === "*") { i += 2; while (i < body.length && !(body[i] === "*" && body[i + 1] === "/")) i++; i += 2; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return entries;
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
      // parse por chunk: evita regex com backtracking super-linear (S8786)
      for (const chunk of sunsetSrc.split(",")) {
        const kv = chunk.match(/^\s*([A-Za-z0-9_]+)\s*:\s*"([^"]+)"\s*$/);
        if (kv) sunset[kv[1]] = kv[2];
      }
    }
    out[key] = { current, supported, sunset };
  }
  return out;
}
