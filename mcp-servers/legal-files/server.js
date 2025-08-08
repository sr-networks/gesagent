import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { InitializeRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fg from 'fast-glob';
import fs from 'fs/promises';
import path from 'path';

const ROOT = process.env.LEGAL_FILES_ROOT || path.resolve(process.cwd(), '../../data/gesetze');
const ROOT_ABS = path.resolve(ROOT);

const toolsCapability = {
  list_files: {
    description: 'List German law files under the dataset root or a subdirectory',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'relative directory under root', default: '' }
      }
    }
  },
  search_files: {
    description: 'Search for case-insensitive text across German law files with advanced AND/OR logic. Use " AND " for all terms required, " OR " for any terms, or combine both. Examples: "§ 115 AND ZPO", "Prozesskostenhilfe OR Verfahrenskostenhilfe", "§ 115 AND (ZPO OR BGB)"',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query with AND/OR logic. Examples: "§ 115 AND ZPO", "Prozesskostenhilfe OR Verfahrenskostenhilfe"' },
        glob: { type: 'string', description: 'glob like **/*.md or a/*/index.md' },
        max_results: { type: 'number', description: 'Maximum number of results to return (default 50)', default: 50 },
        context_size: { type: 'number', description: 'Size of preview context in characters (default 160)', default: 160 }
      },
      required: ['query']
    }
  },
  read_file: {
    description: 'Read the full contents of a German law file (WARNING: may be very large)',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' }
      },
      required: ['file']
    }
  },
  get_file_info: {
    description: 'Get metadata about a German law file including size',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' }
      },
      required: ['file']
    }
  },
  read_file_chunk: {
    description: 'Read a specific chunk of a large German law file',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        start_line: { type: 'number', description: 'Starting line number (1-based)' },
        num_lines: { type: 'number', description: 'Number of lines to read (max 500)', default: 100 }
      },
      required: ['file', 'start_line']
    }
  },
  find_and_read: {
    description: 'Find text in a German law file and read context around it (MOST EFFICIENT for specific paragraphs)',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        search_text: { type: 'string', description: 'Text to search for (e.g., "§ 823", "Schadensersatzpflicht")' },
        context_lines: { type: 'number', description: 'Lines of context before and after match (default 50)', default: 50 }
      },
      required: ['file', 'search_text']
    }
  }
};

const server = new Server(
  { name: 'legal-files', version: '0.1.0' },
  { capabilities: { tools: toolsCapability } }
);

async function listFiles(rel = '') {
  const base = path.resolve(ROOT_ABS, rel);
  const entries = await fg(['**/*'], { cwd: base, dot: false, onlyFiles: true });
  return entries.map(e => path.join(rel, e));
}

