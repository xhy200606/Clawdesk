/**
 * projects.ts — 项目（会话分组）
 *
 * 网关没有「项目」这个概念，所以这里是纯客户端的分组：
 * 把一个项目理解为「一组会话 key 的命名集合」，存在 localStorage，
 * 用来把不同话题 / 不同客户的会话收纳到不同项目里。
 *
 * 只做分组与筛选，不动会话本身（删除项目不会删除会话）。
 */

export type Project = {
  id: string;
  name: string;
  color: string;
  sessionKeys: string[];
  createdAt: number;
};

const STORAGE_KEY = "clawdeck.projects.v1";
const ACTIVE_KEY = "clawdeck.projects.active.v1";

export const PROJECT_COLORS = [
  "#0A84FF",
  "#30D158",
  "#BF5AF2",
  "#FF9F0A",
  "#FF375F",
  "#64D2FF",
  "#14b8a6",
  "#f4f4f5",
];

function read(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is Project => !!p && typeof (p as Project).id === "string");
  } catch {
    return [];
  }
}

function write(list: Project[]): Project[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* localStorage 不可用时退化为内存态 */
  }
  return list;
}

export function loadProjects(): Project[] {
  return read();
}

export function createProject(name: string): Project[] {
  const trimmed = name.trim();
  if (!trimmed) return read();
  const list = read();
  const project: Project = {
    id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: trimmed,
    color: PROJECT_COLORS[list.length % PROJECT_COLORS.length],
    sessionKeys: [],
    createdAt: Date.now(),
  };
  return write([...list, project]);
}

export function renameProject(id: string, name: string): Project[] {
  const trimmed = name.trim();
  if (!trimmed) return read();
  return write(read().map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
}

export function deleteProject(id: string): Project[] {
  return write(read().filter((p) => p.id !== id));
}

/** 会话在项目里就移除，不在就加入 */
export function toggleSessionInProject(id: string, sessionKey: string): Project[] {
  return write(
    read().map((p) => {
      if (p.id !== id) return p;
      const has = p.sessionKeys.includes(sessionKey);
      return {
        ...p,
        sessionKeys: has
          ? p.sessionKeys.filter((k) => k !== sessionKey)
          : [...p.sessionKeys, sessionKey],
      };
    }),
  );
}

export function getActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveProjectId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function countSessionsInProjects(sessionKeys: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const p of read()) {
    const n = p.sessionKeys.filter((k) => sessionKeys.includes(k)).length;
    result.set(p.id, n);
  }
  return result;
}
