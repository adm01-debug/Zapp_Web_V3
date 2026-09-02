#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function requireJsonObject(raw, label) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label}: JSON inválido (${error.message})`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label}: package.json deve ser um objeto JSON`);
  }

  return parsed;
}

export function normalizePackageJsonInput(raw) {
  let direct;
  let directError;
  try {
    direct = JSON.parse(raw);
  } catch (error) {
    directError = error;
  }

  if (!directError) {
    if (direct === null || typeof direct !== 'object' || Array.isArray(direct)) {
      throw new Error('entrada direta: package.json deve ser um objeto JSON');
    }
    return JSON.stringify(direct);
  }

  const compact = raw.replace(/\s/g, '');
  const validAlphabet = /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
  const validLength = compact.length > 0 && compact.length % 4 !== 1;
  if (!validAlphabet || !validLength) {
    throw new Error(`entrada não é JSON nem base64 válido (${directError.message})`);
  }

  let decoded;
  try {
    decoded = Buffer.from(compact, 'base64').toString('utf8');
  } catch (error) {
    throw new Error(`base64 inválido (${error.message})`);
  }

  return JSON.stringify(requireJsonObject(decoded, 'entrada base64'));
}

function run() {
  const raw = readFileSync(0, 'utf8');
  process.stdout.write(`${normalizePackageJsonInput(raw)}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    run();
  } catch (error) {
    console.error(`package.json base não confiável: ${error.message}`);
    process.exitCode = 1;
  }
}
