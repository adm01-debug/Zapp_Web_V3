import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePackageJsonInput } from '../../normalize-package-json-input.mjs';

const packageJson = {
  name: 'zapp-web-v3',
  dependencies: { react: '1.0.0' },
};

test('normaliza um package.json JSON direto', () => {
  assert.deepEqual(
    JSON.parse(normalizePackageJsonInput(JSON.stringify(packageJson, null, 2))),
    packageJson
  );
});

test('aceita o formato legado em base64 somente quando decodifica para objeto JSON', () => {
  const encoded = Buffer.from(JSON.stringify(packageJson)).toString('base64');
  assert.deepEqual(JSON.parse(normalizePackageJsonInput(encoded)), packageJson);
});

test('rejeita JSON truncado em vez de substituí-lo por objeto vazio', () => {
  assert.throws(() => normalizePackageJsonInput('{'), /entrada não é JSON nem base64 válido/);
});

test('rejeita texto ou base64 que não representa JSON', () => {
  assert.throws(
    () => normalizePackageJsonInput('not-base64!'),
    /entrada não é JSON nem base64 válido/
  );
  assert.throws(
    () => normalizePackageJsonInput(Buffer.from('not-json').toString('base64')),
    /entrada base64: JSON inválido/
  );
});

test('rejeita null, arrays e escalares nos formatos direto e base64', () => {
  for (const raw of ['null', '[]', '"value"', '42']) {
    assert.throws(
      () => normalizePackageJsonInput(raw),
      /package.json deve ser um objeto JSON|entrada não é JSON nem base64 válido/
    );
  }

  const encodedArray = Buffer.from('[]').toString('base64');
  assert.throws(
    () => normalizePackageJsonInput(encodedArray),
    /entrada base64: package.json deve ser um objeto JSON/
  );
});
