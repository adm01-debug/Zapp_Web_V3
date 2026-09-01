/**
 * P42 — E2E: AI streaming no painel de chat
 * Cobre AIResponseCard, ChatShimmer, stick-to-bottom
 */
import { test, expect } from '@playwright/test';

test.describe('Chat — AI streaming', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/inbox');
  });

  test('1 — ativar AI → AIResponseCard aparece com ChatShimmer (loading)', async ({ page }) => {
    // Aciona o painel de AI (botão ou atalho)
    const aiButton = page.locator('[data-testid="ai-assistant-button"]');
    await aiButton.click();
    // Durante o streaming, shimmer deve aparecer
    const shimmer = page.locator('[data-testid="chat-shimmer"]');
    await expect(shimmer).toBeVisible({ timeout: 3000 });
  });

  test('2 — stream termina → conteúdo completo renderizado no AIResponseCard', async ({ page }) => {
    const aiButton = page.locator('[data-testid="ai-assistant-button"]');
    await aiButton.click();
    // Aguarda shimmer desaparecer e conteúdo aparecer
    const shimmer = page.locator('[data-testid="chat-shimmer"]');
    await expect(shimmer).not.toBeVisible({ timeout: 15000 });
    const card = page.locator('[data-testid="ai-response-card"]');
    await expect(card).toBeVisible();
    await expect(card).not.toBeEmpty();
  });

  test('3 — scroll para cima durante stream → botão stick-to-bottom aparece', async ({ page }) => {
    const aiButton = page.locator('[data-testid="ai-assistant-button"]');
    await aiButton.click();
    // Scroll para cima durante streaming
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-testid="ai-stream-scroller"]');
      if (scroller) scroller.scrollTop = 0;
    });
    const stickyBtn = page.locator('[data-testid="stick-to-bottom-button"]');
    await expect(stickyBtn).toBeVisible({ timeout: 2000 });
  });

  test('4 — clicar stick-to-bottom → volta ao fim do stream', async ({ page }) => {
    const aiButton = page.locator('[data-testid="ai-assistant-button"]');
    await aiButton.click();
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-testid="ai-stream-scroller"]');
      if (scroller) scroller.scrollTop = 0;
    });
    const stickyBtn = page.locator('[data-testid="stick-to-bottom-button"]');
    await expect(stickyBtn).toBeVisible({ timeout: 2000 });
    await stickyBtn.click();
    await expect(stickyBtn).not.toBeVisible({ timeout: 2000 });
  });
});
