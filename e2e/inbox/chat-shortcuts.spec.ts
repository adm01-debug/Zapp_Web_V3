/**
 * P41 — E2E: Atalhos de teclado no compositor
 * Cobre: ArrowUp, Enter, Shift+Enter
 */
import { test, expect } from '@playwright/test';

test.describe('Chat — Atalhos de teclado', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/inbox');
  });

  test('1 — ArrowUp com campo vazio → modo edição ativado na última msg própria', async ({ page }) => {
    const textarea = page.locator('[data-testid="chat-textarea"]');
    await textarea.click();
    // Garante que está vazio
    await textarea.fill('');
    await textarea.press('ArrowUp');
    // Modo de edição: um elemento de edição deve aparecer
    const editingIndicator = page.locator('[data-testid="editing-message-indicator"]');
    await expect(editingIndicator).toBeVisible({ timeout: 2000 });
  });

  test('2 — Enter com texto → mensagem enviada', async ({ page }) => {
    const textarea = page.locator('[data-testid="chat-textarea"]');
    await textarea.fill('Mensagem de teste E2E');
    await textarea.press('Enter');
    // O campo deve ser limpo após o envio
    await expect(textarea).toHaveValue('', { timeout: 2000 });
  });

  test('3 — Shift+Enter → nova linha inserida (NÃO envia)', async ({ page }) => {
    const textarea = page.locator('[data-testid="chat-textarea"]');
    await textarea.fill('linha 1');
    await textarea.press('Shift+Enter');
    // Textarea deve ter 2 linhas
    const value = await textarea.inputValue();
    expect(value).toContain('\n');
    // Campo não foi limpo (msg não foi enviada)
    await expect(textarea).not.toHaveValue('', { timeout: 500 });
  });
});
