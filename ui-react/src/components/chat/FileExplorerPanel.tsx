import React, { useCallback, useEffect, useRef, useState } from "react";
import { parseAgentSessionKey } from "../../../client-core/sessions/session-key-utils.js";
import { useAppStore } from "../../store/appStore.ts";

// ─── 网关 RPC 类型 ──────────────────────────────────────────

type WsEntry = {
  path: string;
  name: string;
  kind: "directory" | "file";
  size?: number;
  updatedAtMs?: number;
  mimeType?: string;
};

type WsListResult = {
  agentId: string;
  path: string;
  parentPath?: string | null;
  entries: WsEntry[];
  totalEntries: number;
};

type WsGetResult = {
  agentId: string;
  file: {
    path: string;
    name: string;
    size?: number;
    updatedAtMs?: number;
    mimeType?: string;
    encoding?: string;
    content?: string;
  };
};

type FsListResult = {
  path: string;
  parent?: string | null;
  home?: string;
  entries: Array<{ name: string; path: string; hidden?: boolean }>;
};

type ViewerState = {
  path: string;
  name: string;
  mimeType: string;
  size: number;
  updatedAtMs?: number;
  content: string;
  encoding: string;
};

// ─── 工具函数 ───────────────────────────────────────────────

function formatSize(bytes?: number): string {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ms?: number): string {
  if (typeof ms !== "number" || ms <= 0) {
    return "";
  }
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dirname(p: string): string {
  const idx = p.replace(/\/+$/, "").lastIndexOf("/");
  return idx <= 0 ? "/" : p.slice(0, idx);
}

const TEXT_EXTENSIONS =
  /\.(md|txt|json|ya?ml|toml|ini|cfg|conf|sh|bash|zsh|py|js|ts|tsx|jsx|mjs|cjs|css|html?|xml|csv|log|env|gitignore|dockerfile|makefile|sql|rb|go|rs|java|c|cpp|h|hpp|php|lua|pl|swift|kt|r|dat)$/i;

function isImageMime(mime: string, name: string): boolean {
  if (mime.startsWith("image/")) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(name);
}

function isLikelyText(mime: string, name: string): boolean {
  if (mime.startsWith("text/") || mime === "application/json" || mime.includes("yaml")) {
    return true;
  }
  if (isImageMime(mime, name)) {
    return false;
  }
  return TEXT_EXTENSIONS.test(name) || mime === "application/octet-stream" || !mime;
}

// ─── 图标 ───────────────────────────────────────────────────

const FolderIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);

const FileIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
  </svg>
);

const RefreshIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const ChevronIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

// ─── 面板条目（统一目录/文件两种来源） ──────────────────────

type PanelEntry = {
  absPath: string;
  name: string;
  isDir: boolean;
  size?: number;
  updatedAtMs?: number;
  /** workspace 相对路径（仅 workspace 内条目） */
  wsPath?: string;
};

// ─── 主组件 ─────────────────────────────────────────────────

