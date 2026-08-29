import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflowUrl = new URL(
  '../../../.github/workflows/ratchet-tighten.yml',
  import.meta.url,
);
const workflow = readFileSync(workflowUrl, 'utf8');

const blockBetween = (start, end) => {
  const startIndex = workflow.indexOf(start);
  const endIndex = workflow.indexOf(end, startIndex + start.length);

  assert.notEqual(startIndex, -1, `bloco inicial ausente: ${start}`);
  assert.notEqual(endIndex, -1, `bloco final ausente: ${end}`);

  return workflow.slice(startIndex, endIndex);
};

test('ratchet usa token efêmero com contents:write somente para publicar a branch', () => {
  assert.match(workflow, /^permissions:\n(?:  #.*\n)*  contents: write$/m);

  const pushBlock = blockBetween(
    '      - name: Push ratchet branch',
    '      - name: Create PR for tightened baseline',
  );

  assert.match(pushBlock, /PUSH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(
    pushBlock,
    /git remote set-url origin "https:\/\/x-access-token:\$\{PUSH_TOKEN\}@github\.com\/\$\{\{ github\.repository \}\}\.git"/,
  );
  assert.doesNotMatch(pushBlock, /secrets\.GH_TOKEN_ACTIONS/);
});

test('PAT event-capable continua restrito à governança e criação do PR', () => {
  const checkoutBlock = blockBetween(
    '      - uses: actions/checkout@v7',
    '      - name: Setup Node',
  );
  const createPrBlock = blockBetween(
    '      - name: Create PR for tightened baseline',
    '      - name: Mark stale bot-owned ratchet PRs',
  );

  assert.doesNotMatch(checkoutBlock, /secrets\.GH_TOKEN_ACTIONS/);
  assert.match(createPrBlock, /GH_TOKEN: \$\{\{ secrets\.GH_TOKEN_ACTIONS \}\}/);
  assert.match(createPrBlock, /gh pr create/);
});
