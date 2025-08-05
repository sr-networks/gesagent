import { test, expect } from '@playwright/test';

test('German Legal Agent - Basic UI Verification', async ({ page }) => {
  console.log('🧪 Testing German Legal Agent Frontend...');
  
  await page.goto('http://localhost:5173/');
  
  // Verify page title
  await expect(page).toHaveTitle('German Legal Agent');
  console.log('✅ Page title: German Legal Agent');
  
  // Verify main header
  const header = page.locator('strong:has-text("German Legal Agent")');
  await expect(header).toBeVisible();
  console.log('✅ Main header: German Legal Agent');
  
  // Verify legal input placeholder
  const input = page.locator('input[placeholder="Ask about German laws, regulations, or legal concepts..."]');
  await expect(input).toBeVisible();
  console.log('✅ Input placeholder: Ask about German laws, regulations, or legal concepts...');
  
  // Verify MCP Logs section
  const mcpSection = page.locator('div:has-text("MCP Logs")');
  await expect(mcpSection).toBeVisible();
  console.log('✅ MCP Logs section visible');
  
  // Test input functionality
  await input.fill('Was ist das Arbeitszeitgesetz?');
  await expect(input).toHaveValue('Was ist das Arbeitszeitgesetz?');
  console.log('✅ Input accepts German legal queries');
  
  // Verify send button
  const sendButton = page.locator('button:has-text("Send")');
  await expect(sendButton).toBeVisible();
  await expect(sendButton).toBeEnabled();
  console.log('✅ Send button visible and enabled');
  
  // Submit form and verify user message appears
  await sendButton.click();
  
  // Wait for user message bubble
  await page.waitForSelector('div:has-text("user")', { timeout: 5000 });
  console.log('✅ User message displayed in chat');
  
  // Verify input is cleared
  await expect(input).toHaveValue('');
  console.log('✅ Input cleared after submission');
  
  // Take final screenshot
  await page.screenshot({ 
    path: '/tmp/legal-agent-test-final.png', 
    fullPage: true 
  });
  console.log('📸 Screenshot saved: /tmp/legal-agent-test-final.png');
  
  console.log('🎉 German Legal Agent frontend test completed successfully!');
});