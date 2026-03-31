# OpenUI - Claude Code Agent Manager

## Project Overview

OpenUI is a visual management interface for Claude Code agents. It provides a canvas-based UI for organizing, monitoring, and interacting with multiple Claude sessions simultaneously. The project integrates git worktrees, SSH connections, and terminal emulation into a unified dashboard.

**Key Features:**
- Visual canvas with drag-and-drop agent organization
- Real-time terminal integration via xterm.js
- Git worktree management and quick creation
- SSH session support
- State persistence across sessions
- Claude Code plugin for status reporting

## Architecture

OpenUI follows a client-server architecture with a Claude Code plugin integration:

```
┌─────────────────────────────────────────────┐
│  Client (React + ReactFlow + xterm.js)     │
│  - Visual canvas/list views                │
│  - WebSocket terminal connections          │
│  - Zustand state management                │
└─────────────────┬───────────────────────────┘
                  │ WebSocket + REST API
┌─────────────────▼───────────────────────────┐
│  Server (Hono + node-pty)                  │
│  - WebSocket handlers                       │
│  - PTY/SSH session management               │
│  - State persistence                        │
│  - Git worktree operations                  │
└─────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│  Claude Code Plugin                         │
│  - Status reporting hooks                   │
│  - Session tracking                         │
└─────────────────────────────────────────────┘
```

## Client Components

The client is a React application with ReactFlow for canvas visualization and xterm.js for terminal emulation.

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| **App** | `client/src/App.tsx` | Main application with ReactFlow canvas and ListView toggle. Handles session creation, deletion, and layout management. |
| **AgentNode** | `client/src/components/AgentNode/` | Visual agent cards displaying session status, git branch, hostname, and last status message. Shows terminal modal. |
| **CategoryNode** | `client/src/components/CategoryNode.tsx` | Group containers for organizing agents on the canvas. Supports drag-and-drop organization. |
| **Terminal** | `client/src/components/Terminal.tsx` | WebSocket-connected xterm.js terminal with buffer replay. Handles resize and clipboard operations. |
| **ShellTerminal** | `client/src/components/ShellTerminal.tsx` | Standalone shell terminal component for executing commands in any directory. |
| **Sidebar** | `client/src/components/Sidebar.tsx` | Details panel showing selected agent information, terminal output, and control buttons. |
| **Header** | `client/src/components/Header.tsx` | Top navigation with New Session, Worktree, Shell, Settings buttons and layout mode toggle. |
| **NewSessionModal** | `client/src/components/NewSessionModal.tsx` | Modal for creating new agents with worktree/SSH/directory options. Integrates with worktree configs. |
| **SettingsModal** | `client/src/components/SettingsModal.tsx` | App settings including skipPermissions toggle and worktree configuration. |
| **WorktreeModal** | `client/src/components/WorktreeModal.tsx` | Quick worktree creation with GitHub issue/PR fetching and auto-branch naming. |
| **ListView** | `client/src/components/ListView/` | Alternative list-based view of sessions with collapsible sections and filtering. |

### State Management

| File | Purpose |
|------|---------|
| **useStore** | `client/src/stores/useStore.ts` | Zustand store managing sessions, nodes, categories, UI mode (canvas/list), layout mode (tabbed/split), and settings. |

### Client-Server Communication

**WebSocket Protocol:**
- `/ws/:sessionId` - Terminal data stream (bidirectional)
- Message format: `{ type: 'data', data: string }` or `{ type: 'resize', cols: number, rows: number }`

**REST API Endpoints:**
- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create new session
- `DELETE /api/sessions/:id` - Delete session
- `GET /api/sessions/:id/buffer` - Get terminal buffer
- `POST /api/state/save` - Save state
- `POST /api/state/load` - Load state
- `GET /api/worktree-configs` - Get worktree configs
- `POST /api/worktree-configs` - Save worktree config
- `DELETE /api/worktree-configs/:id` - Delete worktree config
- `POST /api/github/issue/:number` - Fetch GitHub issue
- `POST /api/github/pr/:number` - Fetch GitHub PR

## Server Modules

The server uses Hono framework with WebSocket support and node-pty for terminal emulation.

