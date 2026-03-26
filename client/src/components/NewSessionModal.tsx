import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  FolderOpen,
  FolderPlus,
  Terminal,
  Plus,
  Minus,
  Loader2,
  GitBranch,
  AlertCircle,
  Home,
  ArrowUp,
  Clock,
  Download,
} from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useStore, Agent, AgentSession } from "../stores/useStore";


interface NewSessionModalProps {
  open: boolean;
  onClose: () => void;
  // If provided, we're replacing an existing session on this node
  existingSession?: AgentSession;
  existingNodeId?: string;
}

// Node dimensions for collision detection
const NODE_WIDTH = 200;
const NODE_HEIGHT = 120;
const SPACING = 24; // Grid snap size

// Find a free position near the target that doesn't overlap existing nodes
function findFreePosition(
  targetX: number,
  targetY: number,
  existingNodes: { position?: { x: number; y: number } }[],
  count: number = 1
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const GRID = SPACING;

  // Snap target to grid
  const startX = Math.round(targetX / GRID) * GRID;
  const startY = Math.round(targetY / GRID) * GRID;

  // Filter to only nodes with valid positions
  const validNodes = existingNodes.filter(
    (n): n is { position: { x: number; y: number } } =>
      n.position !== undefined &&
      typeof n.position.x === 'number' &&
      typeof n.position.y === 'number'
  );

  // Check if a position overlaps with any existing node or already-placed new node
  const isOverlapping = (x: number, y: number, placedPositions: { x: number; y: number }[]) => {
    const allPositions = [...validNodes.map(n => n.position), ...placedPositions];
    for (const pos of allPositions) {
      const overlapX = Math.abs(x - pos.x) < NODE_WIDTH + SPACING;
      const overlapY = Math.abs(y - pos.y) < NODE_HEIGHT + SPACING;
      if (overlapX && overlapY) return true;
    }
    return false;
  };

  // Spiral outward from target position to find free spots
  for (let i = 0; i < count; i++) {
    let found = false;
    let radius = 0;
    const maxRadius = 20; // Max search radius in grid units

    while (!found && radius <= maxRadius) {
      // Try positions in a spiral pattern
      for (let dx = -radius; dx <= radius && !found; dx++) {
        for (let dy = -radius; dy <= radius && !found; dy++) {
          // Only check positions on the current ring
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;

          const x = startX + dx * (NODE_WIDTH + SPACING);
          const y = startY + dy * (NODE_HEIGHT + SPACING);

          if (!isOverlapping(x, y, positions)) {
            positions.push({ x, y });
            found = true;
          }
        }
      }
      radius++;
    }

    // Fallback if no free position found
    if (!found) {
      positions.push({
        x: startX + i * (NODE_WIDTH + SPACING),
        y: startY,
      });
    }
  }

  return positions;
}

