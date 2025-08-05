import { useEffect, useRef, useState } from 'react';
import './App.css';
import type { ChatMessage } from './lib/ollama';
import { ollamaChat } from './lib/ollama';

// Local storage keys
const STORAGE_KEYS = {
  provider: 'legalAgent.provider',
  model: 'legalAgent.model',
  apiKey: 'legalAgent.apiKey'
};

// Load settings from localStorage
function loadSettings() {
  const savedProvider = localStorage.getItem(STORAGE_KEYS.provider) as 'ollama' | 'openrouter' | null;
  const savedModel = localStorage.getItem(STORAGE_KEYS.model);
  const savedApiKey = localStorage.getItem(STORAGE_KEYS.apiKey);
  
  return {
    provider: savedProvider || 'ollama',
    model: savedModel || 'qwen3:8b',
    apiKey: savedApiKey || ''
  };
}

// Save settings to localStorage
function saveSettings(provider: 'ollama' | 'openrouter', model: string, apiKey: string) {
  localStorage.setItem(STORAGE_KEYS.provider, provider);
  localStorage.setItem(STORAGE_KEYS.model, model);
  localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
}

// Get default model for provider
function getDefaultModel(provider: 'ollama' | 'openrouter') {
  return provider === 'ollama' ? 'qwen3:8b' : 'anthropic/claude-3.5-sonnet';
}

