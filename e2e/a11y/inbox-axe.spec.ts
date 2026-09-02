import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('inbox sem violações críticas de acessibilidade', async ({ page }) => {
  await page.goto('/inbox');
  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === 'critical');
  expect(critical).toHaveLength(0);
});
