/**
 * P37 — E2E: Jump-to-message
 * Cobre navegação direta por ?msg=<id> na URL do inbox.
 */
import { test, expect } from '@playwright/test';

test.describe('Chat — Jump to message', () => {
  test('?msg=<id_recente> → scroll instantâneo até a mensagem', async ({ page }) => {
    await page.goto('/inbox?msg=recent-msg-id');
    const msg = page.locator('[data-message-id="recent-msg-id"]');
    await expect(msg).toBeVisible({ timeout: 5000 });
  });

  test('?msg=<id_antigo> → carrega chunk paginado e faz scroll', async ({ page }) => {
    await page.goto('/inbox?msg=old-msg-id');
    const msg = page.locator('[data-message-id="old-msg-id"]');
    await expect(msg).toBeVisible({ timeout: 10000 });
  });

  test('?msg=<id> → mensagem com highlight visual ativo', async ({ page }) => {
    await page.goto('/inbox?msg=highlight-msg-id');
    const msg = page.locator('[data-message-id="highlight-msg-id"]');
    await expect(msg).toBeVisible({ timeout: 5000 });
    // Verifica que a classe de highlight foi aplicada
    await expect(msg).toHaveAttribute('data-highlighted', 'true');
  });
});
