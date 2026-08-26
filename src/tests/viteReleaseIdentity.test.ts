import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createVersionPayload, resolveGitSha } from '../../vite.config';

describe('version.json release identity', () => {
  const originalGitSha = process.env.VITE_GIT_SHA;

  beforeEach(() => {
    delete process.env.VITE_GIT_SHA;
  });

  afterEach(() => {
    if (originalGitSha === undefined) delete process.env.VITE_GIT_SHA;
    else process.env.VITE_GIT_SHA = originalGitSha;
  });
  it('binds gitSha and releaseId to the immutable CI revision', () => {
    const gitSha = '0123456789abcdef0123456789abcdef01234567';
    const payload = createVersionPayload('assets/index-release.js', {
      buildId: 'build-123',
      gitSha,
      builtAt: '2026-08-25T12:00:00.000Z',
    });

    expect(payload).toEqual({
      buildId: 'build-123',
      gitSha,
      releaseId: gitSha,
      builtAt: '2026-08-25T12:00:00.000Z',
      entry: 'assets/index-release.js',
    });
  });

  it('preserves a null entry without weakening the release identity', () => {
    const payload = createVersionPayload(null, {
      buildId: 'build-without-entry',
      gitSha: 'abcdef0123456789abcdef0123456789abcdef01',
      builtAt: '2026-08-25T12:00:00.000Z',
    });

    expect(payload.entry).toBeNull();
    expect(payload.releaseId).toBe(payload.gitSha);
    expect(payload.buildId).toBe('build-without-entry');
  });

  it.each([undefined, '', '   '])(
    'uses the explicit dev sentinel when the Git SHA is absent (%s)',
    (value) => {
      expect(resolveGitSha(value)).toBe('dev');
      expect(
        createVersionPayload('assets/index-dev.js', {
          buildId: 'local-build',
          gitSha: value,
          builtAt: '2026-08-25T12:00:00.000Z',
        }),
      ).toMatchObject({ gitSha: 'dev', releaseId: 'dev' });
    },
  );

  it('normalizes accidental whitespace around the injected SHA', () => {
    const gitSha = 'fedcba9876543210fedcba9876543210fedcba98';
    expect(resolveGitSha(`  ${gitSha}\n`)).toBe(gitSha);
  });
});
