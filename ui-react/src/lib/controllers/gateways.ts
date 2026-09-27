// [multi-gateway] 多网关连接管理。
// 本客户端是独立容器，可接入任意数量的 OpenClaw 网关；切换网关即改写
// settings.gatewayUrl / token 并触发重连（connectGateway 由调用方执行）。

import type { GatewayProfile, UiSettings } from "../storage.ts";

function newId(): string {
  return `gw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function listGateways(settings: UiSettings): GatewayProfile[] {
  const list = settings.gateways ?? [];
  if (list.length > 0) {
    return list;
  }
  // 兼容旧档案：把当前连接视为唯一网关
  return [
    {
      id: settings.activeGatewayId ?? "default",
      name: "默认网关",
      url: settings.gatewayUrl,
      token: settings.token,
    },
  ];
}

export function findGateway(settings: UiSettings, id: string): GatewayProfile | undefined {
  return listGateways(settings).find((g) => g.id === id);
}

/** 把某个已保存网关设为当前连接（返回新的 settings，不负责重连） */
export function applyGatewayToSettings(settings: UiSettings, id: string): UiSettings {
  const target = findGateway(settings, id);
  if (!target) {
    return { ...settings, activeGatewayId: id };
  }
  return {
    ...settings,
    gatewayUrl: target.url,
    token: target.token,
    activeGatewayId: target.id,
  };
}

export type GatewayInput = {
  id?: string;
  name: string;
  url: string;
  token: string;
};

export function upsertGateway(settings: UiSettings, input: GatewayInput): UiSettings {
  const list = [...listGateways(settings)];
  const url = input.url.trim();
  const name = input.name.trim() || url;
  const existingIdx = input.id ? list.findIndex((g) => g.id === input.id) : -1;

  if (existingIdx >= 0) {
    list[existingIdx] = {
      id: input.id as string,
      name,
      url,
      token: input.token,
    };
    return { ...settings, gateways: list, activeGatewayId: input.id as string };
  }

  const profile: GatewayProfile = { id: newId(), name, url, token: input.token };
  list.push(profile);
  return {
    ...settings,
    gateways: list,
    activeGatewayId: profile.id,
    gatewayUrl: profile.url,
    token: profile.token,
  };
}

export function removeGateway(settings: UiSettings, id: string): UiSettings {
  const list = listGateways(settings).filter((g) => g.id !== id);
  if (list.length === 0) {
    // 至少保留一个条目（当前连接）
    return {
      ...settings,
      gateways: [
        { id: "default", name: "默认网关", url: settings.gatewayUrl, token: settings.token },
      ],
      activeGatewayId: "default",
    };
  }
  const nextActive = settings.activeGatewayId === id ? list[0].id : settings.activeGatewayId;
  return { ...settings, gateways: list, activeGatewayId: nextActive };
}

/** 把当前生效的连接另存为一个网关条目 */
export function saveCurrentAsGateway(settings: UiSettings, name: string): UiSettings {
  return upsertGateway(settings, {
    name: name.trim() || settings.gatewayUrl,
    url: settings.gatewayUrl,
    token: settings.token,
  });
}
