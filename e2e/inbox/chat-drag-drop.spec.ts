/**
 * P40 — E2E: Drag-drop no compositor de mensagens
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Chat — Drag and Drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/inbox');
  });

  test('1 — drag de PNG para o textarea → preview de upload aparece', async ({ page }) => {
    const textarea = page.locator('[data-testid="chat-textarea"]');
    await expect(textarea).toBeVisible();

    // Simula dragover + drop com arquivo via DataTransfer
    const buffer = Buffer.from('PNG\r\n\x1a\n', 'binary');
    await page.evaluate((base64) => {
      const textarea = document.querySelector('[data-testid="chat-textarea"]');
      if (!textarea) return;
      const dt = new DataTransfer();
      const file = new File([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], 'test.png', { type: 'image/png' });
      dt.items.add(file);
      textarea.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
      textarea.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    }, buffer.toString('base64'));

    const preview = page.locator('[data-testid="attachment-preview"]');
    await expect(preview).toBeVisible({ timeout: 3000 });
  });

  test('2 — drop de PDF → nome do arquivo aparece na fila', async ({ page }) => {
    await page.evaluate(() => {
      const textarea = document.querySelector('[data-testid="chat-textarea"]');
      if (!textarea) return;
      const dt = new DataTransfer();
      const file = new File(['%PDF-1.4'], 'documento.pdf', { type: 'application/pdf' });
      dt.items.add(file);
      textarea.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
      textarea.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    });

    const queueItem = page.locator('[data-testid="queue-file-name"]');
    await expect(queueItem).toContainText('documento.pdf', { timeout: 3000 });
  });

  test('3 — drop enquanto isSending=true → toast de aviso; arquivo não enfileirado', async ({ page }) => {
    // Coloca o componente em estado de envio
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('zapp:set-sending-state', { detail: { isSending: true } }));
    });

    await page.evaluate(() => {
      const textarea = document.querySelector('[data-testid="chat-textarea"]');
      if (!textarea) return;
      const dt = new DataTransfer();
      const file = new File(['data'], 'blocked.png', { type: 'image/png' });
      dt.items.add(file);
      textarea.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    });

    const toast = page.locator('[data-testid="toast"]');
    await expect(toast).toBeVisible({ timeout: 2000 });
    const preview = page.locator('[data-testid="attachment-preview"]');
    await expect(preview).not.toBeVisible({ timeout: 1000 });
  });
});
