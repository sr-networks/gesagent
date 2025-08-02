# Customer Service Bot v0.1

> 🤖 An intelligent customer service chatbot with MCP (Model Context Protocol) integration for accessing business data and providing automated support.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18.0+-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-green.svg)](https://modelcontextprotocol.io/)

## 🚀 Overview

This customer service bot provides automated support for businesses by intelligently accessing company datasets through the Model Context Protocol (MCP). It can answer customer inquiries about services, orders, products, and more by querying structured business data in real-time.

### Key Capabilities
- **Data-Driven Responses**: Access customer records, service history, inventory, and business information
- **Multi-LLM Support**: Works with both local (Ollama) and cloud-based (OpenRouter) language models
- **Tool-Calling Architecture**: Automatic data retrieval without manual intervention
- **Real-Time Monitoring**: Complete visibility into data queries and system operations
- **Clean Interface**: Filtered chat experience with technical details in separate monitoring panel

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React UI      │    │   LLM Provider  │    │  Business Data  │
│                 │    │                 │    │                 │
│ • Chat Interface│◄──►│ • Ollama        │◄──►│ • Customer DB   │
│ • Provider Setup│    │ • OpenRouter    │    │ • Service Logs  │
│ • MCP Monitoring│    │ • Tool Calling  │    │ • Product Info  │
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
cd customer-service-bot
```

2. **Install dependencies**
```bash
# Frontend
cd app && npm install

# MCP Server
cd ../server && npm install

# MCP Tools
cd ../mcp-servers/repair-files && npm install
```

3. **Configure your data source**
```bash
# Set your business data directory (use absolute path on your system)
export REPAIR_FILES_ROOT="$(pwd)/data"
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
REPAIR_FILES_ROOT="$(pwd)/../data" npm start
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
- ✅ **Intelligent Query Processing**: Multi-iteration reasoning for complex customer requests
- ✅ **Real-Time Data Access**: Live querying of business databases and files
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
// Example data structure
data/
├── customers.json          // Customer records
├── services.csv           // Service history
├── products/             // Product information
├── orders/              // Order tracking
└── knowledge-base/      // FAQ and policies
```

## 📊 Usage Examples

### Customer Service Scenarios

**Order Status Inquiry**
```
Customer: "What's the status of my order #12345?"
Bot: [Accesses order database] → "Your order #12345 was shipped yesterday and will arrive tomorrow via UPS."
```

**Product Information**
```
Customer: "Do you have brake pads for a 2018 Honda Civic?"
Bot: [Searches inventory] → "Yes, we have OEM brake pads in stock for your 2018 Civic. Part #BP-HC18, $89.99."
```

**Service History**
```
Customer: "When was my last oil change?"
Bot: [Queries service records] → "Your last oil change was on March 15th, 2024. Based on your driving, the next one is due around June 15th."
```

## 🔧 Development

### Project Structure
```
customer-service-bot/
├── app/                    # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── lib/           # Core logic
│   │   └── styles/        # CSS styles
├── server/                # MCP proxy server
├── mcp-servers/          # MCP tool implementations
├── data/                 # Sample business data
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
REPAIR_FILES_ROOT="./data"  # Relative to project root
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
