import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, Loader2, ChevronDown } from "lucide-react";
import { useStore } from "../stores/useStore";

interface WorktreeRepo {
  name: string;
  path: string;
  baseBranch: string;
  sparseCheckout?: boolean;
  sparseCheckoutPaths?: string[];
  remote?: string;
}

interface InvestigationModalProps {
  open: boolean;
  onClose: () => void;
}

type UrlType = "pagerduty" | "jira" | "slack" | "unknown";

function detectUrlType(url: string): UrlType {
  if (/pagerduty\.com/i.test(url)) return "pagerduty";
  if (/jira|atlassian/i.test(url)) return "jira";
  if (/slack\.com/i.test(url)) return "slack";
  return "unknown";
}

function extractIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    // Grab last meaningful path segment as ID
    if (parts.length > 0) {
      return parts[parts.length - 1].replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 30);
    }
  } catch {}
  return Date.now().toString(36);
}

function generateBranchName(url: string, type: UrlType): string {
  const id = extractIdFromUrl(url);
  const prefix = type === "unknown" ? "misc" : type === "pagerduty" ? "pd" : type;
  return `investigation/${prefix}-${id}`;
}

export function InvestigationModal({ open, onClose }: InvestigationModalProps) {
  const { addSession, addNode, nodes } = useStore();
  const [repos, setRepos] = useState<WorktreeRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<WorktreeRepo | null>(null);
  const [customName, setCustomName] = useState("");
  const [url, setUrl] = useState("");
  const [createWorktree, setCreateWorktree] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlType = useMemo(() => detectUrlType(url), [url]);

  // Load repos when modal opens
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      setError(null);
      fetch("/api/worktree/config")
        .then((res) => res.json())
        .then((config) => {
          const allRepos: WorktreeRepo[] = config.worktreeRepos || [];
          setRepos(allRepos);
          // Default to first repo with "arca" remote, or first repo
          const arcaRepo = allRepos.find((r) => r.remote === "arca");
          setSelectedRepo(arcaRepo || allRepos[0] || null);
        })
        .catch((e) => {
          console.error("Failed to load worktree config:", e);
          setError("Failed to load repository configuration");
        })
        .finally(() => setIsLoading(false));
    } else {
      // Reset form
      setCustomName("");
      setUrl("");
      setBranchName("");
      setCreateWorktree(false);
      setError(null);
    }
  }, [open]);

  // Auto-update based on URL type
  useEffect(() => {
    if (!url.trim()) return;
    const type = detectUrlType(url);
    // Auto-generate branch name
    setBranchName(generateBranchName(url, type));
  }, [url]);

  const handleCreate = async () => {
    if (!selectedRepo) return;

    setIsCreating(true);
    setError(null);

    try {
      const nodeId = `node-${Date.now()}`;
      const type = detectUrlType(url);

      // Build the command — server will inject investigation plugins from settings
      const command = "isaac";

      // Use custom name if provided, otherwise default to "Investigation"
      const displayName = customName.trim() || "Investigation";

      const body: Record<string, unknown> = {
        agentId: "claude",
        agentName: "Claude Code",
        command,
        cwd: selectedRepo.path,
        nodeId,
        customName: displayName,
        categoryId: "oncall-todo",
        remote: selectedRepo.remote,
        isInvestigation: true,
        investigationUrl: url.trim() || undefined,
      };

      if (createWorktree && branchName.trim()) {
        body.branchName = branchName.trim();
        body.baseBranch = selectedRepo.baseBranch;
        body.createWorktree = true;
        body.sparseCheckout = selectedRepo.sparseCheckout;
        body.sparseCheckoutPaths = selectedRepo.sparseCheckoutPaths;
      }

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create session");
      }

      const maxX = nodes.reduce((max, n) => Math.max(max, (n.position?.x || 0)), 0);
      const newNode = {
        id: nodeId,
        type: "agent",
        position: { x: maxX + 420, y: 100 },
        data: { nodeId, label: displayName },
      };
      addNode(newNode);

      addSession(nodeId, {
        id: nodeId,
        sessionId: data.sessionId,
        agentId: "claude",
        agentName: "Claude Code",
        customName: displayName,
        command,
        color: "#06B6D4",
        createdAt: new Date().toISOString(),
        cwd: data.cwd || selectedRepo.path,
        gitBranch: data.gitBranch || branchName.trim() || undefined,
        originalCwd: selectedRepo.path,
        status: createWorktree ? "creating" : "waiting_input",
        creationProgress: createWorktree ? "Initializing..." : undefined,
        remote: selectedRepo.remote,
        categoryId: "oncall-todo",
        investigationUrl: url.trim() || undefined,
      });

      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to create investigation");
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-md mx-4">
              <div className="bg-surface rounded-xl border border-border shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-cyan-500/20 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-cyan-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">New Investigation</h2>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-canvas transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
                    </div>
                  ) : repos.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-zinc-400 mb-2">No repositories configured</p>
                      <p className="text-xs text-zinc-600">Add repositories in Settings to start investigations</p>
                    </div>
                  ) : (
                    <>
                      {/* Repo selector */}
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1.5">Repository</label>
                        <div className="relative">
                          <select
                            value={selectedRepo?.path || ""}
                            onChange={(e) => {
                              const repo = repos.find((r) => r.path === e.target.value);
                              setSelectedRepo(repo || null);
                            }}
                            className="w-full px-3 py-2 pr-8 rounded-md bg-canvas border border-border text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors appearance-none cursor-pointer"
                          >
                            {repos.map((repo) => (
                              <option key={repo.path} value={repo.path}>
                                {repo.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                        </div>
                        {selectedRepo?.remote && (
                          <span className="inline-block mt-1 text-[10px] text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-500/10">
                            {selectedRepo.remote}
                          </span>
                        )}
                      </div>

                      {/* Name input */}
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1.5">
                          Name (optional)
                        </label>
                        <input
                          type="text"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          placeholder="Investigation"
                          className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                          autoFocus
                        />
                      </div>

                      {/* URL input */}
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1.5">
                          Investigation URL (optional)
                        </label>
                        <input
                          type="text"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          placeholder="PagerDuty, JIRA, or Slack URL"
                          className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && selectedRepo) {
                              handleCreate();
                            }
                          }}
                        />
                        {url.trim() && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                urlType === "pagerduty"
                                  ? "bg-green-500/10 text-green-400"
                                  : urlType === "jira"
                                  ? "bg-blue-500/10 text-blue-400"
                                  : urlType === "slack"
                                  ? "bg-purple-500/10 text-purple-400"
                                  : "bg-zinc-500/10 text-zinc-400"
                              }`}
                            >
                              {urlType === "pagerduty"
                                ? "PagerDuty"
                                : urlType === "jira"
                                ? "JIRA"
                                : urlType === "slack"
                                ? "Slack"
                                : "Unknown"}
                            </span>
                            <span className="text-[10px] text-zinc-600">
                              {urlType === "slack" ? "Chat investigation" : "Incident investigation"}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Create worktree toggle */}
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-zinc-400">Create worktree</label>
                        <button
                          onClick={() => setCreateWorktree(!createWorktree)}
                          className={`relative w-9 h-5 rounded-full transition-colors ${
                            createWorktree ? "bg-cyan-600" : "bg-zinc-700"
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              createWorktree ? "left-[18px]" : "left-0.5"
                            }`}
                          />
                        </button>
                      </div>

                      {/* Branch name (visible when worktree is ON) */}
                      {createWorktree && (
                        <div>
                          <label className="text-xs text-zinc-500 block mb-1.5">Branch name</label>
                          <input
                            type="text"
                            value={branchName}
                            onChange={(e) => setBranchName(e.target.value)}
                            placeholder="investigation/pd-ABC123"
                            className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono text-xs"
                          />
                          {selectedRepo && (
                            <p className="text-xs text-zinc-600 mt-1">
                              Based on <span className="text-zinc-400">{selectedRepo.baseBranch}</span>
                            </p>
                          )}
                        </div>
                      )}

                      {error && (
                        <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                          {error}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
                  <button
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-canvas transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={isCreating || !selectedRepo || repos.length === 0}
                    className="px-4 py-1.5 rounded-md text-sm font-medium bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4" />
                        Start Investigation
                      </>
                    )}
                  </button>
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
