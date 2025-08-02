import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { InitializeRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fg from 'fast-glob';
import fs from 'fs/promises';
import path from 'path';

const ROOT = process.env.REPAIR_FILES_ROOT || path.resolve(process.cwd(), '../../data/repair_shop');
const ROOT_ABS = path.resolve(ROOT);

const toolsCapability = {
  list_files: {
    description: 'List files under the dataset root or a subdirectory',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'relative directory under root', default: '' }
      }
    }
  },
  search_files: {
    description: 'Search for a case-insensitive text across files (glob filter optional)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        glob: { type: 'string', description: 'glob like **/*.csv' }
      },
      required: ['query']
    }
  },
  read_file: {
    description: 'Read the full contents of a file relative to dataset root',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' }
      },
      required: ['file']
    }
  }
};

const server = new Server(
  { name: 'repair-files', version: '0.1.0' },
  { capabilities: { tools: toolsCapability } }
);

async function listFiles(rel = '') {
  const base = path.resolve(ROOT_ABS, rel);
  const entries = await fg(['**/*'], { cwd: base, dot: false, onlyFiles: true });
  return entries.map(e => path.join(rel, e));
}

const tools = {
  list_files: {
    description: 'List files under the dataset root or a subdirectory',
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
    description: 'Search for a case-insensitive text across files (glob filter optional)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        glob: { type: 'string', description: 'glob like **/*.csv' }
      },
      required: ['query']
    },
    handler: async ({ query, glob }) => {
      const patterns = glob ? [glob] : ['**/*'];
      const files = await fg(patterns, { cwd: ROOT_ABS, onlyFiles: true, dot: false });
      const q = query.toLowerCase();
      const matches = [];
      for (const f of files) {
        const full = path.join(ROOT_ABS, f);
        try {
          const text = await fs.readFile(full, 'utf8');
          const ltext = text.toLowerCase();
          const idx = ltext.indexOf(q);
          if (idx >= 0) {
            const start = Math.max(0, idx - 80);
            const end = Math.min(text.length, idx + 80);
            matches.push({ file: f, preview: text.slice(start, end) });
          }
        } catch {}
      }
      return { matches };
    }
  },
  read_file: {
    description: 'Read the full contents of a file relative to dataset root',
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
      return { file, content };
    }
  }
};

// Explicitly handle initialize using SDK schema to avoid handshake stalls
server.setRequestHandler(InitializeRequestSchema, async (_req) => {
  // Align with SDK client expectation (newer protocol)
  return {
    protocolVersion: '2024-11-05',
    serverInfo: { name: 'repair-files', version: '0.1.0' },
    capabilities: { tools: toolsCapability }
  };
});

// Handle CallTool requests
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools[req.params.name];
  if (!tool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }] };
  }
  const args = req.params.arguments ?? {};
  const result = await tool.handler(args);
  // Return as text to maximize compatibility with client content schema
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`repair-files MCP server started. Root: ${ROOT_ABS}`);