export function FileExplorerPanel() {
  const client = useAppStore((s) => s.client);
  const connected = useAppStore((s) => s.connected);
  const sessionKey = useAppStore((s) => s.sessionKey);

  const agentId = parseAgentSessionKey(sessionKey)?.agentId ?? "main";

  // workspace 绝对路径（由 agents.files.list 获得）
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  // 当前目录绝对路径；"" = 尚未初始化
  const [dir, setDir] = useState("");
  const [entries, setEntries] = useState<PanelEntry[]>([]);
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const reqSeq = useRef(0);

  const openclawRoot = workspacePath ? dirname(workspacePath) : null;

  const fetchList = useCallback(
    async (targetDir: string) => {
      if (!client || !connected || !workspacePath) {
        return;
      }
      const seq = ++reqSeq.current;
      setLoading(true);
      setError(null);
      try {
        const inWorkspace =
          targetDir === workspacePath || targetDir.startsWith(workspacePath + "/");

        if (inWorkspace) {
          // workspace 内：用 agents.workspace.list（目录+文件、大小、时间）
          const rel = targetDir === workspacePath ? "" : targetDir.slice(workspacePath.length + 1);
          const params: Record<string, unknown> = { agentId };
          if (rel) {
            params.path = rel;
          }
          const res = await client.request<WsListResult | null>("agents.workspace.list", params);
          if (seq !== reqSeq.current) {
            return;
          }
          const list = res?.entries ?? [];
          const mapped: PanelEntry[] = list.map((e) => {
            const abs =
              e.path.startsWith("/") && e.path.startsWith(workspacePath)
                ? e.path
                : `${workspacePath}/${e.path.replace(/^\//, "")}`;
            return {
              absPath: abs,
              name: e.name,
              isDir: e.kind === "directory",
              size: e.size,
              updatedAtMs: e.updatedAtMs,
              wsPath:
                e.path.startsWith("/") && e.path.startsWith(workspacePath)
                  ? e.path.slice(workspacePath.length).replace(/^\//, "")
                  : e.path,
            };
          });
          setEntries(mapped);
          setParentDir(targetDir === workspacePath ? openclawRoot : dirname(targetDir));
        } else {
          // OpenClaw 根目录及其它区域：fs.listDir（仅目录）
          const res = await client.request<FsListResult | null>("fs.listDir", {
            path: targetDir,
          });
          if (seq !== reqSeq.current) {
            return;
          }
          const list = res?.entries ?? [];
          const mapped: PanelEntry[] = list.map((e) => ({
            absPath: e.path,
            name: e.name,
            isDir: true,
          }));
          mapped.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true }));
          setEntries(mapped);
          setParentDir(res?.parent ?? dirname(targetDir));
        }
      } catch (err) {
        if (seq === reqSeq.current) {
          setError(String(err instanceof Error ? err.message : err));
          setEntries([]);
        }
      } finally {
        if (seq === reqSeq.current) {
          setLoading(false);
        }
      }
    },
    [client, connected, agentId, workspacePath, openclawRoot],
  );

  // 初始化：取 workspace 绝对路径 → 定位到 OpenClaw 根目录
  useEffect(() => {
    let alive = true;
    setWorkspacePath(null);
    setDir("");
    setEntries([]);
    setViewer(null);
    setError(null);
    (async () => {
      if (!client || !connected) {
        return;
      }
      try {
        const res = await client.request<{ workspace?: string } | null>("agents.files.list", {
          agentId,
        });
        if (!alive) {
          return;
        }
        const ws = res?.workspace ?? "";
        if (ws) {
          setWorkspacePath(ws.replace(/\/+$/, ""));
        } else {
          setError("无法获取 workspace 路径");
        }
      } catch (err) {
        if (alive) {
          setError(String(err instanceof Error ? err.message : err));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, connected, agentId]);

  // workspace 就绪后首次列出 OpenClaw 根目录
  useEffect(() => {
    if (openclawRoot) {
      setDir(openclawRoot);
      void fetchList(openclawRoot);
    }
  }, [openclawRoot, fetchList]);

  const openFile = useCallback(
    async (entry: PanelEntry) => {
      if (!client || !connected || !entry.wsPath) {
        return;
      }
      setViewerLoading(true);
      setError(null);
      try {
        const res = await client.request<WsGetResult | null>("agents.workspace.get", {
          agentId,
          path: entry.wsPath,
        });
        const file = res?.file;
        if (!file) {
          setError("文件内容为空或读取失败");
          setViewerLoading(false);
          return;
        }
        setViewer({
          path: file.path,
          name: file.name,
          mimeType: file.mimeType ?? "",
          size: file.size ?? 0,
          updatedAtMs: file.updatedAtMs,
          content: file.content ?? "",
          encoding: file.encoding ?? "utf8",
        });
      } catch (err) {
        setError(String(err instanceof Error ? err.message : err));
      } finally {
        setViewerLoading(false);
      }
    },
    [client, connected, agentId],
  );

  const openDir = useCallback(
    (entry: PanelEntry) => {
      setViewer(null);
      setDir(entry.absPath);
      void fetchList(entry.absPath);
    },
    [fetchList],
  );

  const goUp = useCallback(() => {
    if (parentDir) {
      setViewer(null);
      setDir(parentDir);
      void fetchList(parentDir);
    }
  }, [parentDir, fetchList]);

  // 面包屑：OpenClaw 根 → … → 当前目录
  const crumbs: Array<{ label: string; absPath: string }> = [];
  if (openclawRoot) {
    crumbs.push({ label: "OpenClaw 根目录", absPath: openclawRoot });
    if (dir && dir !== openclawRoot && dir.startsWith(openclawRoot)) {
      const rel = dir.slice(openclawRoot.length).replace(/^\//, "");
      const segs = rel.split("/").filter(Boolean);
      let acc = openclawRoot;
      for (const seg of segs) {
        acc = `${acc}/${seg}`;
        crumbs.push({ label: seg, absPath: acc });
      }
    }
  }

  const sorted = [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true });
  });

  return (
    <aside className="file-explorer" aria-label="OpenClaw 文件管理器">
      {/* 标题栏 */}
      <div className="file-explorer__head">
        <span className="file-explorer__agent" title={`Agent: ${agentId}`}>
          <FolderIcon />
          <span>OpenClaw 文件</span>
          <span className="file-explorer__agent-id">{agentId}</span>
        </span>
        <span className="file-explorer__head-actions">
          <button
            className="file-explorer__icon-btn"
            onClick={() => void fetchList(dir)}
            disabled={!connected || loading || !openclawRoot}
            title="刷新"
            aria-label="刷新"
          >
            <RefreshIcon />
          </button>
        </span>
      </div>

      {/* 面包屑 */}
      <div className="file-explorer__crumbs">
        {crumbs.map((crumb, i) => (
          <React.Fragment key={crumb.absPath}>
            {i > 0 && (
              <span className="file-explorer__crumb-sep">
                <ChevronIcon />
              </span>
            )}
            <button
              className={`file-explorer__crumb${i === crumbs.length - 1 ? " file-explorer__crumb--current" : ""}`}
              onClick={() => {
                setViewer(null);
                setDir(crumb.absPath);
                void fetchList(crumb.absPath);
              }}
              disabled={loading}
            >
              {crumb.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* 内容区 */}
      <div className="file-explorer__body">
        {viewer ? (
          /* ── 文件查看器 ── */
          <div className="file-explorer__viewer">
            <div className="file-explorer__viewer-head">
              <button
                className="file-explorer__icon-btn"
                onClick={() => setViewer(null)}
                title="返回列表"
                aria-label="返回列表"
              >
                <CloseIcon />
              </button>
              <span className="file-explorer__viewer-name" title={viewer.path}>
                {viewer.name}
              </span>
              <span className="file-explorer__viewer-meta">
                {formatSize(viewer.size)}
                {viewer.updatedAtMs ? ` · ${formatDate(viewer.updatedAtMs)}` : ""}
              </span>
            </div>
            <div className="file-explorer__viewer-content">
              {isImageMime(viewer.mimeType, viewer.name) ? (
                <img
                  className="file-explorer__viewer-img"
                  src={
                    viewer.encoding === "base64"
                      ? `data:${viewer.mimeType || "image/png"};base64,${viewer.content}`
                      : viewer.content
                  }
                  alt={viewer.name}
                />
              ) : isLikelyText(viewer.mimeType, viewer.name) ? (
                <pre className="file-explorer__viewer-text">{viewer.content}</pre>
              ) : (
                <div className="file-explorer__viewer-empty">
                  二进制文件（{viewer.mimeType || "未知类型"}），暂不支持预览。
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── 目录列表 ── */
          <>
            {!openclawRoot && !error && <div className="file-explorer__state">加载中…</div>}
            {loading && entries.length === 0 && <div className="file-explorer__state">加载中…</div>}
            {!loading && error && (
              <div className="file-explorer__state file-explorer__state--error">{error}</div>
            )}
            {!loading && !error && openclawRoot && entries.length === 0 && (
              <div className="file-explorer__state">此目录为空</div>
            )}
            {!error && entries.length > 0 && (
              <ul className="file-explorer__list">
                {dir !== openclawRoot && parentDir && (
                  <li>
                    <button
                      className="file-explorer__item file-explorer__item--parent"
                      onClick={goUp}
                      disabled={loading}
                    >
                      <span className="file-explorer__item-icon file-explorer__item-icon--parent">
                        ..
                      </span>
                      <span className="file-explorer__item-name">上级目录</span>
                    </button>
                  </li>
                )}
                {sorted.map((entry) => (
                  <li key={entry.absPath}>
                    <button
                      className="file-explorer__item"
                      onClick={() => (entry.isDir ? openDir(entry) : void openFile(entry))}
                      disabled={loading || viewerLoading}
                      title={entry.absPath}
                    >
                      <span
                        className={`file-explorer__item-icon${entry.isDir ? " file-explorer__item-icon--dir" : ""}`}
                      >
                        {entry.isDir ? <FolderIcon /> : <FileIcon />}
                      </span>
                      <span className="file-explorer__item-name">{entry.name}</span>
                      <span className="file-explorer__item-meta">
                        {!entry.isDir && entry.size != null ? formatSize(entry.size) : null}
                        {entry.updatedAtMs ? (
                          <span className="file-explorer__item-date">
                            {formatDate(entry.updatedAtMs)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {viewerLoading && <div className="file-explorer__state">读取文件中…</div>}
            {openclawRoot && dir === openclawRoot && !error && (
              <div className="file-explorer__hint">
                提示：网关限制，根目录仅显示子目录；进入 workspace 后可浏览并预览文件。
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
