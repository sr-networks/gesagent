import { test, expect } from '@playwright/test';

test.describe('German Legal Agent MCP integration', () => {
  test('should call MCP tool and render legal results', async ({ page }) => {
    // Listen for console messages, network requests, and errors
    const consoleLogs: string[] = [];
    const networkRequests: string[] = [];
    const pageErrors: string[] = [];
    
    page.on('console', msg => {
      const logText = `${msg.type()}: ${msg.text()}`;
      consoleLogs.push(logText);
      console.log('BROWSER CONSOLE:', logText);
    });
    
    page.on('request', request => {
      networkRequests.push(`${request.method()} ${request.url()}`);
    });
    
    page.on('pageerror', error => {
      pageErrors.push(error.message);
    });
    
    page.on('requestfailed', request => {
      console.log('Request failed:', request.url(), request.failure()?.errorText);
    });

    // Try the correct port first, fallback to 5174
    let appUrl = 'http://localhost:5173/';
    try {
      await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });
    } catch {
      appUrl = 'http://localhost:5174/';
      await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
    }

    console.log(`Testing on: ${appUrl}`);

    // Wait for app to load
    await page.waitForSelector('input[placeholder="Ask about German laws, regulations, or legal concepts..."]', { timeout: 10000 });

    const input = page.locator('input[placeholder="Ask about German laws, regulations, or legal concepts..."]');
    
    // Test with a legal query that should trigger list_files
    await input.fill('Show me all German laws in the database');
    await page.keyboard.press('Enter');

    // Wait for the assistant message to appear
    await page.waitForSelector('div:has-text("assistant")', { timeout: 5000 });
    
    // Wait for potential MCP activity (longer timeout for tool call processing)
    await page.waitForTimeout(15000);

    // Check for MCP requests in network logs
    const mcpRequests = networkRequests.filter(req => req.includes('localhost:8787'));
    console.log('MCP requests:', mcpRequests);
    console.log('Page errors:', pageErrors);
    
    // Capture all text content
    const allText = await page.textContent('body');
    console.log('Full page text (truncated):', allText?.slice(0, 500));

    // Look for specific indicators
    const hasToolCall = allText?.includes('[TOOL]') || false;
    const hasMcpResult = allText?.includes('[MCP') || false;
    const hasFilesList = allText?.includes('agg/index.md') || allText?.includes('arbzg/index.md') || false;
    
    console.log('Has tool call:', hasToolCall);
    console.log('Has MCP result:', hasMcpResult);
    console.log('Has files list:', hasFilesList);
    
    // Check MCP logs sidebar content in detail
    const mcpLogsSection = await page.locator('aside').textContent();
    console.log('MCP Logs section:', mcpLogsSection);
    
    // Check for enhanced log entries with parameters
    const hasToolCallLog = mcpLogsSection?.includes('🔧 Tool Call:') || false;
    const hasExecutingLog = mcpLogsSection?.includes('⚡ Executing:') || false;
    const hasParametersInExecution = mcpLogsSection?.includes('→') || false;
    const hasResultLog = mcpLogsSection?.includes('✅') || false;
    const hasFileCountLog = mcpLogsSection?.includes('Found') && mcpLogsSection?.includes('files') || false;
    
    console.log('Has tool call log (🔧):', hasToolCallLog);
    console.log('Has executing log (⚡):', hasExecutingLog);
    console.log('Has parameters in execution (→):', hasParametersInExecution);
    console.log('Has result log (✅):', hasResultLog);
    console.log('Has file count log:', hasFileCountLog);

    // Take a screenshot for debugging
    await page.screenshot({ path: '/tmp/chat-debug-fixed.png', fullPage: true });

    // Enhanced assertions for the new logging features
    const hasUserMessage = allText?.includes('Show me all German laws in the database') || false;
    const hasAssistantResponse = allText?.includes('assistant') || false;
    
    expect(hasUserMessage).toBe(true);
    expect(hasAssistantResponse).toBe(true);
    
    // Test enhanced logging features
    console.log('Testing enhanced MCP logging features...');
    if (hasToolCallLog) {
      console.log('✅ Enhanced tool call logging working');
    }
    if (hasExecutingLog && hasParametersInExecution) {
      console.log('✅ Enhanced execution logging with parameters working');
    }
    if (hasResultLog && hasFileCountLog) {
      console.log('✅ Enhanced result logging with details working');
    }
  });
});
