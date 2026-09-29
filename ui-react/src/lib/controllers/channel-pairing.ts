import type { GatewayBrowserClient } from "../gateway/gateway.ts";

export type ChannelPairingRequest = {
  /** 网关配对请求 ID（channels.pairing.approve 需要） */
  id: string;
  /** 渠道账号 ID */
  accountId: string;
  /** 发起配对的用户标识 */
  senderId?: string;
  /** 发起方类型标签（如 telegramUserId） */
  senderLabel?: string;
  createdAt: string;
  expiresAt?: string;
  meta?: Record<string, unknown>;
};

export type ChannelPairingGroup = {
  channel: string;
  channelLabel?: string;
  requests: ChannelPairingRequest[];
};

export type ChannelPairingState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  channelPairingsLoading: boolean;
  channelPairings: ChannelPairingGroup[];
  channelPairingsError: string | null;
};

type GatewayPairingRequest = {
  requestId?: string;
  channel?: string;
  channelLabel?: string;
  accountId?: string;
  senderId?: string | number;
  senderLabel?: string;
  createdAt?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
};

export async function loadChannelPairings(state: ChannelPairingState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.channelPairingsLoading) {
    return;
  }
  state.channelPairingsLoading = true;
  state.channelPairingsError = null;
  try {
    // [version-adapt] 网关 2026.9.x 方法为 channels.pairing.list（旧版 channel.pairing.list 不存在）
    const res = await state.client.request<{
      requests?: GatewayPairingRequest[];
      accounts?: unknown[];
    }>("channels.pairing.list", {});
    const raw = Array.isArray(res?.requests) ? res.requests : [];
    const groups = new Map<string, ChannelPairingGroup>();
    for (const r of raw) {
      const channel = r.channel ?? "unknown";
      let group = groups.get(channel);
      if (!group) {
        group = { channel, channelLabel: r.channelLabel ?? channel, requests: [] };
        groups.set(channel, group);
      }
      group.requests.push({
        id: r.requestId ?? "",
        accountId: r.accountId ?? "",
        senderId: r.senderId != null ? String(r.senderId) : undefined,
        senderLabel: r.senderLabel,
        createdAt: r.createdAt ?? "",
        expiresAt: r.expiresAt,
        meta: r.metadata,
      });
    }
    state.channelPairings = [...groups.values()];
  } catch (err) {
    state.channelPairingsError = String(err);
  } finally {
    state.channelPairingsLoading = false;
  }
}

export async function approveChannelPairing(
  state: ChannelPairingState,
  channel: string,
  requestId: string,
  accountId?: string,
) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    // [version-adapt] channels.pairing.approve 需要 {channel, accountId, requestId}
    const params: Record<string, string> = { channel, requestId };
    if (accountId) {
      params.accountId = accountId;
    }
    await state.client.request("channels.pairing.approve", params);
    await loadChannelPairings(state);
  } catch (err) {
    state.channelPairingsError = String(err);
  }
}
