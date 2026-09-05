import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const UI_DIR = './src/components/ui';
const OUTPUT_FILE = './src/components/ui/registry.json';

function extractVariants(content: string) {
  const variantsMatch = content.match(/variants:\s*{([\s\S]*?)}\s*,\s*defaultVariants/);
  if (!variantsMatch) return null;

  const variantsStr = variantsMatch[1];
  const variantObj: Record<string, string[]> = {};

  // Simple regex to find keys and their subkeys
  const variantSections = variantsStr.split(/\n\s*([a-zA-Z0-9]+):\s*{/);
  for (let i = 1; i < variantSections.length; i += 2) {
    const name = variantSections[i];
    const subkeysStr = variantSections[i+1];
    const subkeys = subkeysStr.match(/[a-zA-Z0-9]+(?=:)/g) || [];
    variantObj[name] = subkeys;
  }

  return variantObj;
}

export interface RegistryEntry {
  name: string;
  variants: Record<string, string[]> | null;
}

// readdirSync não garante ordem estável entre SOs/filesystems — sem o sort,
// cada ambiente (CI vs local) produz uma ordem de chaves diferente no JSON,
// gerando diff só de reordenação a cada rebuild.
export function sortedUiFiles(dirEntries: string[]): string[] {
  return [...dirEntries].sort();
}

export function buildRegistry(dir: string): Record<string, RegistryEntry> {
  const registry: Record<string, RegistryEntry> = {};
  const files = sortedUiFiles(readdirSync(dir));
  for (const file of files) {
    if (file.endsWith('.tsx')) {
      const content = readFileSync(join(dir, file), 'utf-8');
      const variants = extractVariants(content);
      if (variants) {
        registry[file.replace('.tsx', '')] = {
          name: file.replace('.tsx', ''),
          variants
        };
      }
    }
  }
  return registry;
}

if (import.meta.main) {
  const registry = buildRegistry(UI_DIR);
  writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2));
  console.log(`✅ Component registry generated at ${OUTPUT_FILE}`);
}