function App() {
  const settings = loadSettings();
  const [model, setModel] = useState(settings.model);
  const [provider, setProvider] = useState<'ollama' | 'openrouter'>(settings.provider);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [input, setInput] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[]>([
    { role: 'system', content: `You are a helpful German legal expert with access to comprehensive German federal law data via MCP tools through an inline protocol.

CRITICAL: You MUST search for the laws and regulation using the tools. Do never rely on your internal knowledge. You MUST fully answer the user's legal questions by making as many tool calls as needed. Do NOT stop after one tool call if more information is required.

When you need data from the legal database, emit a single-line tool request of the form:
[TOOL] tool_name {"arg":"value"}

WORKFLOW:
1. Analyze what legal information you need to completely answer the user's question
2. Do not just announce to search for the relevant laws and always start right away with the search and tool calls.
3. Make tool calls to gather relevant laws, regulations, and legal precedents
4. If the data from one tool call is insufficient, immediately make additional tool calls
5. Only provide your final legal analysis once you have ALL the information needed

Available tools and their purposes:
- list_files {"dir": ""}  -> list German law files under the dataset root (empty dir lists everything)
- search_files {"query":"text","glob":"**/*.md"} -> search case-insensitive text across German law files; glob optional (e.g., "a/*/index.md" for laws starting with 'a')
- find_and_read {"file":"b/bgb/index.md","search_text":"§ 823","context_lines":50} -> BEST TOOL: Find specific text and read context around it (1 call instead of 10+ chunks!)
- get_file_info {"file":"b/bgb/index.md"} -> get metadata about a law file including size, paragraphs, chunks needed
- read_file_chunk {"file":"b/bgb/index.md","start_line":1,"num_lines":100} -> read specific portion of large law file
- read_file {"file":"a/agg/index.md"} -> read full file content (WARNING: automatically truncates files >300KB)

Legal Context:
- You have access to all German federal laws and regulations (Bundesgesetze und -verordnungen)
- Laws are organized alphabetically in directories (a/, b/, c/, etc.)
- Each law has an index.md file with the full text in Markdown format
- Always cite specific paragraphs (§) and provide precise legal references
- Explain legal concepts in clear, understandable German

CRITICAL WORKFLOW for efficient legal research:
1. For specific paragraphs (e.g., "§ 823"): Use find_and_read directly - finds and reads context in 1 call!
2. For broad exploration: Use search_files to find relevant laws, then find_and_read for details
3. For file overview: Use get_file_info to understand structure
4. Only use read_file_chunk for sequential reading or read_file for small files

Rules:
- Emit only the [TOOL] line when calling a tool, nothing else on that line.
- After receiving tool results, CONTINUE your legal analysis and make more tool calls if needed.
- Only provide your final legal opinion once you have gathered ALL necessary information.
- Always be thorough and precise in your legal analysis.
- Prefer using tools over disclaimers. Do NOT say you lack access—use the tools.
` }
  ]);
  const [streaming, setStreaming] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    viewRef.current?.scrollTo({ top: viewRef.current.scrollHeight });
  }, [msgs]);

  // Mark settings as loaded on mount
  useEffect(() => {
    setSettingsLoaded(true);
  }, []);

  // Save settings to localStorage whenever they change (but not on initial load)
  useEffect(() => {
    if (settingsLoaded) {
      saveSettings(provider, model, apiKey);
    }
  }, [provider, model, apiKey, settingsLoaded]);

  // Helpers to log MCP usage in the UI
  const [lastToolCall, setLastToolCall] = useState<{name: string, params: any} | null>(null);
  const lastToolCallRef = useRef<{name: string, params: any} | null>(null);
  
  function log(line: string) {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`].slice(-200));
  }

  async function send() {
    const user: ChatMessage = { role: 'user', content: input.trim() };
    if (!user.content) return;
    // Snapshot history BEFORE adding the assistant placeholder to avoid double tokens
    const history = [...msgs, user];

    // Add a single assistant placeholder once
    setMsgs(m => [...m, user, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    // Stream and update only the last assistant message
    for await (const chunk of ollamaChat(model, history, provider, apiKey)) {
      console.log('Received chunk:', JSON.stringify(chunk.slice(0, 100)));
      
      // Filter out MCP-related content from main window but keep regular text
      let filteredChunk = chunk;
      
      // Remove MCP-related lines while preserving other content
      if (chunk.includes('[TOOL]') || chunk.includes('[calling MCP') || chunk.includes('[MCP ') || chunk.includes('--- Iteration')) {
        const lines = chunk.split('\n');
        const nonMcpLines = lines.filter(line => {
          const trimmed = line.trim();
          return !(
            /^\[TOOL\]/.test(trimmed) ||
            /^\[calling MCP/.test(trimmed) ||
            /^\[MCP [^\]]+ (result|error)\]/.test(trimmed) ||
            /^--- Iteration \d+ ---/.test(trimmed)
          );
        });
        filteredChunk = nonMcpLines.join('\n');
      }
      
      const isMcpContent = filteredChunk.trim() === '';
      
      // Log iteration markers
      if (/--- Iteration \d+ ---/.test(chunk)) {
        const iterMatch = chunk.match(/--- Iteration (\d+) ---/);
        if (iterMatch) {
          log(`🔄 Iteration ${iterMatch[1]} starting`);
        }
      }
      
      // Log when the model issues a formal tool call or when MCP returns
      if (/^\s*\[TOOL\]\s+\w+\s*\{/.test(chunk)) {
        console.log('Tool call pattern matched');
        // Extract tool name and arguments for detailed logging
        const toolMatch = chunk.trim().match(/\[TOOL\]\s+(\w+)\s*(\{[^}]*\})/);
        if (toolMatch) {
          const [, toolName, args] = toolMatch;
          log(`🔧 Tool Call: ${toolName}`);
          
          // Parse and display the arguments in a readable format
          try {
            const parsedArgs = JSON.parse(args);
            const toolCallData = {name: toolName, params: parsedArgs};
            setLastToolCall(toolCallData);
            lastToolCallRef.current = toolCallData;
            Object.entries(parsedArgs).forEach(([key, value]) => {
              log(`   └─ ${key}: "${value}"`);
            });
          } catch {
            log(`   └─ args: ${args}`);
            const toolCallData = {name: toolName, params: null};
            setLastToolCall(toolCallData);
            lastToolCallRef.current = toolCallData;
          }
        } else {
          log(`🔧 Tool Call: ${chunk.trim().slice(0, 100)}`);
        }
      }
      if (/^\s*\[calling MCP [^\]]+\]/.test(chunk)) {
        console.log('MCP calling pattern matched');
        // Extract specific tool being called and parameters
        const callingMatch = chunk.trim().match(/\[calling MCP (\w+)[^\]]*\]/);
        if (callingMatch) {
          const toolName = callingMatch[1];
          
          
          // Use stored tool call parameters for context, or try to extract from current chunk
          let params = '';
          const currentToolCall = lastToolCallRef.current;
          if (currentToolCall && currentToolCall.name === toolName && currentToolCall.params) {
            if (toolName === 'list_files') {
              const dir = currentToolCall.params.dir;
              params = dir !== undefined ? (dir === '' ? 'root' : dir) : '';
            } else if (toolName === 'read_file') {
              params = currentToolCall.params.file || '';
            } else if (toolName === 'search_files') {
              params = `"${currentToolCall.params.query || ''}"`;
            }
          }
          
          log(`⚡ Executing: ${toolName}${params ? ` → ${params}` : ''}`);
        } else {
          log(`⚡ ${chunk.trim()}`);
        }
      }
      if (/^\s*\[MCP [^\]]+ (result|error)\]/.test(chunk)) {
        console.log('MCP result pattern matched');
        // Extract tool name and result type
        const resultMatch = chunk.trim().match(/\[MCP (\w+) (result|error)\]/);
        if (resultMatch) {
          const [, toolName, resultType] = resultMatch;
          const icon = resultType === 'result' ? '✅' : '❌';
          // Add brief description based on stored parameters
          let description = '';
          const currentToolCall = lastToolCallRef.current;
          if (currentToolCall && currentToolCall.name === toolName && currentToolCall.params) {
            if (toolName === 'list_files') {
              const dir = currentToolCall.params.dir;
              description = ` → ${dir === '' ? 'root' : dir || 'root'}`;
            } else if (toolName === 'read_file') {
              description = ` → ${currentToolCall.params.file}`;
            } else if (toolName === 'search_files') {
              description = ` → "${currentToolCall.params.query}"`;
            }
          }
          
          log(`${icon} ${toolName}${description}: ${resultType}`);
          
          // Try to extract meaningful data from the result
          if (resultType === 'result') {
            if (chunk.includes('"files"')) {
              const filesMatch = chunk.match(/"files":\[([^\]]+)\]/);
              if (filesMatch) {
                const fileCount = (filesMatch[1].match(/"/g) || []).length / 2;
                log(`   → Found ${fileCount} files`);
                
                // Show first few files
                const firstFilesMatch = filesMatch[1].match(/"([^"]+)"/g);
                if (firstFilesMatch && firstFilesMatch.length > 0) {
                  const firstFiles = firstFilesMatch.slice(0, 3).map(f => f.replace(/"/g, ''));
                  const moreFiles = fileCount > 3 ? `, +${fileCount - 3} more` : '';
                  log(`   └─ ${firstFiles.join(', ')}${moreFiles}`);
                }
              }
            } else if (chunk.includes('"file"') && chunk.includes('"content"')) {
              // This is a read_file result
              const fileMatch = chunk.match(/"file":"([^"]+)"/);
              const contentMatch = chunk.match(/"content":"([^"\\]{0,60})/);
              if (fileMatch && contentMatch) {
                log(`   → Read: ${fileMatch[1]}`);
                const content = contentMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"');
                log(`   └─ "${content}${contentMatch[1].length >= 60 ? '...' : ''}"`);
              }
            } else if (chunk.includes('"matches"')) {
              // This is a search_files result
              const matchesMatch = chunk.match(/"matches":\[([^\]]*)\]/);
              if (matchesMatch) {
                const matchCount = (matchesMatch[1].match(/\{/g) || []).length;
                log(`   → Found ${matchCount} matches`);
                
                // Show first match preview
                const firstMatch = chunk.match(/"file":"([^"]+)"[^}]*"preview":"([^"]{0,40})/);
                if (firstMatch) {
                  log(`   └─ ${firstMatch[1]}: "${firstMatch[2]}..."`);
                }
              }
            }
          } else if (resultType === 'error') {
            // Extract error message
            const errorMatch = chunk.match(/\[MCP \w+ error\] ([^\n\[]+)/);
            if (errorMatch) {
              log(`   → Error: ${errorMatch[1].trim()}`);
              
              // Show hint if present
              if (chunk.includes('[Hint]')) {
                const hintMatch = chunk.match(/\[Hint\] ([^\n\[]+)/);
                if (hintMatch) {
                  log(`   └─ Hint: ${hintMatch[1].trim()}`);
                }
              }
            }
          }
        } else {
          log(`📋 ${chunk.trim().slice(0, 100)}`);
        }
      }

      // Only add non-MCP content to the main chat window
      if (!isMcpContent && filteredChunk.length > 0) {
        setMsgs(m => {
          const copy = [...m];
          const lastIdx = copy.length - 1;
          if (lastIdx >= 0 && copy[lastIdx].role === 'assistant') {
            copy[lastIdx] = { ...copy[lastIdx], content: copy[lastIdx].content + filteredChunk };
          }
          return copy;
        });
      }
    }
    setStreaming(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '90vh' }}>
      <header style={{ padding: 12, borderBottom: '1px solid #ddd', display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong>German Legal Agent</strong>
        {(settings.provider !== 'ollama' || settings.model !== 'qwen3:8b' || settings.apiKey !== '') && (
          <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>
            📁 Settings loaded
          </span>
        )}
        <span style={{ flex: 1 }} />
        <label>
          Provider:&nbsp;
          <select 
            value={provider} 
            onChange={e => {
              const newProvider = e.target.value as 'ollama' | 'openrouter';
              setProvider(newProvider);
              // Suggest default model for new provider if current model doesn't match
              const defaultModel = getDefaultModel(newProvider);
              if (model === getDefaultModel(provider)) {
                setModel(defaultModel);
              }
            }} 
            style={{ marginRight: 8 }}
          >
            <option value="ollama">Ollama</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </label>
        <label>
          Model:&nbsp;
          <input 
            value={model} 
            onChange={e => setModel(e.target.value)} 
            placeholder={getDefaultModel(provider)}
            style={{ width: 180, marginRight: 8 }} 
          />
        </label>
        {provider === 'openrouter' && (
          <label>
            API Key:&nbsp;
            <input 
              type="password"
              value={apiKey} 
              onChange={e => setApiKey(e.target.value)} 
              placeholder="sk-or-..."
              style={{ width: 120 }} 
            />
          </label>
        )}
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div
          ref={viewRef}
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 12,
            borderRight: '1px solid #eee',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          {msgs.filter(m => m.role !== 'system').map((m, i) => {
            const isAssistant = m.role === 'assistant';
            const bubbleStyle: React.CSSProperties = {
              alignSelf: 'flex-start', // left aligned for streaming/assistant by request
              maxWidth: '80ch',
              background: isAssistant ? '#f7f7f9' : '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: '8px 10px',
              whiteSpace: 'pre-wrap',
              textAlign: 'left' // ensure left alignment of text block
            };
            return (
              <div key={i} style={bubbleStyle}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{m.role}</div>
                <div>{m.content}</div>
              </div>
            );
          })}
          {streaming && (
            <div
              style={{
                alignSelf: 'flex-start',
                background: '#fafafa',
                border: '1px dashed #e5e7eb',
                borderRadius: 8,
                padding: '6px 10px',
                color: '#888',
                textAlign: 'left'
              }}
            >
              …
            </div>
          )}
        </div>
        <aside style={{ width: 320, overflow: 'auto', padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, textAlign: 'left' }}>MCP Logs</div>
          <div style={{ 
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', 
            fontSize: 12, 
            whiteSpace: 'pre-wrap',
            textAlign: 'left',
            lineHeight: '1.4'
          }}>
            {logs.length === 0 ? 
              <div style={{ color: '#777', textAlign: 'left' }}>No MCP activity yet.</div> : 
              logs.map((l, i) => <div key={i} style={{ textAlign: 'left', marginBottom: 2 }}>{l}</div>)
            }
          </div>
        </aside>
      </div>
      <form
        onSubmit={e => {
          e.preventDefault();
          send();
        }}
        style={{ padding: 12, borderTop: '1px solid #ddd', display: 'flex', gap: 8 }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about German laws, regulations, or legal concepts..."
          style={{ flex: 1, fontSize: 16, padding: 8 }}
        />
        <button type="submit" disabled={streaming}>
          Send
        </button>
      </form>
    </div>
  );
}

export default App;
