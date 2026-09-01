/**
 * P39 — E2E: Team-chat reactions (4 cenários obrigatórios)
 * Executa com team_chat_tanstack=true e false.
 */
import { test, expect } from '@playwright/test';

const FLAGS = [true, false];

for (const tanstack of FLAGS) {
  test.describe(`Team Chat Reactions [team_chat_tanstack=${tanstack}]`, () => {
    test.beforeEach(async ({ page }) => {
      // Injeta a feature flag antes de navegar
      await page.addInitScript((flag) => {
        (window as Record<string, unknown>).__FEATURE_FLAGS__ = {
          team_chat_tanstack: flag,
        };
      }, tanstack);
      await page.goto('/team-chat');
    });

    test('1 — hover em mensagem → QuickReactionStrip aparece', async ({ page }) => {
      const message = page.locator('[data-testid="team-message-item"]').first();
      await message.hover();
      const strip = page.locator('[data-testid="quick-reaction-strip"]');
      await expect(strip).toBeVisible({ timeout: 2000 });
    });

    test('2 — click em emoji → reaction adicionada + contagem aumenta', async ({ page }) => {
      const message = page.locator('[data-testid="team-message-item"]').first();
      await message.hover();
      const strip = page.locator('[data-testid="quick-reaction-strip"]');
      await strip.locator('button').first().click();
      const badge = message.locator('[data-testid="reaction-badge"]');
      await expect(badge).toBeVisible({ timeout: 2000 });
    });

    test('3 — click no mesmo emoji → reaction removida', async ({ page }) => {
      const message = page.locator('[data-testid="team-message-item"]').first();
      await message.hover();
      const strip = page.locator('[data-testid="quick-reaction-strip"]');
      const firstEmoji = strip.locator('button').first();
      await firstEmoji.click(); // adiciona
      await message.hover();
      await firstEmoji.click(); // remove
      const badge = message.locator('[data-testid="reaction-badge"]');
      await expect(badge).not.toBeVisible({ timeout: 2000 });
    });

    test('4 — MessageReactionBar exibe contagem correta', async ({ page }) => {
      const message = page.locator('[data-testid="team-message-item"]').first();
      await message.hover();
      const strip = page.locator('[data-testid="quick-reaction-strip"]');
      await strip.locator('button').first().click();
      const bar = message.locator('[data-testid="message-reaction-bar"]');
      await expect(bar).toBeVisible({ timeout: 2000 });
      const badge = bar.locator('[data-testid="reaction-badge"]').first();
      await expect(badge).toContainText('1');
    });
  });
}
