import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface ShellTerminalProps {
  sessionId: string;
  cwd?: string;
  color: string;
  remote?: { host: string; user: string };
}

export function ShellTerminal({ sessionId, cwd, color, remote }: ShellTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!terminalRef.current || !sessionId) return;

    // Prevent double mount in strict mode
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Clear container completely
    while (terminalRef.current.firstChild) {
      terminalRef.current.removeChild(terminalRef.current.firstChild);
    }

    // Create terminal
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
      fontFamily: '"Monaco", monospace',
      fontWeight: "400",
      lineHeight: 1.0,
      letterSpacing: 0,
      theme: {
        background: "#0d0d0d",
        foreground: "#d4d4d4",
        cursor: color,
        cursorAccent: "#0d0d0d",
        selectionBackground: "#3b3b3b",
        selectionForeground: "#ffffff",
        black: "#1a1a1a",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#fbbf24",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#d4d4d4",
        brightBlack: "#525252",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fcd34d",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#ffffff",
      },
      allowProposedApi: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);

    // Reset all terminal attributes
    term.write("\x1b[0m\x1b[?25h");

    setTimeout(() => fitAddon.fit(), 50);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket to shell endpoint
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams({ sessionId });
    if (cwd) params.set("cwd", cwd);
    if (remote) params.set("remote", JSON.stringify(remote));
    const wsUrl = `${protocol}//${window.location.host}/ws/shell?${params.toString()}`;

    let ws: WebSocket | null = null;

    const connectWs = () => {
      if (!mountedRef.current) return;

      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (xtermRef.current && ws) {
          ws.send(JSON.stringify({
            type: "resize",
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "output") {
            term.write(msg.data);

            // Prevent scrolling to absolute bottom - leave space for visibility
            setTimeout(() => {
              const viewport = terminalRef.current?.querySelector('.xterm-viewport') as HTMLElement;
              if (viewport) {
                const maxScroll = viewport.scrollHeight - viewport.clientHeight;
                const targetScroll = maxScroll - 48; // Leave 48px space at bottom
                if (viewport.scrollTop > targetScroll) {
                  viewport.scrollTop = targetScroll;
                }
              }
            }, 0);
          }
        } catch (e) {
          // If not JSON, write raw data
          term.write(event.data);
        }
      };

      ws.onerror = () => {
        // Silently handle errors
      };

      ws.onclose = () => {
        // Handle close event
      };
    };

    // Small delay to let server session be ready
    const connectTimeout = setTimeout(connectWs, 100);

    term.onData((data) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
        }
        if (ws?.readyState === WebSocket.OPEN && xtermRef.current) {
          ws.send(JSON.stringify({
            type: "resize",
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows
          }));
        }
      });
    });

    resizeObserver.observe(terminalRef.current);

    return () => {
      mountedRef.current = false;
      clearTimeout(connectTimeout);
      resizeObserver.disconnect();
      ws?.close();
      term.dispose();
    };
  }, [sessionId, color, cwd, remote]);

  return (
    <div
      ref={terminalRef}
      className="w-full h-full"
      style={{
        padding: "12px 12px 32px 12px",
        backgroundColor: "#0d0d0d",
        minHeight: "200px"
      }}
    />
  );
}
