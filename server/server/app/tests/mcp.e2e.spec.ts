import { test, expect } from '@playwright/test';

test.describe('Repair Chat MCP integration', () => {
  test('should call MCP tool and render result', async ({ page }) => {
    // Assume proxy (http://localhost:8787) is already running (Terminal 5) and app dev is started manually if needed.
    // Start the app dev server if not already running:
    // You can run: npm run dev from app/ in another terminal, or adapt to use Vite preview if desired.

    // Try to navigate to dev server default port
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });

    // Send a prompt that should trigger a tool call
    const input = page.locator('input[placeholder="Ask about customers, vehicles, or jobs..."]');
    await input.fill('List all files in the dataset');
    await Promise.all([
      page.waitForTimeout(200), // small delay to avoid race
      page.keyboard.press('Enter'),
    ]);

    // Wait for log indicating tool call attempt or calling banner
    const mcpCalling = page.locator('text=/\\[calling MCP [^\\]]+\\]/');
    await expect(mcpCalling).toBeVisible({ timeout: 15000 });

    // Wait for MCP result to stream into assistant message
    const mcpResult = page.locator('text=/\\[MCP list_files result\\]/');
    await expect(mcpResult).toBeVisible({ timeout: 15000 });

    // Verify JSON appears (we return text content with JSON string)
    const assistant = page.locator('div', { hasText: '"files"' }).first();
    await expect(assistant).toBeVisible();
  });
});
