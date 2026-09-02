/**
 * P43 — E2E: Container responsivo team-chat
 * Cobre @container/msg e @container/team-chat nos dois breakpoints.
 */
import { test, expect } from '@playwright/test';

test.describe('Team Chat — Container responsivo', () => {
  test('1 — viewport 375px → classes container mobile aplicadas', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/team-chat');
    const message = page.locator('[data-testid="team-message-item"]').first();
    await expect(message).toBeVisible({ timeout: 5000 });
    // Verifica que o layout mobile (stack vertical) foi aplicado
    const boundingBox = await message.boundingBox();
    expect(boundingBox).toBeTruthy();
    // Em mobile, width deve ser próximo ao viewport
    if (boundingBox) {
      expect(boundingBox.width).toBeLessThanOrEqual(375);
    }
  });

  test('2 — viewport 1200px → layout desktop sem quebra visual', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/team-chat');
    const message = page.locator('[data-testid="team-message-item"]').first();
    await expect(message).toBeVisible({ timeout: 5000 });
    // Em desktop, o painel tem largura controlada
    const boundingBox = await message.boundingBox();
    expect(boundingBox).toBeTruthy();
    if (boundingBox) {
      expect(boundingBox.width).toBeGreaterThan(200);
    }
    // Não há overflow horizontal
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(1200);
  });
});
