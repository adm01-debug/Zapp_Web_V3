import { writeFileSync } from 'fs';
import { buildRegistry } from './lib/registryBuilder';

const UI_DIR = './src/components/ui';
const OUTPUT_FILE = './src/components/ui/registry.json';

const registry = buildRegistry(UI_DIR);

writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2));
console.log(`✅ Component registry generated at ${OUTPUT_FILE}`);
