import { test, expect } from '@playwright/test';

test('German Legal Agent - Basic Verification', async ({ page }) => {
  console.log('🔍 Basic German Legal Agent Verification...');
  
  // Navigate to the app
  await page.goto('http://localhost:5173/');
  console.log('📱 Navigated to http://localhost:5173/');
  
  // Wait for page to fully load
  await page.waitForLoadState('domcontentloaded');
  
  // Get all page text content
  const pageContent = await page.textContent('body');
  
  // Verify key elements are present
  const checks = [
    { name: 'German Legal Agent title', text: 'German Legal Agent' },
    { name: 'Legal input placeholder', text: 'Ask about German laws, regulations, or legal concepts' },
    { name: 'MCP Logs section', text: 'MCP Logs' },
    { name: 'Provider selection', text: 'Provider' },
    { name: 'Model configuration', text: 'Model' },
    { name: 'Send button', text: 'Send' },
    { name: 'Ollama option', text: 'Ollama' },
    { name: 'OpenRouter option', text: 'OpenRouter' }
  ];
  
  let passedChecks = 0;
  
  checks.forEach(check => {
    if (pageContent && pageContent.includes(check.text)) {
      console.log(`✅ ${check.name}: Found`);
      passedChecks++;
    } else {
      console.log(`❌ ${check.name}: Not found`);
    }
  });
  
  console.log(`\n📊 Summary: ${passedChecks}/${checks.length} checks passed`);
  
  // Verify page title
  const title = await page.title();
  console.log(`📑 Page title: "${title}"`);
  expect(title).toBe('German Legal Agent');
  
  // Take final screenshot
  await page.screenshot({ 
    path: '/tmp/legal-agent-basic-test.png', 
    fullPage: true 
  });
  console.log('📸 Screenshot saved: /tmp/legal-agent-basic-test.png');
  
  // Ensure minimum functionality
  expect(passedChecks).toBeGreaterThanOrEqual(6);
  console.log('🎉 German Legal Agent basic verification completed!');
});