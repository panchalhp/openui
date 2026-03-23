# OpenUI

**Your AI Agent Command Center**

Manage multiple AI coding agents working in parallel on an infinite canvas. See what each agent is working on, their status, and jump in when they need help.

## Features

- **At-a-glance status**: See which agents are working, idle, or need input
- **Git worktree integration**: Each agent works in its own isolated branch
- **Visual organization**: Drag-and-drop canvas with categories for grouping agents
- **Terminal integration**: Built-in terminal access for each session
- **Persistent state**: All sessions and layouts persist across restarts

## Installation

### Prerequisites

Install Bun if you haven't already:
```bash
curl -fsSL https://bun.sh/install | bash
```

### Setup

```bash
# Clone the repository
git clone https://github.com/panchalhp/openui.git
cd openui

# Install dependencies
bun install
cd client && bun install && cd ..

# Start the application
bun run dev
```

The web interface will open at `http://localhost:6969`.

## Quick Start

1. Navigate to your project directory and run the application
2. Click "New Session" to create an agent
3. Choose between:
   - **Worktree**: Create a git worktree for isolated branch work
   - **SSH**: Connect to a remote server
   - **Directory**: Start in a local directory
4. Click any session to open its terminal
5. Organize sessions by dragging them into categories

### Canvas Management
- Infinite canvas for organizing agents
- Drag-and-drop positioning
- Categories for grouping agents by team/project
- Custom names and colors per agent
- Persistent layout across restarts

### Agent Monitoring
- Real-time status tracking
- Git branch display per agent
- Directory/repo info
- Terminal output monitoring

### Session Management
- Multiple session types (worktree, SSH, directory)
- Session persistence and restore
- Terminal buffer history with replay capability
- GitHub issue/PR integration for worktree creation

## How It Works

OpenUI runs a local server that:
- Spawns PTY sessions for each session (local terminal, SSH, or git worktree)
- Streams terminal I/O over WebSocket connections
- Persists session state and layouts to `.openui/` in your project directory
- Provides a React-based web interface for visual organization

## Tech Stack

- **Runtime**: Bun
- **Backend**: Hono + WebSockets + node-pty
- **Frontend**: React + React Flow + xterm.js
- **State**: Zustand

## Storage

All state is stored in `.openui/` in your project directory:
- `state.json` - Session metadata and canvas layout
- `config.json` - Worktree configurations and settings
- `buffers/` - Terminal output history for each session

## License

MIT
