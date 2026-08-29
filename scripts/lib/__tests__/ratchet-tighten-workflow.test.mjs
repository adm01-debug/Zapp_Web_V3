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
  const permissionBlocks = workflow.match(/^\s*permissions:\s*$/gm) ?? [];
  const permissionsBlock = blockBetween('permissions:\n', 'concurrency:');
  const permissionEntries = permissionsBlock
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line !== 'permissions:');

  assert.equal(permissionBlocks.length, 1);
  assert.deepEqual(permissionEntries, ['contents: write', 'pull-requests: read']);

  const pushBlock = blockBetween(
    '      - name: Push ratchet branch',
    '      - name: Create PR for tightened baseline',
  );
  const pushCommands = pushBlock.match(/^\s*git push .+$/gm) ?? [];
  const tokenContexts = pushBlock.match(/\$\{\{ [^}]*token[^}]* \}\}/gi) ?? [];

  assert.match(pushBlock, /PUSH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(
    pushBlock,
    /git remote set-url origin "https:\/\/x-access-token:\$\{PUSH_TOKEN\}@github\.com\/\$\{\{ github\.repository \}\}\.git"/,
  );
  assert.deepEqual(tokenContexts, ['${{ github.token }}']);
  assert.deepEqual(pushCommands.map((line) => line.trim()), [
    'git push origin "$BRANCH"',
  ]);
  assert.equal(pushBlock.match(/\$\{PUSH_TOKEN\}/g)?.length, 1);
  assert.doesNotMatch(pushBlock, /secrets\.GH_TOKEN_ACTIONS/);
  assert.doesNotMatch(pushBlock, /\bGH_TOKEN\b/);
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
