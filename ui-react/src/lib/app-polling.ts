import type { OpenClawApp } from "./app.ts";
import { loadDebug } from "./controllers/debug.ts";
import { loadLogs } from "./controllers/logs.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadSessionActivity, loadSessions } from "./controllers/sessions.ts";
import { gatewaySupportsMethod } from "./gateway.ts";

type PollingHost = {
  nodesPollInterval: number | null;
  logsPollInterval: number | null;
  debugPollInterval: number | null;
  activityPollInterval: number | null;
  sessionsSubscribed?: boolean;
  tab: string;
};

export function startNodesPolling(host: PollingHost) {
  if (host.nodesPollInterval != null) {
    return;
  }
  host.nodesPollInterval = window.setInterval(
    () => void loadNodes(host as unknown as OpenClawApp, { quiet: true }),
    5000,
  );
}

export function stopNodesPolling(host: PollingHost) {
  if (host.nodesPollInterval == null) {
    return;
  }
  clearInterval(host.nodesPollInterval);
  host.nodesPollInterval = null;
}

export function startLogsPolling(host: PollingHost) {
  if (host.logsPollInterval != null) {
    return;
  }
  host.logsPollInterval = window.setInterval(() => {
    if (host.tab !== "logs") {
      return;
    }
    void loadLogs(host as unknown as OpenClawApp, { quiet: true });
  }, 2000);
}

export function stopLogsPolling(host: PollingHost) {
  if (host.logsPollInterval == null) {
    return;
  }
  clearInterval(host.logsPollInterval);
  host.logsPollInterval = null;
}

export function startDebugPolling(host: PollingHost) {
  if (host.debugPollInterval != null) {
    return;
  }
  host.debugPollInterval = window.setInterval(() => {
    if (host.tab !== "debug") {
      return;
    }
    void loadDebug(host as unknown as OpenClawApp);
  }, 3000);
}

export function stopDebugPolling(host: PollingHost) {
  if (host.debugPollInterval == null) {
    return;
  }
  clearInterval(host.debugPollInterval);
  host.debugPollInterval = null;
}

export function startActivityPolling(host: PollingHost) {
  if (host.activityPollInterval != null) {
    return;
  }
  host.activityPollInterval = window.setInterval(() => {
    if (host.tab !== "overview") {
      return;
    }
    // Older gateways have no session change subscription. Refresh the roster
    // there so the overview does not freeze after its initial load.
    if (!host.sessionsSubscribed || !gatewaySupportsMethod("sessions.subscribe")) {
      void loadSessions(host as unknown as OpenClawApp);
    }
    void loadSessionActivity(host as unknown as OpenClawApp);
  }, 5000);
}

export function stopActivityPolling(host: PollingHost) {
  if (host.activityPollInterval == null) {
    return;
  }
  clearInterval(host.activityPollInterval);
  host.activityPollInterval = null;
}
