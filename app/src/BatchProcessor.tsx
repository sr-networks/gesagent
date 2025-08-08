import { useRef, useState } from 'react';
import type { ChatMessage } from './lib/ollama';
import { ollamaChat } from './lib/ollama';

interface CsvRow {
  processId: string;
  case: string;
  decision: string;
}

interface ProcessingJob {
  id: string;
  rows: CsvRow[];
  currentIndex: number;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  results: JobResult[];
  createdAt: Date;
}

interface JobResult {
  processId: string;
  case: string;
  decision: string;
  response: string;
  status: 'completed' | 'error';
  error?: string;
  processingTime: number;
}

function loadSettings() {
  const savedProvider = localStorage.getItem('legalAgent.provider') as 'ollama' | 'openrouter' | null;
  const savedModel = localStorage.getItem('legalAgent.model');
  const savedApiKey = localStorage.getItem('legalAgent.apiKey');
  
  return {
    provider: savedProvider || 'ollama',
    model: savedModel || 'qwen3:8b',
    apiKey: savedApiKey || ''
  };
}

function BatchProcessor() {
  const settings = loadSettings();
  const [model, setModel] = useState(settings.model);
  const [provider, setProvider] = useState<'ollama' | 'openrouter'>(settings.provider);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentProcessing, setCurrentProcessing] = useState<string>('');
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const systemMessage: ChatMessage = {
    role: 'system',
    content: `You are a helpful German legal expert with access to comprehensive German federal law data via MCP tools through an inline protocol.

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
- search_files {"query":"§ 115 AND ZPO","max_results":20,"context_size":200} -> ENHANCED: search with AND/OR logic across German law files. Examples: "§ 115 AND ZPO", "Prozesskostenhilfe OR Verfahrenskostenhilfe", "§ 115 AND (Ehegatte OR Prozesskostenvorschuss)". Use AND for all required terms, OR for alternatives, parentheses for grouping.
- find_and_read {"file":"z/zpo/index.md","search_text":"§ 115","context_lines":50} -> BEST TOOL: Find specific text and read context around it (1 call instead of 10+ chunks!)
- get_file_info {"file":"z/zpo/index.md"} -> get metadata about a law file including size, paragraphs, chunks needed
- read_file_chunk {"file":"z/zpo/index.md","start_line":1,"num_lines":100} -> read specific portion of large law file
- read_file {"file":"a/agg/index.md"} -> read full file content (WARNING: automatically truncates files >300KB)

Legal Context:
- You have access to all German federal laws and regulations (Bundesgesetze und -verordnungen)
- Laws are organized alphabetically in directories (a/, b/, c/, etc.)
- Each law has an index.md file with the full text in Markdown format
- Always cite specific paragraphs (§) and provide precise legal references
- Explain legal concepts in clear, understandable German

CRITICAL WORKFLOW for efficient legal research:
1. For complex legal queries: Use search_files with AND/OR logic first - e.g., "§ 115 AND ZPO AND Prozesskostenhilfe" or "Ehegatte AND (Prozesskostenvorschuss OR Verfahrenskostenhilfe)"
2. For specific paragraphs: Use find_and_read when you know the exact law file - finds and reads context in 1 call!
3. For broad exploration: Use search_files with OR logic for synonyms - e.g., "Prozesskostenhilfe OR Verfahrenskostenhilfe OR PKH"
4. For file overview: Use get_file_info to understand structure
5. Only use read_file_chunk for sequential reading or read_file for small files

ADVANCED SEARCH EXAMPLES:
- search_files: "§ 115 AND ZPO" - Find paragraph 115 in procedural law
- search_files: "Prozesskostenhilfe OR Verfahrenskostenhilfe" - Find either term
- search_files: "§ 115 AND (Ehegatte OR Prozesskostenvorschuss)" - Complex grouping
- search_files: "Kündigung AND Sozialplan" - Employment law terms
- search_files: "Schadensersatz AND (BGB OR Deliktsrecht)" - Damages in civil law
- search_files: "Zugang AND Kündigung AND Briefkasten AND Postzustellungszeiten" - Break down complex queries into keywords

IMPORTANT SEARCH STRATEGY:
- Instead of: "Zugang Kündigung Einwurf in Briefkasten gewöhnliche Postzustellungszeiten"
- Use: "Zugang AND Kündigung AND Briefkasten AND Postzustellungszeiten"
- Break complex legal concepts into individual meaningful keywords
- The system will automatically find documents containing ALL keywords (much more effective!)

Rules:
- Emit only the [TOOL] line when calling a tool, nothing else on that line.
- After receiving tool results, CONTINUE your legal analysis and make more tool calls if needed.
- Only provide your final legal opinion once you have gathered ALL necessary information.
- Always be thorough and precise in your legal analysis.
- Prefer using tools over disclaimers. Do NOT say you lack access—use the tools.

BATCH PROCESSING MODE:
- You are processing legal cases in batch mode
- Each case will be presented with a Process ID, Case Description, and Decision
- Provide a comprehensive legal analysis for each case
- Keep responses focused and professional
- Include relevant legal citations and precedents where applicable`
  };

  function log(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`].slice(-100));
  }

  function parseCsv(content: string): CsvRow[] {
    const lines = content.split('\n').filter(line => line.trim());
    const headers = lines[0].split(';').map(h => h.trim());
    
    // Validate headers
    if (headers.length < 3 || !headers[0] || !headers[1] || !headers[2]) {
      throw new Error('CSV must have at least 3 columns: ProcessID, Case, Decision');
    }
    
    const rows: CsvRow[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(';');
      if (values.length >= 3) {
        rows.push({
          processId: values[0]?.trim() || `Row-${i}`,
          case: values[1]?.trim() || '',
          decision: values[2]?.trim() || ''
        });
      }
    }
    
    return rows;
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }
    
    try {
      const content = await file.text();
      const rows = parseCsv(content);
      
      if (rows.length === 0) {
        alert('No valid data rows found in CSV file');
        return;
      }
      
      setCsvFile(file);
      setCsvData(rows);
      log(`Loaded ${rows.length} cases from ${file.name}`);
    } catch (error) {
      alert(`Error parsing CSV: ${error}`);
      log(`Error parsing CSV: ${error}`);
    }
  }

  async function startProcessing() {
    if (csvData.length === 0) return;
    
    const newJob: ProcessingJob = {
      id: `job-${Date.now()}`,
      rows: csvData,
      currentIndex: 0,
      status: 'running',
      results: [],
      createdAt: new Date()
    };
    
    setJob(newJob);
    log(`Started processing job with ${csvData.length} cases`);
    
    // Create abort controller for this job
    abortControllerRef.current = new AbortController();
    
    await processJob(newJob);
  }

  async function processJob(processingJob: ProcessingJob) {
    for (let i = processingJob.currentIndex; i < processingJob.rows.length; i++) {
      // Check if processing was aborted
      if (abortControllerRef.current?.signal.aborted) {
        setJob(prev => prev ? { ...prev, status: 'paused', currentIndex: i } : null);
        log('Processing paused');
        return;
      }
      
      const row = processingJob.rows[i];
      setCurrentProcessing(`Processing case ${i + 1}/${processingJob.rows.length}: ${row.processId}`);
      log(`Processing case ${i + 1}/${processingJob.rows.length}: ${row.processId}`);
      
      const startTime = Date.now();
      
      try {
        // Create the user message for this case
        const userMessage = `Bitte analysieren Sie folgenden Rechtsfall:

Verfahrensnummer: ${row.processId}
Fallbeschreibung: ${row.case}
Entscheidung: ${row.decision}

Bitte geben Sie eine umfassende rechtliche Analyse dieses Falls unter Berücksichtigung der relevanten deutschen Gesetze und Rechtsprechung.`;

        const messages: ChatMessage[] = [systemMessage, { role: 'user', content: userMessage }];
        
        let response = '';
        
        // Process the case using the existing chat function
        for await (const chunk of ollamaChat(model, messages, provider, apiKey)) {
          // Filter out MCP-related content
          let filteredChunk = chunk;
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
          
          if (filteredChunk.trim()) {
            response += filteredChunk;
          }
          
          // Check for abort signal during streaming
          if (abortControllerRef.current?.signal.aborted) {
            break;
          }
        }
        
        const processingTime = Date.now() - startTime;
        
        const result: JobResult = {
          processId: row.processId,
          case: row.case,
          decision: row.decision,
          response: response.trim(),
          status: 'completed',
          processingTime
        };
        
        // Update job with result
        setJob(prev => {
          if (!prev) return null;
          return {
            ...prev,
            currentIndex: i + 1,
            results: [...prev.results, result]
          };
        });
        
        log(`Completed case ${row.processId} in ${Math.round(processingTime / 1000)}s`);
        
      } catch (error) {
        const processingTime = Date.now() - startTime;
        const result: JobResult = {
          processId: row.processId,
          case: row.case,
          decision: row.decision,
          response: '',
          status: 'error',
          error: String(error),
          processingTime
        };
        
        setJob(prev => {
          if (!prev) return null;
          return {
            ...prev,
            currentIndex: i + 1,
            results: [...prev.results, result]
          };
        });
        
        log(`Error processing case ${row.processId}: ${error}`);
      }
    }
    
    // Job completed
    setJob(prev => prev ? { ...prev, status: 'completed' } : null);
    setCurrentProcessing('');
    log('All cases processed successfully');
  }

  function pauseProcessing() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      log('Pausing processing...');
    }
  }

  function resumeProcessing() {
    if (job && job.status === 'paused') {
      const resumeJob = { ...job, status: 'running' as const };
      setJob(resumeJob);
      abortControllerRef.current = new AbortController();
      log('Resuming processing...');
      processJob(resumeJob);
    }
  }

  function stopProcessing() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setJob(null);
    setCurrentProcessing('');
    log('Processing stopped');
  }

  function exportResults() {
    if (!job || job.results.length === 0) return;
    
    const csvContent = [
      'ProcessID;Case;Decision;Response;Status;ProcessingTime;Error',
      ...job.results.map(result => 
        `"${result.processId}";"${result.case.replace(/"/g, '""')}";"${result.decision.replace(/"/g, '""')}";"${result.response.replace(/"/g, '""')}";"${result.status}";"${result.processingTime}";"${result.error || ''}"`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `legal-analysis-results-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    log(`Exported ${job.results.length} results to CSV`);
  }

  function clearAll() {
    stopProcessing();
    setCsvFile(null);
    setCsvData([]);
    setLogs([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const progress = job ? (job.currentIndex / job.rows.length) * 100 : 0;
  const completedCount = job?.results.filter(r => r.status === 'completed').length || 0;
  const errorCount = job?.results.filter(r => r.status === 'error').length || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px', gap: '20px' }}>
      <header style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: '16px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Legal Case Batch Processor</h1>
        <p style={{ margin: '8px 0 0 0', color: '#6b7280' }}>Upload CSV files and process legal cases through the German Legal Agent</p>
      </header>

      {/* Settings */}
      <div style={{ display: 'flex', gap: '12px', padding: '12px', background: '#f9fafb', borderRadius: '8px', alignItems: 'center' }}>
        <label>
          Provider:
          <select 
            value={provider} 
            onChange={e => setProvider(e.target.value as 'ollama' | 'openrouter')}
            style={{ marginLeft: '8px', marginRight: '16px' }}
            disabled={job?.status === 'running'}
          >
            <option value="ollama">Ollama</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </label>
        <label>
          Model:
          <input 
            value={model} 
            onChange={e => setModel(e.target.value)}
            placeholder="qwen3:8b"
            style={{ marginLeft: '8px', marginRight: '16px', width: '180px' }}
            disabled={job?.status === 'running'}
          />
        </label>
        {provider === 'openrouter' && (
          <label>
            API Key:
            <input 
              type="password"
              value={apiKey} 
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-or-..."
              style={{ marginLeft: '8px', width: '120px' }}
              disabled={job?.status === 'running'}
            />
          </label>
        )}
      </div>

      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0 }}>
        {/* Left Panel - File Upload and Controls */}
        <div style={{ width: '350px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* File Upload */}
          <div style={{ padding: '16px', border: '2px dashed #d1d5db', borderRadius: '8px', textAlign: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ marginBottom: '12px' }}
              disabled={job?.status === 'running'}
            />
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              Upload CSV file with columns: ProcessID, Case, Decision
            </div>
            {csvFile && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#059669' }}>
                ✓ {csvFile.name} ({csvData.length} cases)
              </div>
            )}
          </div>

          {/* Processing Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {!job && csvData.length > 0 && (
              <button
                onClick={startProcessing}
                style={{ padding: '12px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '500' }}
              >
                Start Processing ({csvData.length} cases)
              </button>
            )}
            
            {job?.status === 'running' && (
              <button
                onClick={pauseProcessing}
                style={{ padding: '12px', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '500' }}
              >
                Pause Processing
              </button>
            )}
            
            {job?.status === 'paused' && (
              <button
                onClick={resumeProcessing}
                style={{ padding: '12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '500' }}
              >
                Resume Processing
              </button>
            )}
            
            {job && (
              <button
                onClick={stopProcessing}
                style={{ padding: '12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '500' }}
              >
                Stop Processing
              </button>
            )}
            
            {job && job.results.length > 0 && (
              <button
                onClick={exportResults}
                style={{ padding: '12px', backgroundColor: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '500' }}
              >
                Export Results ({job.results.length})
              </button>
            )}
            
            <button
              onClick={clearAll}
              style={{ padding: '8px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px' }}
            >
              Clear All
            </button>
          </div>

          {/* Progress */}
          {job && (
            <div style={{ padding: '16px', background: '#f3f4f6', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                Progress: {job.currentIndex}/{job.rows.length} ({Math.round(progress)}%)
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    width: `${progress}%`, 
                    height: '100%', 
                    backgroundColor: job.status === 'running' ? '#10b981' : job.status === 'paused' ? '#f59e0b' : '#6b7280',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                ✓ {completedCount} completed • ✗ {errorCount} errors • Status: {job.status}
              </div>
              {currentProcessing && (
                <div style={{ fontSize: '12px', color: '#059669', marginTop: '4px' }}>
                  {currentProcessing}
                </div>
              )}
            </div>
          )}

          {/* Activity Log */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Activity Log</h3>
            <div style={{ 
              height: '200px', 
              overflow: 'auto', 
              border: '1px solid #e5e7eb', 
              borderRadius: '6px', 
              padding: '8px',
              fontSize: '12px',
              fontFamily: 'monospace',
              background: '#fafafa'
            }}>
              {logs.length === 0 ? (
                <div style={{ color: '#6b7280' }}>No activity yet...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} style={{ marginBottom: '2px' }}>{log}</div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Results View */}
        <div style={{ width: '800px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Results</h3>
          
          {!job ? (
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: '#6b7280',
              fontSize: '16px',
              border: '2px dashed #d1d5db',
              borderRadius: '8px',
              textAlign: 'left'
            }}>
              Upload a CSV file and start processing to see results here
            </div>
          ) : (
            <div style={{ 
              flex: 1, 
              overflow: 'auto', 
              border: '1px solid #e5e7eb', 
              borderRadius: '8px',
              background: '#fafafa'
            }}>
              {job.results.map((result, i) => (
                <div key={i} style={{ 
                  margin: '12px', 
                  padding: '16px', 
                  background: 'white', 
                  borderRadius: '6px',
                  borderLeft: `4px solid ${result.status === 'completed' ? '#10b981' : '#ef4444'}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                      {result.processId} 
                      <span style={{ 
                        marginLeft: '8px', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        fontSize: '11px',
                        background: result.status === 'completed' ? '#d1fae5' : '#fee2e2',
                        color: result.status === 'completed' ? '#065f46' : '#991b1b'
                      }}>
                        {result.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {Math.round(result.processingTime / 1000)}s
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '13px', marginBottom: '8px', textAlign: 'left' }}>
                    <strong>Case:</strong> {result.case.substring(0, 200)}{result.case.length > 200 ? '...' : ''}
                  </div>
                  
                  {result.status === 'completed' ? (
                    <div style={{ fontSize: '13px', lineHeight: '1.4', textAlign: 'left' }}>
                      <strong>Analysis:</strong><br />
                      <div style={{ 
                        whiteSpace: 'pre-wrap', 
                        marginTop: '8px', 
                        padding: '12px', 
                        background: '#f9fafb', 
                        borderRadius: '4px',
                        textAlign: 'justify',
                        wordWrap: 'break-word',
                        maxWidth: '100%'
                      }}>
                        {result.response}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: '#dc2626', textAlign: 'left' }}>
                      <strong>Error:</strong> {result.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BatchProcessor;