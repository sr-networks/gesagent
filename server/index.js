/* Lightweight backend proxy to expose MCP tools over HTTP for the frontend.
 * Endpoints:
 *  - GET  /health
 *  - GET  /tools                  -> list available tools
 *  - POST /tools/call             -> { name: string, arguments?: object }
 *  - GET  /files?dir=...          -> convenience wrapper for list_files
 *
 * This version uses the official MCP Client + Stdio transport to connect to the
 * local MCP server (mcp-servers/legal-files/server.js) so the initialize
 * handshake and tool calls are handled by the SDK.
 */
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const PORT = process.env.PORT || 8787;

// Resolve absolute repo root and MCP path regardless of current cwd
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// Path to the MCP server entry (absolute)
const MCP_CMD = process.env.MCP_CMD || 'node';
const MCP_ARGS = process.env.MCP_ARGS
  ? JSON.parse(process.env.MCP_ARGS)
  : [path.join(REPO_ROOT, 'mcp-servers/legal-files/server.js')];

const app = express();
app.use(cors());
app.use(express.json());

/**
 * MCP client wrapper using the official SDK client + stdio transport.
 */
class MCPProcess {
  constructor(cmd, args, env) {
    // Prepare transport to spawn the MCP server as a child process
    this.transport = new StdioClientTransport({
      command: cmd,
      args,
      env: {
        ...env,
        // Ensure dataset root is absolute and stable
        LEGAL_FILES_ROOT: env.LEGAL_FILES_ROOT || path.join(REPO_ROOT, 'data/gesetze')
      }
    });

    // Create SDK client; it manages initialize handshake internally
    this.client = new Client(
      { name: 'mcp-proxy', version: '0.1.0' },
      {
        capabilities: {
          // no special capabilities needed
        }
      }
    );

    // Connect and wait until ready
    this.initPromise = (async () => {
      await this.client.connect(this.transport);
      // Some client versions may not expose waitForReady; defensively wait a bit
      if (typeof this.client.waitForReady === 'function') {
        await this.client.waitForReady();
      } else {
        await new Promise((r) => setTimeout(r, 100));
      }
    })();
  }

  async callTool(name, args = {}) {
    await this.initPromise;
    // Perform a tool call via SDK
    const res = await this.client.callTool({ name, arguments: args });
    // The SDK returns a content array; extract json if present for convenience
    const item = Array.isArray(res?.content) ? res.content.find((c) => c.type === 'json') : null;
    return item?.json ?? res;
  }
}

// Start MCP child process via SDK client transport
const mcp = new MCPProcess(MCP_CMD, MCP_ARGS, process.env);

// Health
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Simple tool list (static mirror of the legal-files server)
app.get('/tools', (req, res) => {
  res.json({
    tools: [
      { name: 'list_files', description: 'List German law files under the dataset root or a subdirectory' },
      { name: 'search_files', description: 'Search for case-insensitive text across German law files with advanced AND/OR logic' },
      { name: 'read_file', description: 'Read the full contents of a German law file (WARNING: may be very large)' },
      { name: 'get_file_info', description: 'Get metadata about a German law file including size' },
      { name: 'read_file_chunk', description: 'Read a specific chunk of a large German law file' },
      { name: 'find_and_read', description: 'Find text in a German law file and read context around it (MOST EFFICIENT for specific paragraphs)' },
    ]
  });
});

/**
 * Generic call endpoint.
 * Example:
 *   curl -s -X POST http://localhost:8787/tools/call \
 *     -H 'Content-Type: application/json' \
 *     -d '{"name":"read_file","arguments":{"file":"a/agg/index.md"}}'
 */
app.post('/tools/call', async (req, res) => {
  try {
    const body = req.body || {};
    const toolName = body.name;
    const toolArgs = body.arguments || {};

    if (!toolName || typeof toolName !== 'string') {
      return res.status(400).json({ error: 'name required' });
    }

    const result = await mcp.callTool(toolName, toolArgs);
    return res.json(result);
  } catch (e) {
    const msg = String(e?.message || e);
    const status = /timeout/i.test(msg) ? 504 : 500;
    return res.status(status).json({ error: msg });
  }
});

// Convenience wrapper: list files
app.get('/files', async (req, res) => {
  try {
    const dir = req.query.dir ? String(req.query.dir) : '';
    const result = await mcp.callTool('list_files', { dir });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`MCP proxy listening on http://localhost:${PORT}`);
});
