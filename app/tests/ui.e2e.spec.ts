import { test, expect } from '@playwright/test';

test.describe('German Legal Agent UI', () => {
  test('should display correct German Legal Agent interface', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    
    // Check page title
    await expect(page).toHaveTitle('German Legal Agent');
    
    // Check main header
    await expect(page.locator('header')).toContainText('German Legal Agent');
    
    // Check input placeholder
    const input = page.locator('input[placeholder="Ask about German laws, regulations, or legal concepts..."]');
    await expect(input).toBeVisible();
    
    // Check MCP Logs section
    await expect(page.locator('aside')).toContainText('MCP Logs');
    await expect(page.locator('aside')).toContainText('No MCP activity yet');
    
    // Check provider selector
    await expect(page.locator('select')).toContainText('Ollama');
    await expect(page.locator('select')).toContainText('OpenRouter');
    
    // Check model input
    const modelInput = page.locator('input[placeholder="qwen3:8b"]');
    await expect(modelInput).toBeVisible();
    
    // Test typing in the input
    await input.fill('What is the AGG law about?');
    await expect(input).toHaveValue('What is the AGG law about?');
    
    // Check send button
    const sendButton = page.locator('button[type="submit"]');
    await expect(sendButton).toContainText('Send');
    await expect(sendButton).toBeEnabled();
    
    // Take screenshot for verification
    await page.screenshot({ path: '/tmp/legal-agent-ui.png', fullPage: true });
    
    console.log('✅ German Legal Agent UI elements verified successfully');
  });

  test('should handle form submission', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    
    const input = page.locator('input[placeholder="Ask about German laws, regulations, or legal concepts..."]');
    const sendButton = page.locator('button[type="submit"]');
    
    // Fill input and submit
    await input.fill('Test legal query');
    await sendButton.click();
    
    // Check that input is cleared after submission
    await expect(input).toHaveValue('');
    
    // Check that streaming indicator appears
    await expect(page.locator('div:has-text("…")')).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Form submission working correctly');
  });

  test('should show user message in chat', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    
    const input = page.locator('input[placeholder="Ask about German laws, regulations, or legal concepts..."]');
    
    await input.fill('What are working time regulations?');
    await page.keyboard.press('Enter');
    
    // Wait for user message to appear
    await expect(page.locator('div:has-text("user")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('div:has-text("What are working time regulations?")')).toBeVisible();
    
    console.log('✅ User messages displayed correctly');
  });
});