### Core Modules

| Module | File | Purpose |
|--------|------|---------|
| **index.ts** | `server/index.ts` | Main server entry point. Sets up Hono app, WebSocket handlers, and serves static files. Manages terminal connections and PTY lifecycle. |
| **api.ts** | `server/routes/api.ts` | REST API route handlers for session management, state persistence, worktree configs, and GitHub integration. |
| **sessionManager.ts** | `server/services/sessionManager.ts` | Core service managing PTY sessions, SSH connections, and git worktree operations. Handles session creation, cleanup, and buffer management. |
| **persistence.ts** | `server/services/persistence.ts` | State save/load logic for sessions, nodes, and categories. Creates `.openui/` directory structure. |
| **worktreeConfig.ts** | `server/services/worktreeConfig.ts` | Manages worktree repository configurations stored in `.openui/config.json`. |
| **github.ts** | `server/services/github.ts` | GitHub API integration for fetching issue/PR titles and descriptions. |

### Session Types

**Local PTY Session:**
- Spawns `bash` or `zsh` in specified directory
- Uses `node-pty` for terminal emulation
- Supports buffer replay for reconnection

**SSH Session:**
- Connects via SSH using provided credentials
- Automatically changes to specified remote directory
- Proxies terminal data over WebSocket

**Worktree Session:**
- Creates git worktree in parent directory
- Optionally creates branch from issue/PR
- Changes to worktree directory in terminal

## Storage Locations

OpenUI stores data in multiple locations depending on the data type and scope.

### 1. Project Directory (`.openui/`)

Created in the directory where OpenUI is launched (CWD).

| File | Purpose |
|------|---------|
| `.openui/state.json` | Persisted state including sessions, nodes, categories, positions, connections, and UI settings. |
| `.openui/config.json` | Worktree configurations and skipPermissions setting. |
| `.openui/buffers/<sessionId>.txt` | Terminal output history for each session (up to 50,000 lines). Used for buffer replay. |

**state.json structure:**
```json
{
  "sessions": [...],        // Session metadata
  "nodes": [...],          // ReactFlow node positions
  "categories": [...],     // Category definitions
  "uiMode": "canvas",      // "canvas" or "list"
  "layoutMode": "tabbed",  // "tabbed" or "split"
  "skipPermissions": false // Permission flag
}
```

**config.json structure:**
```json
{
  "worktreeConfigs": [...], // Array of worktree repo configs
  "skipPermissions": false  // Permission setting
}
```

### 2. Home Directory (`~/.openui/`)

User-level storage for plugin and session tracking.

| Path | Purpose |
|------|---------|
| `~/.openui/claude-code-plugin/` | Installed Claude Code plugin files (manifest, hooks, skills). |
| `~/.openui/sessions/<sessionId>.id` | Claude session IDs for resuming sessions. Format: plain text file with session ID. |

### 3. Browser localStorage

Client-side preferences stored in the browser.

| Key | Purpose |
|-----|---------|
| `openui-ui-mode` | UI mode preference: "canvas" or "list". |
| `openui-list-sections` | List view section configurations (collapsed state, filters). |
| `openui-list-panel-width` | Sidebar panel width in pixels. |
| `openui-layout-mode` | Layout mode: "tabbed" or "split". |
| `openui-recent-dirs-<host>` | Recent directories used on specific host (for directory picker). |

### 4. Temporary Files

| Path | Purpose |
|------|---------|
| `/tmp/openui-plugin-debug.log` | Plugin debug logs for troubleshooting Claude Code integration. |

## Development

### Setup

