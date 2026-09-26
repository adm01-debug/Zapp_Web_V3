/**
 * Guard estático — identificadores declarados DUAS vezes no top-level de um
 * módulo de Edge Function (`supabase/functions/**`).
 *
 * Fundo (regressão real, 26/09/2026): três módulos de `_shared/` passaram a
 * declarar duas vezes o import de `getLogger` e a `const log`:
 *
 *     import { getLogger } from "./logger.ts";
 *     ...
 *     import { getLogger } from "./logger.ts";   // duplicado
 *
 *     const log = getLogger('...');
 *     const log = getLogger('...');              // duplicado
 *
 * Em Deno/ESM isso é `SyntaxError: Identifier 'getLogger' has already been
 * declared` — o módulo não parseia, e como `_shared/` é importado por várias
 * functions, o boot de DUAS Edge Functions inteiras caiu (`evolution-webhook` e
 * `whatsapp-cloud-webhook`). Introduzido por #1542 e #1545 (06/09/2026).
 *
 * Por que este guard existe em vez de só confiar no gate de boot: o
 * `scripts/check-edge-runtime-functions.sh` (Gate 6 do CI) descobre o mesmo
 * defeito, mas sobe um container Docker por function (~minutos). Aqui o mesmo
 * defeito é pego em milissegundos, sem Docker e sem rede, junto da suíte de
 * contrato que o CI já roda (`find supabase/functions -name '*.test.ts'`).
 *
 * Escopo (limites conscientes):
 *  - só linhas que começam na COLUNA 0 (top-level). Duplicata dentro de um
 *    bloco/função é outra classe de erro e não é coberta;
 *  - `import {\n  a,\n} from '...'` (multi-linha) declara os nomes em linhas
 *    indentadas, então NÃO entram na contagem;
 *  - este próprio guard e os demais `*.test.ts`/`*.spec.ts` ficam fora da
 *    varredura (são o detector, não o objeto);
 *  - linhas de comentário (`//`) são ignoradas.
 *
 * Zero falso-positivo verificado nos 320 arquivos de `supabase/functions/`
 * (incluindo `_archive/`): declarar o mesmo nome duas vezes no top-level do
 * mesmo módulo é sempre inválido, logo qualquer acusação aqui é defeito real.
 * O guard NÃO tem allowlist — não existe dívida conhecida desta classe.
 *
 * Rodar:
 *   deno test --allow-read supabase/functions/_shared/__tests__/no-duplicate-top-level-declarations.test.ts
 */
import { assertEquals } from "jsr:@std/assert";

const FUNCTIONS_ROOT = new URL("../../", import.meta.url);

/** `import { a, b as c } from '...'` */
const IMPORT_NAMED = /^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"][^'"]+['"]/;
/** `import Foo from '...'` (com ou sem bindings nomeados na sequência) */
const IMPORT_DEFAULT = /^import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s+['"]/;
/** `import * as ns from '...'` */
const IMPORT_NAMESPACE = /^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]/;
const DECLARATION = /^(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/;
const FUNCTION_DECL = /^(?:export\s+)?(?:declare\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/;
const CLASS_DECL = /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;

const MATCHERS = [IMPORT_NAMESPACE, FUNCTION_DECL, CLASS_DECL, DECLARATION];

async function collectModules(dir: URL, out: string[] = []): Promise<string[]> {
  for await (const entry of Deno.readDir(dir)) {
    // `node_modules` (inclui `node_modules/.deno`, cache de deps das Edge
    // Functions no workspace local) e diretórios ocultos NÃO são código do
    // projeto: as .d.ts de terceiros declaram o mesmo nome várias vezes por
    // design (sobrecarga/namespace) e poluiriam o guard com falso-positivo.
    if (entry.isDirectory && (entry.name === "node_modules" || entry.name.startsWith("."))) {
      continue;
    }
    const child = new URL(`${entry.name}${entry.isDirectory ? "/" : ""}`, dir);
    if (entry.isDirectory) {
      await collectModules(child, out);
    } else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".spec.ts")
    ) {
      out.push(child.pathname);
    }
  }
  return out;
}

/** Identificadores declarados no top-level (coluna 0) do módulo. */
export function topLevelDeclarations(source: string): string[] {
  const names: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (line.length === 0 || line[0] === " " || line[0] === "\t") continue;
    if (line.startsWith("//")) continue;

    const named = IMPORT_NAMED.exec(line);
    if (named) {
      for (const raw of named[1].split(",")) {
        const part = raw.trim();
        if (!part) continue;
        const binding = part.replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
        if (binding) names.push(binding);
      }
      continue;
    }

    const direct = IMPORT_DEFAULT.exec(line);
    if (direct) {
      names.push(direct[1]);
      continue;
    }

    for (const matcher of MATCHERS) {
      const hit = matcher.exec(line);
      if (hit) {
        names.push(hit[1]);
        break;
      }
    }
  }
  return names;
}

Deno.test("nenhum módulo declara o mesmo identificador duas vezes no top-level", async () => {
  const modules = (await collectModules(FUNCTIONS_ROOT)).sort();
  assertEquals(modules.length > 0, true, "nenhum módulo encontrado em supabase/functions/");

  const violations: string[] = [];
  for (const path of modules) {
    const source = await Deno.readTextFile(path);
    const counts = new Map<string, number>();
    for (const name of topLevelDeclarations(source)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const duplicated = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name, count]) => `${name} (${count}x)`)
      .sort();
    if (duplicated.length > 0) {
      violations.push(`${path.replace(FUNCTIONS_ROOT.pathname, "")}: ${duplicated.join(", ")}`);
    }
  }

  assertEquals(
    violations,
    [],
    "declaração duplicada no top-level é SyntaxError e derruba o parse do módulo " +
      "(e o boot de toda Edge Function que o importa). Remova a repetição.",
  );
});