export function NewSessionModal({
  open,
  onClose,
  existingSession,
  existingNodeId,
}: NewSessionModalProps) {
  const {
    agents,
    addNode,
    addSession,
    updateSession,
    nodes,
    launchCwd,
  } = useStore();

  // Get ReactFlow instance to access viewport
  const reactFlowInstance = useReactFlow();

  const isReplacing = !!existingSession;

  // Form state
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [cwd, setCwd] = useState("");
  const [customName, setCustomName] = useState("");
  const [useOpus, setUseOpus] = useState<boolean>(false);
  const [commandArgs, setCommandArgs] = useState("");
  const [count, setCount] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  // Branch/worktree state
  const [branchName, setBranchName] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [createWorktree, setCreateWorktree] = useState(true);

  // Directory picker state
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [dirBrowsePath, setDirBrowsePath] = useState("");
  const [dirBrowseParent, setDirBrowseParent] = useState<string | null>(null);
  const [dirBrowseDirs, setDirBrowseDirs] = useState<{ name: string; path: string }[]>([]);
  const [dirBrowseLoading, setDirBrowseLoading] = useState(false);
  const [dirBrowseError, setDirBrowseError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Remote host state (kept for infrastructure compatibility, but UI hidden)
  const [remote, setRemote] = useState<string>("");

  // Recent directories
  const [recentDirs, setRecentDirs] = useState<string[]>([]);

  // Tab state: "new" or "import"
  const [activeTab, setActiveTab] = useState<"new" | "import">("new");

  // Import tab state
  const [claudeSessions, setClaudeSessions] = useState<{ sessionId: string; cwd: string; firstPrompt?: string; startedAt: number; alreadyImported: boolean }[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedClaudeSession, setSelectedClaudeSession] = useState<string | null>(null);

  // Track if we've initialized for this modal open
  const [initialized, setInitialized] = useState(false);

  // Update cwd, recent dirs, and close dir picker when remote changes
  useEffect(() => {
    setShowDirPicker(false);
    setCwd("~/universe");
    setRecentDirs(loadRecentDirs(remote || undefined));
  }, [remote]);

  const DEFAULT_CWD = "~/universe";
  const MAX_RECENT_DIRS = 5;

  const recentDirsKey = (host?: string) =>
    host ? `openui-recent-dirs-${host}` : "openui-recent-dirs";

  const loadRecentDirs = (host?: string): string[] => {
    try {
      return JSON.parse(localStorage.getItem(recentDirsKey(host)) || "[]");
    } catch { return []; }
  };

  const saveRecentDir = (dir: string, host?: string) => {
    if (!dir) return;
    const key = recentDirsKey(host);
    const recent = loadRecentDirs(host).filter(d => d !== dir);
    recent.unshift(dir);
    localStorage.setItem(key, JSON.stringify(recent.slice(0, MAX_RECENT_DIRS)));
  };

  // Reset form when modal opens (only once per open)
  useEffect(() => {
    if (open && !initialized) {
      // Auto-select Claude Code agent
      const claudeAgent = agents.find((a) => a.id === "claude");

      if (existingSession) {
        // Pre-fill from existing session
        const agent = agents.find((a) => a.id === existingSession.agentId);
        setSelectedAgent(agent || claudeAgent || null);
        setCwd(existingSession.cwd);
        setCustomName(existingSession.customName || "");
        setCommandArgs("");
        setCount(1);
      } else {
        setSelectedAgent(claudeAgent || null);
        setCwd(DEFAULT_CWD);
        setCustomName("");
        setCommandArgs("");
        setCount(1);
      }
      setRemote("");
      setRecentDirs(loadRecentDirs());
      setUseOpus(false);
      setInitialized(true);
    } else if (!open) {
      setInitialized(false);
      setActiveTab("new");
      setSelectedClaudeSession(null);
      setClaudeSessions([]);
      setImportError(null);
    }
  }, [open, initialized, existingSession, agents]);

  const fetchClaudeSessions = async () => {
    setImportLoading(true);
    setImportError(null);
    try {
      const res = await fetch("/api/claude-sessions");
      const data = await res.json();
      if (Array.isArray(data)) {
        setClaudeSessions(data);
      } else {
        setImportError(data.error || "Failed to load sessions");
      }
    } catch (e: any) {
      setImportError(e.message);
    } finally {
      setImportLoading(false);
    }
  };

  // Directory browsing
  const browsePath = async (path?: string) => {
    setDirBrowseLoading(true);
    setDirBrowseError(null);
    setShowNewFolder(false);
    try {
      const params = new URLSearchParams();
      if (path) params.set("path", path);
      if (remote) params.set("remote", remote);
      const url = `/api/browse?${params.toString()}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        setDirBrowseError(data.error);
      } else {
        setDirBrowsePath(data.current);
        setDirBrowseParent(data.parent);
        setDirBrowseDirs(data.directories);
      }
    } catch (e: any) {
      setDirBrowseError(e.message);
    } finally {
      setDirBrowseLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !dirBrowsePath) return;
    setCreatingFolder(true);
    try {
      const fullPath = `${dirBrowsePath}/${newFolderName.trim()}`;
      const res = await fetch("/api/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath, ...(remote && { remote }) }),
      });
      const data = await res.json();
      if (data.error) {
        setDirBrowseError(data.error);
      } else {
        setNewFolderName("");
        setShowNewFolder(false);
        // Refresh and select the new folder
        await browsePath(dirBrowsePath);
        selectDirectory(fullPath);
      }
    } catch (e: any) {
      setDirBrowseError(e.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  const openDirPicker = () => {
    setShowDirPicker(true);
    browsePath(remote ? "~" : (cwd || launchCwd));
  };

  const selectDirectory = (path: string) => {
    setCwd(path);
    setShowDirPicker(false);
  };

  const handleClose = () => {
    onClose();
  };

  const handleCreate = async () => {
    if (!selectedAgent) return;

    setIsCreating(true);

    try {
      const workingDir = cwd || (isReplacing ? existingSession?.cwd : null) || launchCwd;
      saveRecentDir(workingDir, remote || undefined);

      // Build model flags
      const modelFlags = useOpus ? "--model opus" : "";

      // Combine command with model flags and arguments
      const fullCommand = selectedAgent.command
        ? `${selectedAgent.command} ${modelFlags}${commandArgs ? ` ${commandArgs}` : ""}`
        : `${modelFlags}${commandArgs ? ` ${commandArgs}` : ""}`;

      // If replacing existing session, delete it first
      if (isReplacing && existingSession && existingNodeId) {
        await fetch(`/api/sessions/${existingSession.sessionId}`, { method: "DELETE" });

        // Create the replacement session
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: selectedAgent.id,
            agentName: selectedAgent.name,
            command: fullCommand,
            cwd: workingDir,
            nodeId: existingNodeId,
            customName: customName || existingSession.customName,
            customColor: existingSession.customColor,
            ...(remote && { remote }),
          }),
        });

        if (res.ok) {
          const { sessionId: newSessionId, gitBranch, cwd: newCwd } = await res.json();
          updateSession(existingNodeId, {
            sessionId: newSessionId,
            agentId: selectedAgent.id,
            agentName: selectedAgent.name,
            command: fullCommand,
            cwd: newCwd || workingDir,
            status: "idle",
            isRestored: false,
            gitBranch: gitBranch || branchName || undefined,
            remote: remote || undefined,
          });
        }
      } else {
        // Creating new agent(s)
        // Get the center of the current viewport
        const viewport = reactFlowInstance.getViewport();
        const viewportBounds = document.querySelector('.react-flow')?.getBoundingClientRect();
        const viewportWidth = viewportBounds?.width || window.innerWidth;
        const viewportHeight = viewportBounds?.height || window.innerHeight;

        // Convert viewport center to flow coordinates
        const centerX = (-viewport.x + viewportWidth / 2) / viewport.zoom;
        const centerY = (-viewport.y + viewportHeight / 2) / viewport.zoom;

        // Find free positions near viewport center for all new agents
        const freePositions = findFreePosition(centerX, centerY, nodes, count);

        for (let i = 0; i < count; i++) {
          const nodeId = `node-${Date.now()}-${i}`;
          const agentName = count > 1
            ? `${customName || selectedAgent.name} ${i + 1}`
            : customName || selectedAgent.name;

          const res = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId: selectedAgent.id,
              agentName: selectedAgent.name,
              command: fullCommand,
              cwd: workingDir,
              nodeId,
              customName: count > 1 ? agentName : customName || undefined,
              ...(remote && { remote }),
            }),
          });

          const { sessionId, gitBranch, cwd: newCwd } = await res.json();

          const { x, y } = freePositions[i];

          addNode({
            id: nodeId,
            type: "agent",
            position: { x, y },
            data: {
              label: agentName,
              agentId: selectedAgent.id,
              color: selectedAgent.color,
              icon: selectedAgent.icon,
              sessionId,
            },
          });

          addSession(nodeId, {
            id: nodeId,
            sessionId,
            agentId: selectedAgent.id,
            agentName: selectedAgent.name,
            command: fullCommand,
            color: selectedAgent.color,
            createdAt: new Date().toISOString(),
            cwd: newCwd || workingDir,
            gitBranch: gitBranch || undefined,
            status: "idle",
            customName: count > 1 ? agentName : customName || undefined,
            remote: remote || undefined,
          });
        }
      }

      handleClose();
    } catch (error) {
      console.error("Failed to create session:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleImport = async () => {
    if (!selectedClaudeSession) return;
    const claudeSession = claudeSessions.find(s => s.sessionId === selectedClaudeSession);
    if (!claudeSession) return;

    setIsCreating(true);
    try {
      const claudeAgent = agents.find(a => a.id === "claude");
      if (!claudeAgent) return;

      const nodeId = `node-${Date.now()}-0`;
      const viewport = reactFlowInstance.getViewport();
      const viewportBounds = document.querySelector('.react-flow')?.getBoundingClientRect();
      const viewportWidth = viewportBounds?.width || window.innerWidth;
      const viewportHeight = viewportBounds?.height || window.innerHeight;
      const centerX = (-viewport.x + viewportWidth / 2) / viewport.zoom;
      const centerY = (-viewport.y + viewportHeight / 2) / viewport.zoom;
      const [pos] = findFreePosition(centerX, centerY, nodes, 1);

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: claudeAgent.id,
          agentName: claudeAgent.name,
          command: claudeAgent.command,
          cwd: claudeSession.cwd,
          nodeId,
          claudeSessionId: claudeSession.sessionId,
        }),
      });

      const { sessionId, gitBranch, cwd: newCwd } = await res.json();

      addNode({
        id: nodeId,
        type: "agent",
        position: pos,
        data: {
          label: claudeAgent.name,
          agentId: claudeAgent.id,
          color: claudeAgent.color,
          icon: claudeAgent.icon,
          sessionId,
        },
      });

      addSession(nodeId, {
        id: nodeId,
        sessionId,
        agentId: claudeAgent.id,
        agentName: claudeAgent.name,
        command: claudeAgent.command,
        color: claudeAgent.color,
        createdAt: new Date().toISOString(),
        cwd: newCwd || claudeSession.cwd,
        gitBranch: gitBranch || undefined,
        status: "idle",
      });

      handleClose();
    } catch (error) {
      console.error("Failed to import session:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-lg mx-4">
              <div className="rounded-xl bg-surface border border-border shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-4">
                    <h2 className="text-base font-semibold text-white">
                      {isReplacing ? "New Session" : "New Agent"}
                    </h2>
                    {!isReplacing && (
                      <div className="flex gap-1 bg-canvas rounded-md p-0.5">
                        <button
                          onClick={() => setActiveTab("new")}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${activeTab === "new" ? "bg-surface text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                        >
                          New
                        </button>
                        <button
                          onClick={() => { setActiveTab("import"); fetchClaudeSessions(); }}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${activeTab === "import" ? "bg-surface text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                        >
                          <Download className="w-3 h-3" />
                          Import
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleClose}
                    className="w-7 h-7 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-surface-active transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Import tab content */}
                {activeTab === "import" && (
                  <div className="flex-1 overflow-y-auto p-5">
                    {importLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                      </div>
                    ) : importError ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-2">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                        <p className="text-xs text-red-400">{importError}</p>
                      </div>
                    ) : claudeSessions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-500">
                        <Download className="w-5 h-5" />
                        <p className="text-xs">No Claude sessions found in ~/.claude/sessions/</p>
                      </div>
                    ) : claudeSessions.every(s => s.alreadyImported) ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-500">
                        <Download className="w-5 h-5" />
                        <p className="text-xs text-center">All existing Claude sessions are already tracked in OpenUI.</p>
                        <p className="text-[11px] text-center text-zinc-600">Run Claude Code in another directory to create new importable sessions.</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <p className="text-xs text-zinc-500 mb-3">Select a session to resume it in OpenUI</p>
                        {claudeSessions.map(s => (
                          <button
                            key={s.sessionId}
                            onClick={() => !s.alreadyImported && setSelectedClaudeSession(s.sessionId)}
                            disabled={s.alreadyImported}
                            className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors ${
                              s.alreadyImported
                                ? "border-border bg-canvas opacity-50 cursor-not-allowed"
                                : selectedClaudeSession === s.sessionId
                                ? "border-zinc-500 bg-surface"
                                : "border-border bg-canvas hover:border-zinc-600 hover:bg-surface"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-mono text-zinc-400 truncate flex-1">{s.cwd}</span>
                              {s.alreadyImported && (
                                <span className="text-[10px] text-zinc-500 flex-shrink-0">imported</span>
                              )}
                            </div>
                            {s.firstPrompt && (
                              <p className="text-xs text-white mt-1 line-clamp-2 leading-relaxed">{s.firstPrompt}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-zinc-600 font-mono">{s.sessionId.slice(0, 8)}…</span>
                              <span className="text-[10px] text-zinc-600">{new Date(s.startedAt).toLocaleString()}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* New agent content */}
                {activeTab !== "import" && (
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Name & Count (only for new agents) */}
                  {!isReplacing && (
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-2">
                        <label className="text-xs text-zinc-500">Name (optional)</label>
                        <input
                          type="text"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          placeholder={selectedAgent?.name || "My Agent"}
                          className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                        />
                      </div>
                      <div className="w-28 space-y-2">
                        <label className="text-xs text-zinc-500">Count</label>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setCount(Math.max(1, count - 1))}
                            className="w-8 h-9 rounded-md bg-canvas border border-border text-zinc-400 hover:text-white hover:bg-surface-active transition-colors flex items-center justify-center"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            value={count}
                            onChange={(e) =>
                              setCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))
                            }
                            min={1}
                            max={20}
                            className="w-10 h-9 rounded-md bg-canvas border border-border text-white text-sm text-center focus:outline-none focus:border-zinc-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            onClick={() => setCount(Math.min(20, count + 1))}
                            className="w-8 h-9 rounded-md bg-canvas border border-border text-zinc-400 hover:text-white hover:bg-surface-active transition-colors flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Use Opus toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-zinc-400">Use Model Opus</label>
                    <button
                      onClick={() => setUseOpus(!useOpus)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        useOpus ? "bg-violet-600" : "bg-zinc-700"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          useOpus ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Command arguments */}
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500 flex items-center gap-1.5">
                      <Terminal className="w-3 h-3" />
                      {selectedAgent?.command ? "Arguments (optional)" : "Command"}
                    </label>
                    <input
                      type="text"
                      value={commandArgs}
                      onChange={(e) => setCommandArgs(e.target.value)}
                      placeholder={selectedAgent?.command ? "e.g. --model opus or --resume" : "e.g. ralph --monitor, ralph-setup, ralph-import"}
                      className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                    />
                    {selectedAgent && (selectedAgent.command || commandArgs) && (
                      <p className="text-[10px] text-zinc-600 font-mono">
                        {selectedAgent.command}{selectedAgent.command && commandArgs ? " " : ""}{commandArgs}
                      </p>
                    )}
                  </div>

                  {/* Working directory */}
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500 flex items-center gap-1.5">
                      <FolderOpen className="w-3 h-3" />
                      Working Directory
                    </label>
                    {recentDirs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {recentDirs.map((dir) => (
                          <button
                            key={dir}
                            onClick={() => setCwd(dir)}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                              cwd === dir
                                ? "bg-white/10 text-white border border-zinc-500"
                                : "bg-canvas border border-border text-zinc-400 hover:text-white hover:border-zinc-500"
                            }`}
                          >
                            <Clock className="w-2.5 h-2.5 flex-shrink-0" />
                            {dir.split("/").slice(-2).join("/")}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={cwd}
                        onChange={(e) => setCwd(e.target.value)}
                        placeholder={existingSession?.cwd || launchCwd || "~/"}
                        className="flex-1 px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                      />
                      <button
                        type="button"
                        onClick={openDirPicker}
                        className="px-3 py-2 rounded-md bg-canvas border border-border text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
                        title="Browse directories"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Directory picker inline panel */}
                    {showDirPicker && (
                      <div className="rounded-md border border-border bg-canvas overflow-hidden">
                        {/* Current path header */}
                        <div className="px-3 py-2 bg-surface border-b border-border flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {dirBrowseParent && (
                              <button
                                onClick={() => browsePath(dirBrowseParent)}
                                className="p-1 rounded hover:bg-surface-active text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                                title="Go up"
                              >
                                <ArrowUp className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => browsePath("~")}
                              className="p-1 rounded hover:bg-surface-active text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                              title="Home directory"
                            >
                              <Home className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-mono text-zinc-400 truncate" title={dirBrowsePath}>
                              {dirBrowsePath}
                            </span>
                          </div>
                          <button
                            onClick={() => { setShowNewFolder(!showNewFolder); setNewFolderName(""); }}
                            className="p-1 rounded hover:bg-surface-active text-zinc-400 hover:text-white transition-colors flex-shrink-0 ml-1"
                            title="New folder"
                          >
                            <FolderPlus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setShowDirPicker(false)}
                            className="p-1 rounded hover:bg-surface-active text-zinc-500 hover:text-white transition-colors flex-shrink-0 ml-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* New folder form */}
                        {showNewFolder && (
                          <div className="px-3 py-2 border-b border-border flex gap-2">
                            <input
                              type="text"
                              value={newFolderName}
                              onChange={(e) => setNewFolderName(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                              placeholder="Folder name"
                              autoFocus
                              className="flex-1 px-2 py-1 rounded bg-surface border border-border text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                            />
                            <button
                              onClick={handleCreateFolder}
                              disabled={!newFolderName.trim() || creatingFolder}
                              className="px-2 py-1 rounded bg-orange-600 text-white text-xs font-medium hover:bg-orange-500 disabled:opacity-50 transition-colors"
                            >
                              {creatingFolder ? "..." : "Create"}
                            </button>
                          </div>
                        )}

                        {/* Directory list */}
                        <div className="max-h-40 overflow-y-auto">
                          {dirBrowseLoading ? (
                            <div className="p-4 text-center">
                              <Loader2 className="w-4 h-4 text-zinc-500 animate-spin mx-auto" />
                            </div>
                          ) : dirBrowseError ? (
                            <div className="p-3 text-center">
                              <AlertCircle className="w-4 h-4 text-red-500 mx-auto mb-1" />
                              <p className="text-xs text-red-400">{dirBrowseError}</p>
                            </div>
                          ) : dirBrowseDirs.length === 0 ? (
                            <div className="p-4 text-center text-zinc-500 text-xs">
                              No subdirectories
                            </div>
                          ) : (
                            dirBrowseDirs.map((dir) => (
                              <div
                                key={dir.path}
                                className="flex items-center border-b border-border last:border-b-0"
                              >
                                <button
                                  onClick={() => browsePath(dir.path)}
                                  className="flex-1 flex items-center gap-2 px-3 py-2 hover:bg-surface-active transition-colors text-left"
                                >
                                  <FolderOpen className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                                  <span className="text-sm text-white truncate">{dir.name}</span>
                                </button>
                                <button
                                  onClick={() => selectDirectory(dir.path)}
                                  className="px-3 py-2 text-xs text-zinc-500 hover:text-white hover:bg-surface-active transition-colors border-l border-border"
                                >
                                  Select
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Select current directory button */}
                        <div className="px-3 py-2 border-t border-border">
                          <button
                            onClick={() => selectDirectory(dirBrowsePath)}
                            className="w-full px-3 py-1.5 rounded-md text-xs font-medium text-white bg-surface-active hover:bg-zinc-700 transition-colors"
                          >
                            Select current: {dirBrowsePath.split("/").pop() || dirBrowsePath}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )} {/* end activeTab !== "import" */}

                {/* Footer */}
                <div className="px-5 py-3 bg-canvas border-t border-border flex justify-end gap-2 flex-shrink-0">
                  <button
                    onClick={handleClose}
                    className="px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
                  >
                    Cancel
                  </button>
                  {activeTab === "import" ? (
                    <button
                      onClick={handleImport}
                      disabled={!selectedClaudeSession || isCreating}
                      className="px-4 py-1.5 rounded-md text-sm font-medium text-canvas bg-white hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isCreating ? "Importing..." : "Import & Resume"}
                    </button>
                  ) : (
                  <button
                    onClick={handleCreate}
                    disabled={!selectedAgent || isCreating || (!selectedAgent?.command && !commandArgs)}
                    className="px-4 py-1.5 rounded-md text-sm font-medium text-canvas bg-white hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isCreating
                      ? "Creating..."
                      : isReplacing
                      ? "Start Session"
                      : count > 1
                      ? `Create ${count} Agents`
                      : "Create"}
                  </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