const tools = {
  list_files: {
    description: 'List German law files under the dataset root or a subdirectory',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'relative directory under root', default: '' }
      }
    },
    handler: async ({ dir = '' }) => {
      const files = await listFiles(dir);
      return { files };
    }
  },
  
  search_files: {
    description: 'Search for case-insensitive text across German law files with advanced AND/OR logic. Use " AND " for all terms required, " OR " for any terms, or combine both. Examples: "§ 115 AND ZPO", "Prozesskostenhilfe OR Verfahrenskostenhilfe", "§ 115 AND (ZPO OR BGB)"',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query with AND/OR logic. Examples: "§ 115 AND ZPO", "Prozesskostenhilfe OR Verfahrenskostenhilfe"' },
        glob: { type: 'string', description: 'glob like **/*.md or a/*/index.md' },
        max_results: { type: 'number', description: 'Maximum number of results to return (default 50)', default: 50 },
        context_size: { type: 'number', description: 'Size of preview context in characters (default 160)', default: 160 }
      },
      required: ['query']
    },
    handler: async ({ query, glob, max_results = 50, context_size = 160 }) => {
      const patterns = glob ? [glob] : ['**/*.md'];
      const files = await fg(patterns, { cwd: ROOT_ABS, onlyFiles: true, dot: false });
      
      // Simplified AND/OR query parsing
      const parseQuery = (q) => {
        const processIndividualTerm = (term) => {
          const cleanTerm = term.trim();
          
          // Don't split legal references or short terms
          if (cleanTerm.includes('§') || cleanTerm.includes('Abs.') || cleanTerm.length < 20) {
            return cleanTerm;
          }
          
          // Split very long phrases into keywords (only if truly necessary)
          const stopWords = new Set(['der', 'die', 'das', 'und', 'oder', 'in', 'auf', 'von', 'zu', 'mit', 'bei', 'nach', 'vor', 'über', 'unter', 'durch', 'für', 'an', 'um', 'gegen', 'ohne', 'bis', 'seit', 'während', 'wegen', 'trotz', 'statt']);
          
          const words = cleanTerm.split(/\s+/)
            .map(w => w.trim())
            .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
          
          if (words.length > 3) {  // Only split very long phrases
            return {
              type: 'AND',
              terms: words.slice(0, 4)  // Limit to max 4 terms to avoid over-splitting
            };
          }
          
          return cleanTerm;
        };
        
        const processQuery = (str) => {
          // Handle parentheses by recursively processing groups
          if (str.includes('(')) {
            // Simple parentheses handling - process inner groups first
            return str.replace(/\(([^)]+)\)/g, (match, group) => {
              const processed = processQuery(group);
              return typeof processed === 'string' ? processed : JSON.stringify(processed);
            });
          }
          
          // Split by OR first (lower precedence)
          const orParts = str.split(' OR ').map(part => part.trim()).filter(t => t);
          
          if (orParts.length > 1) {
            return {
              type: 'OR',
              terms: orParts.map(part => {
                const andParts = part.split(' AND ').map(t => t.trim()).filter(t => t);
                if (andParts.length > 1) {
                  return { type: 'AND', terms: andParts.map(term => processIndividualTerm(term)) };
                }
                return processIndividualTerm(part);
              })
            };
          }
          
          // Split by AND
          const andParts = str.split(' AND ').map(t => t.trim()).filter(t => t);
          if (andParts.length > 1) {
            return { 
              type: 'AND', 
              terms: andParts.map(term => processIndividualTerm(term))
            };
          }
          
          return processIndividualTerm(str.trim());
        };
        
        return processQuery(q);
      };
      
      const evaluateQuery = (queryObj, text) => {
        const ltext = text.toLowerCase();
        
        const evaluate = (obj) => {
          if (typeof obj === 'string') {
            const term = obj.toLowerCase();
            
            // Handle paragraph symbols with flexible matching
            if (term.includes('§')) {
              const paraNum = term.match(/§\s*(\d+)/);
              if (paraNum) {
                const num = paraNum[1];
                const patterns = [
                  `§ ${num}`,
                  `§${num}`,
                  `paragraph ${num}`,
                  `para ${num}`,
                  term
                ];
                return patterns.some(pattern => ltext.includes(pattern));
              }
            }
            
            // Handle "Abs." (Absatz) variations
            if (term.includes('abs.')) {
              const variations = [
                term,
                term.replace('abs.', 'absatz'),
                term.replace('abs.', 'abs'),
                term.replace('abs.', 'absätze')
              ];
              return variations.some(variation => ltext.includes(variation));
            }
            
            return ltext.includes(term);
          }
          
          if (obj && obj.type === 'AND') {
            return obj.terms.every(term => evaluate(term));
          }
          
          if (obj && obj.type === 'OR') {
            return obj.terms.some(term => evaluate(term));
          }
          
          return false;
        };
        
        return evaluate(queryObj);
      };
      
      const findBestMatch = (queryObj, text) => {
        const ltext = text.toLowerCase();
        let bestMatch = { index: -1, score: 0 };
        
        // Collect all search terms (simplified)
        const collectTerms = (obj) => {
          if (typeof obj === 'string') return [obj.toLowerCase()];
          if (obj && obj.terms && Array.isArray(obj.terms)) {
            return obj.terms.flatMap(term => collectTerms(term));
          }
          return [];
        };
        
        const terms = collectTerms(queryObj);
        if (terms.length === 0) return bestMatch;
        
        // Find the position where most terms appear closest together
        const stepSize = Math.max(50, Math.floor(text.length / 200)); // Optimize search
        for (let i = 0; i < text.length - context_size; i += stepSize) {
          const window = ltext.slice(i, i + context_size * 3);
          let score = 0;
          
          for (const term of terms) {
            if (window.includes(term)) {
              score += Math.min(term.length, 20); // Cap individual term score
            }
          }
          
          if (score > bestMatch.score) {
            bestMatch = { index: i, score };
          }
        }
        
        // If no good match found, use first occurrence of any term
        if (bestMatch.score === 0 && terms.length > 0) {
          for (const term of terms) {
            const idx = ltext.indexOf(term);
            if (idx >= 0) {
              bestMatch = { index: idx, score: 1 };
              break;
            }
          }
        }
        
        return bestMatch;
      };
      
      const queryObj = parseQuery(query);
      const matches = [];
      
      console.error(`Query: "${query}" -> Parsed:`, JSON.stringify(queryObj, null, 2));
      
      for (const f of files) {
        if (matches.length >= max_results) break;
        
        const full = path.join(ROOT_ABS, f);
        try {
          const text = await fs.readFile(full, 'utf8');
          
          if (evaluateQuery(queryObj, text)) {
            const match = findBestMatch(queryObj, text);
            const start = Math.max(0, match.index >= 0 ? match.index : 0);
            const end = Math.min(text.length, start + context_size);
            
            // Clean up preview text
            let preview = text.slice(start, end);
            
            // If we found a good match position, try to start at a word boundary
            if (match.index > 0 && start > 0) {
              const betterStart = text.lastIndexOf(' ', start + 50);
              if (betterStart > start - 50 && betterStart > 0) {
                preview = text.slice(betterStart + 1, betterStart + 1 + context_size);
              }
            }
            
            // Remove excessive whitespace and newlines for preview
            preview = preview.replace(/\s+/g, ' ').trim();
            
            matches.push({ 
              file: f, 
              preview,
              match_score: match.score,
              relevance: match.score / text.length // Normalize by document length
            });
          }
        } catch (error) {
          console.error(`Error reading file ${f}:`, error.message);
        }
      }
      
      // Sort matches by relevance score and match score combined
      matches.sort((a, b) => {
        const scoreA = (a.relevance || 0) * 1000 + (a.match_score || 0);
        const scoreB = (b.relevance || 0) * 1000 + (b.match_score || 0);
        return scoreB - scoreA;
      });
      
      return { 
        matches: matches.slice(0, max_results),
        query_parsed: queryObj,
        total_files_searched: files.length,
        search_strategy: 'Advanced AND/OR with legal term optimization'
      };
    }
  },
  
  read_file: {
    description: 'Read the full contents of a German law file (WARNING: may be very large)',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' }
      },
      required: ['file']
    },
    handler: async ({ file }) => {
      const full = path.resolve(ROOT_ABS, file);
      if (!full.startsWith(ROOT_ABS)) {
        throw new Error('Path traversal blocked');
      }
      const content = await fs.readFile(full, 'utf8');
      const size = content.length;
      const lines = content.split('\n').length;
      
      // Warn if file is very large and truncate
      if (size > 300000) { // 300KB limit
        return { 
          file, 
          warning: `WARNING: This file is very large (${Math.round(size/1024)}KB, ${lines} lines). Content truncated. Use get_file_info and read_file_chunk for large files.`,
          size_bytes: size,
          lines: lines,
          content: content.slice(0, 200000) + '\n\n[... CONTENT TRUNCATED - Use read_file_chunk to get more ...]',
          truncated: true
        };
      }
      
      return { file, content, size_bytes: size, lines: lines };
    }
  },
  
  get_file_info: {
    description: 'Get metadata about a German law file including size',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' }
      },
      required: ['file']
    },
    handler: async ({ file }) => {
      const full = path.resolve(ROOT_ABS, file);
      if (!full.startsWith(ROOT_ABS)) {
        throw new Error('Path traversal blocked');
      }
      const content = await fs.readFile(full, 'utf8');
      const size = content.length;
      const lines = content.split('\n').length;
      const words = content.split(/\s+/).length;
      
      // Extract some structure info
      const headerMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let title = 'Unknown';
      if (headerMatch) {
        const titleMatch = headerMatch[1].match(/Title:\s*(.+)/);
        if (titleMatch) title = titleMatch[1];
      }
      
      // Count paragraphs (§ symbols)
      const paragraphs = (content.match(/§\s*\d+/g) || []).length;
      
      return {
        file,
        title,
        size_bytes: size,
        size_kb: Math.round(size / 1024),
        lines: lines,
        words: words,
        estimated_paragraphs: paragraphs,
        recommendation: size > 300000 ? 
          'This file is very large. Use read_file_chunk to read portions, or search_files to find specific content.' :
          'This file can be read with read_file.',
        chunks_needed: Math.ceil(lines / 500)
      };
    }
  },
  
  read_file_chunk: {
    description: 'Read a specific chunk of a large German law file',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        start_line: { type: 'number', description: 'Starting line number (1-based)' },
        num_lines: { type: 'number', description: 'Number of lines to read (max 500)', default: 100 }
      },
      required: ['file', 'start_line']
    },
    handler: async ({ file, start_line, num_lines = 100 }) => {
      const full = path.resolve(ROOT_ABS, file);
      if (!full.startsWith(ROOT_ABS)) {
        throw new Error('Path traversal blocked');
      }
      
      // Limit chunk size to prevent context overflow
      const maxLines = Math.min(num_lines, 500);
      
      const content = await fs.readFile(full, 'utf8');
      const lines = content.split('\n');
      const totalLines = lines.length;
      
      const startIdx = Math.max(0, start_line - 1); // Convert to 0-based
      const endIdx = Math.min(totalLines, startIdx + maxLines);
      
      const chunk = lines.slice(startIdx, endIdx).join('\n');
      
      return {
        file,
        chunk_content: chunk,
        start_line: start_line,
        end_line: startIdx + (endIdx - startIdx),
        lines_in_chunk: endIdx - startIdx,
        total_lines: totalLines,
        has_more: endIdx < totalLines,
        next_chunk_start: endIdx + 1
      };
    }
  },
  
  find_and_read: {
    description: 'Find text in a German law file and read context around it (MOST EFFICIENT for specific paragraphs)',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        search_text: { type: 'string', description: 'Text to search for (e.g., "§ 823", "Schadensersatzpflicht")' },
        context_lines: { type: 'number', description: 'Lines of context before and after match (default 50)', default: 50 }
      },
      required: ['file', 'search_text']
    },
    handler: async ({ file, search_text, context_lines = 50 }) => {
      const full = path.resolve(ROOT_ABS, file);
      if (!full.startsWith(ROOT_ABS)) {
        throw new Error('Path traversal blocked');
      }
      
      // Limit context to prevent overflow
      const maxContext = Math.min(context_lines, 200);
      
      const content = await fs.readFile(full, 'utf8');
      const lines = content.split('\n');
      const totalLines = lines.length;
      
      // Find all matching lines
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(search_text.toLowerCase())) {
          matches.push({
            line_number: i + 1, // 1-based
            content: lines[i].trim(),
            match_index: i
          });
        }
      }
      
      if (matches.length === 0) {
        return {
          file,
          search_text,
          found: false,
          message: `Text "${search_text}" not found in file`,
          suggestion: 'Try a broader search term or check spelling'
        };
      }
      
      // Use the first match (or could be enhanced to find best match)
      const match = matches[0];
      const matchLine = match.match_index;
      
      // Calculate context window
      const startIdx = Math.max(0, matchLine - maxContext);
      const endIdx = Math.min(totalLines, matchLine + maxContext + 1);
      
      const contextContent = lines.slice(startIdx, endIdx).join('\n');
      
      // Calculate relative position of match within the context
      const matchRelativeLine = matchLine - startIdx + 1;
      
      return {
        file,
        search_text,
        found: true,
        matches_found: matches.length,
        selected_match: {
          line_number: match.line_number,
          content: match.content
        },
        context: {
          content: contextContent,
          start_line: startIdx + 1,
          end_line: endIdx,
          total_lines: endIdx - startIdx,
          match_at_line: matchRelativeLine
        },
        other_matches: matches.slice(1, 5).map(m => ({ // Show up to 4 other matches
          line_number: m.line_number,
          preview: m.content.slice(0, 100)
        })),
        file_stats: {
          total_lines: totalLines,
          match_position: `${Math.round((matchLine / totalLines) * 100)}% through file`
        }
      };
    }
  }
};

// Initialize handler
server.setRequestHandler(InitializeRequestSchema, async (_req) => {
  return {
    protocolVersion: '2024-11-05',
    serverInfo: { name: 'legal-files', version: '0.1.0' },
    capabilities: { tools: toolsCapability }
  };
});

// Tool call handler
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools[req.params.name];
  if (!tool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }] };
  }
  try {
    const args = req.params.arguments ?? {};
    const result = await tool.handler(args);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`legal-files MCP server started. Root: ${ROOT_ABS}`);