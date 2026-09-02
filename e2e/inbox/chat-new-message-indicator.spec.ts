/**
 * P38 — E2E: NewMessageIndicator
 * Botão com contagem aparece quando há scroll para cima e chegam novas msgs.
 */
import { test, expect } from '@playwright/test';

test.describe('Chat — NewMessageIndicator', () => {
  test('scroll para cima + nova msg via realtime → botão com contagem aparece', async ({ page }) => {
    await page.goto('/inbox');
    // Scroll para cima para sair do bottom
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-testid="chat-scroller"]');
      if (scroller) scroller.scrollTop = 0;
    });
    // Simula chegada de mensagem via realtime (dispara evento customizado)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('zapp:new-realtime-message', {
        detail: { id: 'rt-001', content: 'Nova mensagem' },
      }));
    });
    const indicator = page.locator('[data-testid="new-message-indicator"]');
    await expect(indicator).toBeVisible({ timeout: 3000 });
    await expect(indicator).toContainText('1');
  });

  test('clicar no botão → scroll vai ao fim → botão desaparece', async ({ page }) => {
    await page.goto('/inbox');
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-testid="chat-scroller"]');
      if (scroller) scroller.scrollTop = 0;
      window.dispatchEvent(new CustomEvent('zapp:new-realtime-message', {
        detail: { id: 'rt-002', content: 'Nova msg 2' },
      }));
    });
    const indicator = page.locator('[data-testid="new-message-indicator"]');
    await expect(indicator).toBeVisible({ timeout: 3000 });
    await indicator.click();
    await expect(indicator).not.toBeVisible({ timeout: 2000 });
  });
});
