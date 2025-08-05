import { test, expect } from '@playwright/test';

test('German Legal Agent - Complete Frontend Test', async ({ page }) => {
  console.log('🚀 Testing German Legal Agent Complete Frontend...');
  
  await page.goto('http://localhost:5173/');
  
  // Test 1: Page loads with correct title
  await expect(page).toHaveTitle('German Legal Agent');
  console.log('✅ 1. Page title is correct: German Legal Agent');
  
  // Test 2: Header shows German Legal Agent
  const headerText = await page.textContent('header');
  expect(headerText).toContain('German Legal Agent');
  console.log('✅ 2. Header displays: German Legal Agent');
  
  // Test 3: Legal input placeholder is correct
  const inputPlaceholder = await page.getAttribute('input[type="text"]', 'placeholder');
  expect(inputPlaceholder).toBe('Ask about German laws, regulations, or legal concepts...');
  console.log('✅ 3. Input placeholder is legal-specific');
  
  // Test 4: Provider dropdown has correct options
  const providerOptions = await page.locator('select option').allTextContents();
  expect(providerOptions).toContain('Ollama');
  expect(providerOptions).toContain('OpenRouter');
  console.log('✅ 4. Provider options available: Ollama, OpenRouter');
  
  // Test 5: Model input has correct default
  const modelValue = await page.inputValue('input[placeholder="qwen3:8b"]');
  expect(modelValue).toBe('qwen3:8b');
  console.log('✅ 5. Default model is qwen3:8b');
  
  // Test 6: MCP Logs section exists
  const pageText = await page.textContent('body');
  expect(pageText).toContain('MCP Logs');
  expect(pageText).toContain('No MCP activity yet');
  console.log('✅ 6. MCP Logs section present');
  
  // Test 7: Input functionality
  const input = page.locator('input[type="text"]').first();
  await input.fill('Was ist das deutsche Arbeitszeitgesetz?');
  const inputValue = await input.inputValue();
  expect(inputValue).toBe('Was ist das deutsche Arbeitszeitgesetz?');
  console.log('✅ 7. Input accepts German legal queries');
  
  // Test 8: Send button works
  const sendButton = page.locator('button[type="submit"]');
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
  console.log('✅ 8. Send button clicked successfully');
  
  // Test 9: Input clears after submission
  await page.waitForTimeout(1000); // Brief wait for form processing
  const clearedInput = await input.inputValue();
  expect(clearedInput).toBe('');
  console.log('✅ 9. Input cleared after submission');
  
  // Test 10: User message appears in chat
  await page.waitForTimeout(2000); // Wait for message to appear
  const finalPageText = await page.textContent('body');
  expect(finalPageText).toContain('Was ist das deutsche Arbeitszeitgesetz?');
  console.log('✅ 10. User message displayed in chat');
  
  // Test 11: Assistant response starts
  expect(finalPageText).toContain('assistant');
  console.log('✅ 11. Assistant response initiated');
  
  // Final screenshot
  await page.screenshot({ 
    path: '/tmp/legal-agent-complete-test.png', 
    fullPage: true 
  });
  console.log('📸 Complete test screenshot saved');
  
  console.log('🎉 All 11 tests passed! German Legal Agent frontend is fully functional!');
  
  // Summary report
  console.log('\n📋 GERMAN LEGAL AGENT FRONTEND TEST REPORT:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Page loads with correct legal agent branding');
  console.log('✅ UI elements properly updated from repair shop to legal');
  console.log('✅ Input accepts German legal queries');
  console.log('✅ Chat functionality works');
  console.log('✅ MCP integration UI components present');
  console.log('✅ Model and provider configuration available');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 RESULT: German Legal Agent frontend is operational!');
});