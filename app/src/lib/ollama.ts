export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

// Simple protocol for tool calls inside assistant text:
// The model should emit a single line starting with:
//   [TOOL] tool_name {"arg":"value"}
// Example:
//   [TOOL] search_files {"query":"brake","glob":"**/*.csv"}
// The app will POST to the MCP proxy and then append a summarized result back to the assistant stream.
export type ToolCall = { name: string; args: Record<string, unknown> };

function parseToolCall(line: string): ToolCall | null {
  const m = line.match(/^\[TOOL\]\s*(\w+)\s*(\{.*\})\s*$/);
  if (!m) return null;
  try {
    const name = m[1];
    const args = JSON.parse(m[2]);
    return { name, args };
  } catch {
    return null;
  }
}

async function callMcpTool(name: string, args: Record<string, unknown>) {
  const res = await fetch('http://localhost:8787/tools/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, arguments: args })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`MCP call failed: ${res.status} ${res.statusText} ${txt}`);
  }
  return res.json();
}

export async function* ollamaChat(model: string, messages: ChatMessage[], provider: 'ollama' | 'openrouter' = 'ollama', apiKey?: string) {
  console.log(`🚀 NEW ITERATIVE ${provider.toUpperCase()} CHAT STARTING!`);
  let currentMessages = [...messages];
  let iterationCount = 0;
  const maxIterations = 10; // Prevent infinite loops
  
  while (iterationCount < maxIterations) {
    console.log(`🔄 LLM iteration ${iterationCount + 1} starting...`);
    
    let res: Response;
    
    if (provider === 'openrouter') {
      if (!apiKey) {
        throw new Error('OpenRouter API key is required');
      }
      
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Repair Chat MCP'
        },
        body: JSON.stringify({ 
          model, 
          messages: currentMessages, 
          stream: true,
          max_tokens: 4000
        })
      });
    } else {
      res = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: currentMessages, stream: true })
      });
    }
    
    if (!res.ok || !res.body) {
      throw new Error(`${provider} chat failed: ${res.status} ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let textBuf = '';
    let fullResponse = '';
    let toolCallsExecuted = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      buffer += chunk;

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        if (trimmedLine.startsWith('data: ') && provider === 'openrouter') {
          const dataLine = trimmedLine.slice(6);
          if (dataLine === '[DONE]') continue;
          
          try {
            const obj = JSON.parse(dataLine);
            const content: string | undefined = obj.choices?.[0]?.delta?.content;
            if (content == null) continue;
            
            textBuf += content;
            fullResponse += content;
          } catch {
            // ignore partial or non-JSON lines
          }
        } else {
          try {
            const obj = JSON.parse(trimmedLine);
            const content: string | undefined = obj.message?.content;
            if (content == null) continue;

            textBuf += content;
            fullResponse += content;
          } catch {
            // ignore partial or non-JSON lines
          }
        }
      }
      
      // Check for tool calls in accumulated text (shared logic)
      const textLines = textBuf.split(/\r?\n/);
      
      for (let i = 0; i < textLines.length; i++) {
        const toolCall = parseToolCall(textLines[i].trim());
        if (toolCall) {
          // New tool call found
          console.log(`Executing tool call ${toolCallsExecuted + 1}:`, toolCall);
          
          // Yield everything before this tool call
          const beforeToolCall = textLines.slice(0, i).join('\n');
          if (beforeToolCall) {
            yield beforeToolCall;
          }
          
          // Yield the tool call info first, then execute
          yield `\n[TOOL] ${toolCall.name} ${JSON.stringify(toolCall.args)}\n`;
          yield `\n[calling MCP ${toolCall.name} ...]\n`;
          
          try {
            const result = await callMcpTool(toolCall.name, toolCall.args);
            const resultText = `\n[MCP ${toolCall.name} result]\n` + JSON.stringify(result, null, 2) + '\n';
            console.log('MCP result obtained, length:', resultText.length);
            yield resultText;
            
            // Add result to full response
            fullResponse += resultText;
            toolCallsExecuted++;
            
          } catch (e: any) {
            const errorText = `\n[MCP ${toolCall.name} error] ${e?.message || String(e)}\n[Hint] Ensure MCP proxy http://localhost:8787 is running and REPAIR_FILES_ROOT is set.\n`;
            console.log('MCP error:', e?.message);
            yield errorText;
            fullResponse += errorText;
            toolCallsExecuted++;
          }
          
          // Continue with content after tool call
          textBuf = textLines.slice(i + 1).join('\n');
          break; // Process one tool call at a time within this stream
        }
      }
    }
    
    // Yield any remaining text from this iteration
    if (textBuf.length) {
      yield textBuf;
      fullResponse += textBuf;
    }
    
    console.log(`Iteration ${iterationCount + 1} completed. Tool calls executed: ${toolCallsExecuted}`);
    
    // Add this assistant response to conversation history
    currentMessages.push({ role: 'assistant', content: fullResponse });
    
    // If no tool calls were made, we're done
    if (toolCallsExecuted === 0) {
      console.log(`No tool calls found. Stopping after ${iterationCount + 1} iterations.`);
      break;
    }
    
    // Continue with next iteration automatically - add a continuation that helps
    // the LLM understand it should keep working toward the complete answer
    currentMessages.push({ 
      role: 'user', 
      content: 'Continue gathering any additional information needed to fully answer the original question.'
    });
    
    iterationCount++;
    console.log(`🔄 Automatically continuing to iteration ${iterationCount + 1} to complete the task...`);
    
    if (iterationCount < maxIterations) {
      // Don't yield the continuation prompt to the user - keep it internal
    }
  }
  
  if (iterationCount >= maxIterations) {
    yield `\n\n[Maximum iterations (${maxIterations}) reached. Stopping to prevent infinite loop.]`;
  }
}
