# German Legal Agent v0.1

> ⚖️ An intelligent German legal QA agent with MCP (Model Context Protocol) integration for accessing comprehensive German federal law database and providing legal analysis.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18.0+-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-green.svg)](https://modelcontextprotocol.io/)

## 🚀 Overview

This German legal agent provides expert legal analysis by intelligently accessing the comprehensive German federal law database through the Model Context Protocol (MCP). It can answer legal questions, explain regulations, analyze legal scenarios, and provide precise legal references by querying the complete German federal law collection in real-time.

### Key Capabilities
- **Legal Data Access**: Comprehensive access to all German federal laws and regulations (Bundesgesetze und -verordnungen)
- **Multi-LLM Support**: Works with both local (Ollama) and cloud-based (OpenRouter) language models
- **Tool-Calling Architecture**: Automatic legal document retrieval without manual intervention
- **Real-Time Monitoring**: Complete visibility into legal database queries and system operations
- **Clean Interface**: Filtered chat experience with technical details in separate monitoring panel

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React UI      │    │   LLM Provider  │    │  German Law DB  │
│                 │    │                 │    │                 │
│ • Chat Interface│◄──►│ • Ollama        │◄──►│ • Federal Laws  │
│ • Provider Setup│    │ • OpenRouter    │    │ • Regulations   │
│ • MCP Monitoring│    │ • Tool Calling  │    │ • Legal Codes   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                       ▲                       ▲
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   MCP Proxy     │
                    │                 │
                    │ • Protocol Hub  │
                    │ • Data Bridge   │
                    │ • Tool Registry │
                    └─────────────────┘
```

## ⚡ Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- (Optional) Ollama for local models
- (Optional) OpenRouter API key for cloud models

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd german-legal-agent
```

2. **Install dependencies**
```bash
# Frontend
cd app && npm install

# MCP Server
cd ../server && npm install

# MCP Tools
cd ../mcp-servers/legal-files && npm install
```

3. **Configure your data source**
```bash
# Set your German law data directory (use absolute path on your system)
export LEGAL_FILES_ROOT="$(pwd)/data/gesetze"
```

### 🚀 Running the Application

#### Start All Services (Recommended)
```bash
# From project root
./scripts/start-all.sh
```

#### Manual Service Management

1. **Start MCP Proxy Server**
```bash
cd server
LEGAL_FILES_ROOT="$(pwd)/../data/gesetze" npm start
```

2. **Start Frontend**
```bash
cd app
npm run dev
```

3. **Access the application**
- **Frontend**: http://localhost:5173
- **MCP Proxy**: http://localhost:8787

## 🎯 Features

### Core Functionality
- ✅ **Intelligent Legal Analysis**: Multi-iteration reasoning for complex legal questions
- ✅ **Real-Time Legal Data Access**: Live querying of German federal law database
- ✅ **Multi-Provider Support**: Choice between local and cloud-based language models
- ✅ **Enhanced Monitoring**: Detailed logging of all data operations
- ✅ **Clean Chat Interface**: Customer-focused view with technical details hidden

### Advanced Features
- ✅ **Tool Call Visualization**: See exactly what data is being accessed
- ✅ **Parameter Tracking**: Monitor search queries and file access patterns
- ✅ **Error Handling**: Graceful degradation with helpful error messages
- ✅ **Iteration Control**: Automatic continuation until customer question is fully answered

## 🛠️ Configuration

### LLM Providers

#### Option 1: Ollama (Local)
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull qwen3:8b

# Model will be available at localhost:11434
```

#### Option 2: OpenRouter (Cloud)
1. Get API key from [OpenRouter](https://openrouter.ai/)
2. In the application, select "OpenRouter" provider
3. Enter your API key
4. Choose a model (e.g., `anthropic/claude-3.5-sonnet`)

### Data Sources

The bot can be configured to access various business data sources:

```javascript
// German Law Database Structure
data/gesetze/
├── a/                    // Laws starting with 'A'
│   ├── agg/             // Allgemeines Gleichbehandlungsgesetz
│   │   └── index.md     // Full law text in Markdown
│   └── arbzg/           // Arbeitszeitgesetz
├── b/                   // Laws starting with 'B'
└── ...                  // All German federal laws A-Z
```

## 📊 Usage Examples

### Legal QA Scenarios

**Employment Law Question**
```
User: "What are the maximum working hours allowed in Germany?"
Agent: [Accesses Arbeitszeitgesetz] → "According to § 3 ArbZG, the daily working time must not exceed 8 hours. It can be extended to 10 hours if compensated within 6 months or 24 weeks."
```

**Anti-Discrimination Law**
```
User: "What constitutes discrimination based on age under German law?"
Agent: [Searches AGG] → "Under § 1 AGG (Allgemeines Gleichbehandlungsgesetz), age-based discrimination is prohibited. § 10 AGG allows different treatment only if objectively justified by legitimate aims."
```

**Legal Reference Lookup**
```
User: "What does § 823 BGB say about tort liability?"
Agent: [Queries BGB] → "§ 823 BGB establishes the fundamental principle of tort liability: whoever unlawfully and culpably injures another's life, body, health, freedom, property, or similar rights must compensate for damages."
```

## 🔧 Development

### Project Structure
```
german-legal-agent/
├── app/                    # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── lib/           # Core logic
│   │   └── styles/        # CSS styles
├── server/                # MCP proxy server
├── mcp-servers/          # MCP tool implementations
├── data/gesetze/         # German federal law database
└── docs/                 # Documentation
```

### Development Commands

```bash
# Run tests
npm test

# Type checking
npm run type-check

# Linting
npm run lint

# Build for production
npm run build
```

### Adding New Data Sources

1. Create MCP tool for your data source
2. Register tool in MCP server
3. Update system prompt with tool descriptions
4. Test with sample queries

## 🚀 Deployment

### Production Build
```bash
# Build frontend
cd app && npm run build

# Build server
cd ../server && npm run build

# Deploy to your hosting platform
```

### Environment Variables
```bash
LEGAL_FILES_ROOT="./data/gesetze"  # Relative to project root
OPENROUTER_API_KEY="your-api-key"
MCP_SERVER_PORT=8787
FRONTEND_PORT=5173
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📖 **Documentation**: [Wiki](../../wiki)
- 🐛 **Bug Reports**: [Issues](../../issues)
- 💬 **Discussions**: [Discussions](../../discussions)
- 📧 **Email**: support@example.com

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) for the integration framework
- [Anthropic](https://anthropic.com/) for MCP development
- [React](https://reactjs.org/) and [TypeScript](https://www.typescriptlang.org/) for the frontend
- [Ollama](https://ollama.com/) for local LLM support

---

**Version**: 1.0.0 | **Last Updated**: December 2024
