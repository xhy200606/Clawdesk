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

function sortEntries(entries: WsEntry[]): WsEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true });
  });
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

// ─── 主组件 ─────────────────────────────────────────────────

export function FileExplorerPanel() {
  const client = useAppStore((s) => s.client);
  const connected = useAppStore((s) => s.connected);
  const sessionKey = useAppStore((s) => s.sessionKey);

  const agentId = parseAgentSessionKey(sessionKey)?.agentId ?? "main";

  const [path, setPath] = useState("");
  const [list, setList] = useState<WsListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const reqSeq = useRef(0);

  const fetchList = useCallback(
    async (targetPath: string) => {
      if (!client || !connected) {
        return;
      }
      const seq = ++reqSeq.current;
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, unknown> = { agentId };
        if (targetPath) {
          params.path = targetPath;
        }
        const res = await client.request<WsListResult | null>("agents.workspace.list", params);
        if (seq !== reqSeq.current) {
          return; // 过期响应
        }
        setList(res);
      } catch (err) {
        if (seq === reqSeq.current) {
          setError(String(err instanceof Error ? err.message : err));
          setList(null);
        }
      } finally {
        if (seq === reqSeq.current) {
          setLoading(false);
        }
      }
    },
    [client, connected, agentId],
  );

  // 打开面板或切换 agent 时加载根目录
  useEffect(() => {
    setPath("");
    setViewer(null);
    setList(null);
    void fetchList("");
  }, [fetchList]);

  const openFile = useCallback(
    async (entry: WsEntry) => {
      if (!client || !connected) {
        return;
      }
      setViewerLoading(true);
      setError(null);
      try {
        const res = await client.request<WsGetResult | null>("agents.workspace.get", {
          agentId,
          path: entry.path,
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
    (entry: WsEntry) => {
      setViewer(null);
      setPath(entry.path);
      void fetchList(entry.path);
    },
    [fetchList],
  );

  const crumbs = path ? path.split("/") : [];
  const parentPath = list?.parentPath ?? null;
  const entries = list ? sortEntries(list.entries) : [];

  return (
    <aside className="file-explorer" aria-label="Workspace 文件管理器">
      {/* 标题栏 */}
      <div className="file-explorer__head">
        <span className="file-explorer__agent" title={`Agent: ${agentId}`}>
          <FolderIcon />
          <span>Workspace</span>
          <span className="file-explorer__agent-id">{agentId}</span>
        </span>
        <span className="file-explorer__head-actions">
          <button
            className="file-explorer__icon-btn"
            onClick={() => void fetchList(path)}
            disabled={!connected || loading}
            title="刷新"
            aria-label="刷新"
          >
            <RefreshIcon />
          </button>
        </span>
      </div>

      {/* 面包屑 */}
      <div className="file-explorer__crumbs">
        <button
          className="file-explorer__crumb"
          onClick={() => {
            setViewer(null);
            setPath("");
            void fetchList("");
          }}
          disabled={loading}
        >
          根目录
        </button>
        {crumbs.map((seg, i) => {
          const target = crumbs.slice(0, i + 1).join("/");
          return (
            <React.Fragment key={target}>
              <span className="file-explorer__crumb-sep">
                <ChevronIcon />
              </span>
              <button
                className={`file-explorer__crumb${i === crumbs.length - 1 ? " file-explorer__crumb--current" : ""}`}
                onClick={() => {
                  setViewer(null);
                  setPath(target);
                  void fetchList(target);
                }}
                disabled={loading}
              >
                {seg}
              </button>
            </React.Fragment>
          );
        })}
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
            {loading && entries.length === 0 && <div className="file-explorer__state">加载中…</div>}
            {!loading && error && (
              <div className="file-explorer__state file-explorer__state--error">{error}</div>
            )}
            {!loading && !error && entries.length === 0 && (
              <div className="file-explorer__state">此目录为空</div>
            )}
            {!error && entries.length > 0 && (
              <ul className="file-explorer__list">
                {parentPath !== null && (
                  <li>
                    <button
                      className="file-explorer__item file-explorer__item--parent"
                      onClick={() => {
                        setViewer(null);
                        setPath(parentPath);
                        void fetchList(parentPath);
                      }}
                      disabled={loading}
                    >
                      <span className="file-explorer__item-icon file-explorer__item-icon--parent">
                        ..
                      </span>
                      <span className="file-explorer__item-name">上级目录</span>
                    </button>
                  </li>
                )}
                {entries.map((entry) => (
                  <li key={entry.path}>
                    <button
                      className="file-explorer__item"
                      onClick={() =>
                        entry.kind === "directory" ? openDir(entry) : void openFile(entry)
                      }
                      disabled={loading || viewerLoading}
                      title={entry.path}
                    >
                      <span
                        className={`file-explorer__item-icon${entry.kind === "directory" ? " file-explorer__item-icon--dir" : ""}`}
                      >
                        {entry.kind === "directory" ? <FolderIcon /> : <FileIcon />}
                      </span>
                      <span className="file-explorer__item-name">{entry.name}</span>
                      <span className="file-explorer__item-meta">
                        {entry.kind === "file" ? formatSize(entry.size) : ""}
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
          </>
        )}
      </div>
    </aside>
  );
}