```bash
# Install dependencies
npm install

# Development mode (client + server with hot reload)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Key Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Starts Vite dev server (client) and Hono server with hot reload. |
| `npm run build` | Builds client to `dist/` and compiles TypeScript server to `dist-server/`. |
| `npm start` | Runs production server serving built client. |
| `npm run install-plugin` | Installs Claude Code plugin to `~/.openui/claude-code-plugin/`. |

### Project Structure

```
openui/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── stores/        # Zustand state
│   │   ├── App.tsx        # Main app
│   │   └── main.tsx       # Entry point
│   └── package.json
├── server/                # Hono backend
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── types/            # TypeScript types
│   └── index.ts          # Server entry
├── claude-code-plugin/   # Claude Code integration
│   ├── plugin.json       # Plugin manifest
│   ├── hooks/            # Event hooks
│   └── skills/           # Custom skills
└── package.json          # Root package
```

## WebSocket Protocol

OpenUI uses WebSocket for real-time terminal communication.

### Connection

```
ws://localhost:3000/ws/:sessionId
```

### Message Types

**Client → Server:**
```typescript
{ type: 'data', data: string }           // Terminal input
{ type: 'resize', cols: number, rows: number }  // Terminal resize
```

**Server → Client:**
```typescript
{ type: 'data', data: string }           // Terminal output
{ type: 'exit', code: number }           // Session exited
```

### Buffer Replay

When a WebSocket reconnects, the server:
1. Sends entire buffer history from `.openui/buffers/<sessionId>.txt`
2. Continues streaming new output
3. Buffers are capped at 50,000 lines

## Claude Code Plugin Integration

The plugin (`claude-code-plugin/`) provides status reporting hooks that track Claude sessions.

### Plugin Components

| File | Purpose |
|------|---------|
| `plugin.json` | Manifest defining plugin metadata and components. |
| `hooks/pre-compact.md` | Hook that fires before context compaction to report status. |
| `hooks/user-prompt-submit.md` | Hook that fires on user prompt to track activity. |

### Status Reporting

The plugin writes status updates to `~/.openui/sessions/<sessionId>.id` which OpenUI monitors to display:
- Current task/status message
- Last activity timestamp
- Git branch information
- Working directory

### Installation

```bash
npm run install-plugin
# Installs to ~/.openui/claude-code-plugin/
# Symlink to ~/.claude/plugins/openui for Claude Code to load
```

## Key APIs

### Session Management

**Creating a Session:**
```typescript
POST /api/sessions
{
  type: 'worktree' | 'ssh' | 'directory',
  name: string,
  // For worktree:
  worktreeConfig?: { repo: string, parentPath: string },
  branchName?: string,
  // For SSH:
  sshConfig?: { host, username, password, remotePath },
  // For directory:
  directory?: string
}
```

**Response:**
```typescript
{
  id: string,
  name: string,
  type: string,
  status: 'running' | 'exited',
  gitBranch?: string,
  claudeSessionId?: string
}
```

### State Persistence

**Saving State:**
```typescript
POST /api/state/save
{
  sessions: [...],
  nodes: [...],
  categories: [...],
  uiMode: 'canvas' | 'list',
  layoutMode: 'tabbed' | 'split',
  skipPermissions: boolean
}
```

**Loading State:**
```typescript
POST /api/state/load
// Returns saved state or empty state if none exists
```

### Worktree Operations

Git worktree management is handled in `sessionManager.ts`:

```typescript
// Create worktree
createWorktree(config, branchName, issueNumber?)
// Creates: <parentPath>/<branchName>/
// Switches to new branch if branchName provided
```

## Tips for Development

1. **State Persistence**: State is auto-saved on changes. Check `.openui/state.json` to debug.
2. **Buffer Management**: Terminal buffers are in `.openui/buffers/`. Clear these to reset history.
3. **WebSocket Debugging**: Check browser DevTools → Network → WS for message inspection.
4. **Plugin Logs**: Check `/tmp/openui-plugin-debug.log` for Claude Code integration issues.
5. **SSH Sessions**: Ensure SSH credentials are correct. Password is stored in memory only (not persisted).
6. **Worktree Cleanup**: Worktrees are NOT auto-deleted. Clean up manually with `git worktree remove`.

## Common Workflows

### Creating a Worktree Session
1. Click "New Worktree" in header
2. Select worktree config (or create new)
3. Enter branch name or fetch from GitHub issue/PR
4. Submit → Creates worktree and opens terminal

### Organizing Agents
1. Create category nodes on canvas
2. Drag agent nodes into categories
3. State auto-saves positions

### Using List View
1. Toggle "List" in header
2. Sections: Running, Exited, etc.
3. Click session → Shows terminal in side panel
4. Supports filtering and collapsible sections
