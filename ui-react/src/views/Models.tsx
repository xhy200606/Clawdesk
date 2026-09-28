import { html } from "lit";
import React, { useCallback, useMemo } from "react";
import { LitBridge } from "../components/LitBridge.tsx";
import type { DropdownGroup } from "../lib/components/dropdown.ts";
import { applyConfig, updateConfigFormValue } from "../lib/controllers/config.ts";
import "../lib/views/models-default-config.ts"; // registers <oc-default-model-config>
import type { AllowlistModel } from "../lib/views/models-default-config.ts";
import { renderModelsQuickAdd, PROVIDER_PRESETS } from "../lib/views/models-quick-add.ts";
import { useAppStore, getReactiveState } from "../store/appStore.ts";

// ---- Models page with Quick-Add + Default Model Config ----

export function ModelsView() {
  const s = useAppStore;
  const form = s((st) => st.modelsQuickAddForm);
  const busy = s((st) => st.modelsQuickAddBusy);
  const error = s((st) => st.modelsQuickAddError);
  const preset = s((st) => st.modelsQuickAddPreset);
  const selectedIds = s((st) => st.modelsQuickAddSelectedIds);
  const configForm = s((st) => st.configForm);
  const configSaving = s((st) => st.configSaving);
  const probeBusy = s((st) => st.modelsProbeBusy);
  const probeResult = s((st) => st.modelsProbeResult);

  // ── Preset change ──
  const onPresetChange = useCallback((presetId: string) => {
    const st = s.getState();
    st.set({ modelsQuickAddPreset: presetId });
    if (presetId === "") {
      st.set({
        modelsQuickAddForm: {
          provider: "",
          baseUrl: "",
          api: "openai-completions",
          apiKey: "",
          models: [{ id: "", name: "" }],
        },
        modelsQuickAddSelectedIds: [],
      });
    } else {
      const p = PROVIDER_PRESETS.find((pp) => pp.id === presetId);
      if (p) {
        st.set({
          modelsQuickAddForm: {
            provider: p.provider,
            baseUrl: p.baseUrl,
            api: p.api,
            apiKey: st.modelsQuickAddForm.apiKey,
            models: [],
          },
          modelsQuickAddSelectedIds: p.models[0] ? [p.models[0].id] : [],
        });
      }
    }
  }, []);

  const onPresetModelToggle = useCallback((modelId: string) => {
    const st = s.getState();
    const ids = new Set(st.modelsQuickAddSelectedIds);
    if (ids.has(modelId)) {
      ids.delete(modelId);
    } else {
      ids.add(modelId);
    }
    st.set({ modelsQuickAddSelectedIds: [...ids] });
  }, []);

  const onPresetSelectAll = useCallback(() => {
    const st = s.getState();
    const p = PROVIDER_PRESETS.find((pp) => pp.id === st.modelsQuickAddPreset);
    if (!p) {
      return;
    }
    if (st.modelsQuickAddSelectedIds.length === p.models.length) {
      st.set({ modelsQuickAddSelectedIds: [] });
    } else {
      st.set({ modelsQuickAddSelectedIds: p.models.map((m) => m.id) });
    }
  }, []);

  const onFieldChange = useCallback((field: string, value: string) => {
    const st = s.getState();
    st.set({ modelsQuickAddForm: { ...st.modelsQuickAddForm, [field]: value } });
  }, []);

  const onModelChange = useCallback((index: number, field: string, value: string | boolean) => {
    const st = s.getState();
    const models = [...st.modelsQuickAddForm.models];
    models[index] = { ...models[index], [field]: value };
    st.set({ modelsQuickAddForm: { ...st.modelsQuickAddForm, models } });
  }, []);

  const onAddModel = useCallback(() => {
    const st = s.getState();
    st.set({
      modelsQuickAddForm: {
        ...st.modelsQuickAddForm,
        models: [...st.modelsQuickAddForm.models, { id: "", name: "" }],
      },
    });
  }, []);

  const onRemoveModel = useCallback((index: number) => {
    const st = s.getState();
    const models = st.modelsQuickAddForm.models.filter((_, i) => i !== index);
    st.set({ modelsQuickAddForm: { ...st.modelsQuickAddForm, models } });
  }, []);

  // 组装待保存的 provider 配置；返回 null 表示表单不完整（错误已写入 store）
  const buildProviderPayload = useCallback((): {
    providerId: string;
    providerObj: Record<string, unknown>;
  } | null => {
    const st = s.getState();
    const f = st.modelsQuickAddForm;
    const isCustom = st.modelsQuickAddPreset === "";

    let newModels: Array<{ id: string; name: string; input: string[] }>;
    if (isCustom) {
      newModels = f.models
        .filter((m) => m.id.trim() !== "")
        .map((m) => ({
          id: m.id.trim(),
          name: m.name.trim() || m.id.trim(),
          input: m.supportsImage ? ["text", "image"] : ["text"],
        }));
    } else {
      const p = PROVIDER_PRESETS.find((pp) => pp.id === st.modelsQuickAddPreset);
      const sel = new Set(st.modelsQuickAddSelectedIds);
      const presetModels = (p?.models ?? [])
        .filter((m) => sel.has(m.id))
        .map((m) => ({
          id: m.id,
          name: m.name,
          input: m.supportsImage ? ["text", "image"] : ["text"],
        }));
      // Incluir modelos custom si el preset lo permite
      const customModels = p?.allowCustomModels
        ? f.models
            .filter((m) => m.id.trim() !== "")
            .map((m) => ({
              id: m.id.trim(),
              name: m.name.trim() || m.id.trim(),
              input: m.supportsImage ? ["text", "image"] : ["text"],
            }))
        : [];
      newModels = [...presetModels, ...customModels];
    }

    if (
      !f.provider.trim() ||
      !f.baseUrl.trim() ||
      !f.api.trim() ||
      !f.apiKey.trim() ||
      newModels.length === 0
    ) {
      st.set({ modelsQuickAddError: "请填写所有必填项并选择至少一个模型" });
      return null;
    }

    const providerObj: Record<string, unknown> = {
      baseUrl: f.baseUrl.trim(),
      apiKey: f.apiKey.trim(),
      api: f.api,
      models: newModels,
    };

    const existing = (st.configForm as Record<string, unknown>)?.models as
      | Record<string, unknown>
      | undefined;
    const existingProviders = (existing?.providers ?? {}) as Record<string, unknown>;
    const existingProvider = existingProviders[f.provider.trim()] as
      | Record<string, unknown>
      | undefined;

    if (existingProvider && Array.isArray(existingProvider.models)) {
      providerObj.baseUrl = existingProvider.baseUrl ?? f.baseUrl.trim();
      providerObj.apiKey = existingProvider.apiKey ?? f.apiKey.trim();
      providerObj.api = existingProvider.api ?? f.api;
      const newIds = new Set(newModels.map((m) => m.id));
      const kept = (existingProvider.models as Array<{ id: string }>).filter(
        (m) => !newIds.has(m.id),
      );
      providerObj.models = [...kept, ...newModels];
    }
    return { providerId: f.provider.trim(), providerObj };
  }, []);

  const resetQuickAddForm = useCallback(() => {
    s.getState().set({
      modelsQuickAddForm: {
        provider: "",
        baseUrl: "",
        api: "openai-completions",
        apiKey: "",
        models: [{ id: "", name: "" }],
      },
    });
  }, []);

  const onSubmit = useCallback(async () => {
    const st = s.getState();
    st.set({ modelsQuickAddBusy: true, modelsQuickAddError: null });
    try {
      const payload = buildProviderPayload();
      if (!payload) return;
      updateConfigFormValue(getReactiveState() as never, ["models", "mode"], "merge");
      updateConfigFormValue(
        getReactiveState() as never,
        ["models", "providers", payload.providerId],
        payload.providerObj,
      );
      await applyConfig(getReactiveState() as never);
      resetQuickAddForm();
    } catch (err) {
      st.set({ modelsQuickAddError: String(err) });
    } finally {
      st.set({ modelsQuickAddBusy: false });
    }
  }, []);

  // 保存并测试连通性：先持久化 provider（probe 只认已保存配置），
  // 再调用网关 models.probe RPC 获取每个探测目标的结果。
  const onSaveAndTest = useCallback(async () => {
    const st = s.getState();
    st.set({
      modelsQuickAddBusy: true,
      modelsQuickAddError: null,
      modelsProbeBusy: true,
      modelsProbeResult: null,
    });
    try {
      const payload = buildProviderPayload();
      if (!payload) {
        st.set({ modelsProbeBusy: false });
        return;
      }
      updateConfigFormValue(getReactiveState() as never, ["models", "mode"], "merge");
      updateConfigFormValue(
        getReactiveState() as never,
        ["models", "providers", payload.providerId],
        payload.providerObj,
      );
      await applyConfig(getReactiveState() as never);

      const reactive = getReactiveState() as unknown as {
        client: { request: (method: string, params: unknown) => Promise<unknown> } | null;
      };
      if (!reactive.client) throw new Error("网关未连接");
      const res = (await reactive.client.request("models.probe", {
        provider: payload.providerId,
        timeoutMs: 20000,
      })) as {
        status?: string;
        error?: string;
        results?: Array<Record<string, unknown>>;
      } | null;

      const results = res?.results ?? [];
      const okTargets = results.filter(
        (r) => r.status === "ok" || r.reachable === true || r.success === true,
      );
      let summary: string;
      if (results.length === 0) {
        summary = res?.error ? `❌ ${res.error}` : "⚠️ 没有可探测的目标（请确认已配置模型）";
      } else if (okTargets.length === results.length) {
        summary = `✅ 连通成功（${okTargets.length}/${results.length} 个目标）`;
      } else {
        const detail = results
          .map((r) => {
            const id = String(r.model ?? r.id ?? r.target ?? "?");
            const st2 = String(r.status ?? r.error ?? "unknown");
            return `${id}: ${st2}`;
          })
          .join("；");
        summary = `⚠️ ${okTargets.length}/${results.length} 个目标连通 — ${detail}`;
      }
      st.set({
        modelsProbeResult: { status: res?.status ?? "unknown", error: res?.error, summary },
      });
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err);
      st.set({
        modelsQuickAddError: msg,
        modelsProbeResult: { status: "fail", summary: `❌ ${msg}` },
      });
    } finally {
      st.set({ modelsQuickAddBusy: false, modelsProbeBusy: false });
    }
  }, []);

  // Build model groups for default model config
  const {
    modelGroups,
    visionModelGroups,
    hasVisionModels,
    curDef,
    curImg,
    allModels,
    allowedModels,
    curUtil,
    curDec,
    curFb,
    modelsMode,
  } = useMemo(() => {
    const cfgProviders = (
      (configForm as Record<string, unknown>)?.models as Record<string, unknown>
    )?.providers as Record<string, unknown> | undefined;

    type MEntry = { id: string; name?: string; input?: string[] };
    const mg: DropdownGroup[] = [];
    const vmg: DropdownGroup[] = [];
    const am: AllowlistModel[] = [];
    let hasVis = false;

    if (cfgProviders) {
      for (const [pid, pd] of Object.entries(cfgProviders)) {
        const ml = ((pd as Record<string, unknown>).models ?? []) as MEntry[];
        const allItems: Array<{ value: string; label: string }> = [];
        const visItems: Array<{ value: string; label: string }> = [];
        for (const m of ml) {
          const item = { value: `${pid}/${m.id}`, label: m.name || m.id };
          allItems.push(item);
          am.push({ value: `${pid}/${m.id}`, label: m.name || m.id, provider: pid });
          if (m.input?.includes("image")) {
            visItems.push(item);
            hasVis = true;
          }
        }
        if (allItems.length > 0) {
          mg.push({ label: pid, items: allItems });
        }
        if (visItems.length > 0) {
          vmg.push({ label: pid, items: visItems });
        }
      }
    }

    // Leer allowlist desde agents.defaults.models
    const agC = (configForm as Record<string, unknown>)?.agents as
      | Record<string, unknown>
      | undefined;
    const dC = (agC?.defaults ?? {}) as Record<string, unknown>;
    const def =
      typeof dC.model === "string"
        ? dC.model
        : typeof dC.model === "object" && dC.model
          ? (((dC.model as Record<string, unknown>).primary as string) ?? "")
          : "";

    // Extraer set de modelos permitidos
    const modelsMap = (dC.models ?? {}) as Record<string, unknown>;
    const allowed = new Set<string>(Object.keys(modelsMap));

    const tC = (configForm as Record<string, unknown>)?.tools as
      | Record<string, unknown>
      | undefined;
    const mM = (((tC?.media ?? {}) as Record<string, unknown>).models ?? []) as Array<{
      provider?: string;
      model?: string;
    }>;
    const fm = mM[0];
    const img = fm ? `${fm.provider ?? ""}/${fm.model ?? ""}` : "";

    return {
      modelGroups: mg,
      visionModelGroups: vmg,
      hasVisionModels: hasVis,
      curDef: def,
      curImg: img,
      allModels: am,
      allowedModels: allowed,
      curUtil: typeof dC.utilityModel === "string" ? dC.utilityModel : "",
      curDec: typeof dC.decisionModel === "string" ? dC.decisionModel : "",
      curFb:
        typeof dC.model === "object" &&
        dC.model &&
        Array.isArray((dC.model as Record<string, unknown>).fallbacks)
          ? ((dC.model as Record<string, unknown>).fallbacks as string[])
          : [],
      modelsMode:
        (((configForm as Record<string, unknown>)?.models as Record<string, unknown>)
          ?.mode as string) || "merge",
    };
  }, [configForm]);

  // Event handlers for default model config
  const onDefaultModelChange = useCallback((e: Event) => {
    const model = (e as CustomEvent).detail.model as string;
    updateConfigFormValue(
      getReactiveState() as never,
      ["agents", "defaults", "model"],
      model || undefined,
    );
    void applyConfig(getReactiveState() as never);
  }, []);

  const onImageModelChange = useCallback((e: Event) => {
    const model = (e as CustomEvent).detail.model as string;
    if (!model) {
      updateConfigFormValue(getReactiveState() as never, ["tools", "media", "models"], []);
    } else {
      const [provider, ...rest] = model.split("/");
      const modelId = rest.join("/");
      updateConfigFormValue(
        getReactiveState() as never,
        ["tools", "media", "models"],
        [{ provider, model: modelId }],
      );
    }
    void applyConfig(getReactiveState() as never);
  }, []);

  const onAllowlistChange = useCallback((e: Event) => {
    const allowed = (e as CustomEvent).detail.allowed as string[];
    // Construir el mapa de allowlist: { "provider/model": { alias: "Name" } }
    const modelsMap: Record<string, { alias: string }> = {};
    for (const ref of allowed) {
      // Encontrar el label del modelo
      const found = s.getState().configForm as Record<string, unknown>;
      const providers = ((found?.models as Record<string, unknown>)?.providers ?? {}) as Record<
        string,
        unknown
      >;
      const [provId, ...rest] = ref.split("/");
      const modelId = rest.join("/");
      const provData = (providers[provId] ?? {}) as Record<string, unknown>;
      const ml = (provData.models ?? []) as Array<{ id: string; name?: string }>;
      const m = ml.find((x) => x.id === modelId);
      modelsMap[ref] = { alias: m?.name || modelId };
    }
    updateConfigFormValue(getReactiveState() as never, ["agents", "defaults", "models"], modelsMap);
    void applyConfig(getReactiveState() as never);
  }, []);

  const onModelsModeChange = useCallback((e: Event) => {
    const mode = (e as CustomEvent).detail.mode as string;
    updateConfigFormValue(getReactiveState() as never, ["models", "mode"], mode);
    void applyConfig(getReactiveState() as never);
  }, []);

  // 辅助模型：空字符串表示显式禁用 utility 路由
  const onUtilityModelChange = useCallback((e: Event) => {
    const model = (e as CustomEvent).detail.model as string;
    updateConfigFormValue(
      getReactiveState() as never,
      ["agents", "defaults", "utilityModel"],
      model,
    );
    void applyConfig(getReactiveState() as never);
  }, []);

  // 决策模型：留空移除设置
  const onDecisionModelChange = useCallback((e: Event) => {
    const model = (e as CustomEvent).detail.model as string;
    updateConfigFormValue(
      getReactiveState() as never,
      ["agents", "defaults", "decisionModel"],
      model || undefined,
    );
    void applyConfig(getReactiveState() as never);
  }, []);

  // 备用模型列表：写入 agents.defaults.model；primary 保留原值，
  // 列表为空时还原为 primary 字符串（或未设置则删除）
  const onFallbacksChange = useCallback(
    (e: Event) => {
      const fallbacks = (e as CustomEvent).detail.fallbacks as string[];
      const dC = (((configForm as Record<string, unknown>)?.agents as Record<string, unknown>)
        ?.defaults ?? {}) as Record<string, unknown>;
      const curModel = dC.model;
      const primary =
        typeof curModel === "string"
          ? curModel
          : typeof curModel === "object" && curModel
            ? (((curModel as Record<string, unknown>).primary as string) ?? "")
            : "";
      const next = fallbacks.length > 0 ? { primary, fallbacks } : primary ? primary : undefined;
      updateConfigFormValue(getReactiveState() as never, ["agents", "defaults", "model"], next);
      void applyConfig(getReactiveState() as never);
    },
    [configForm],
  );

  const template = useMemo(
    () => html`
      <div class="models-page">
        ${renderModelsQuickAdd({
          form,
          busy,
          error,
          selectedPreset: preset,
          selectedModelIds: new Set(selectedIds),
          onPresetChange,
          onPresetModelToggle,
          onPresetSelectAll,
          onFieldChange,
          onModelChange: onModelChange as never,
          onAddModel,
          onRemoveModel,
          onSubmit,
          onTest: onSaveAndTest,
          testBusy: probeBusy,
          testResult: probeResult,
        })}
        <oc-default-model-config
          .modelGroups=${modelGroups}
          .visionModelGroups=${visionModelGroups}
          .currentDefaultModel=${curDef}
          .currentImageModel=${curImg}
          .allModels=${allModels}
          .allowedModels=${allowedModels}
          .modelsMode=${modelsMode}
          .currentUtilityModel=${curUtil}
          .currentDecisionModel=${curDec}
          .currentFallbacks=${curFb}
          ?saving=${configSaving}
          ?hasVisionModels=${hasVisionModels}
          @default-model-change=${onDefaultModelChange}
          @image-model-change=${onImageModelChange}
          @allowlist-change=${onAllowlistChange}
          @models-mode-change=${onModelsModeChange}
          @utility-model-change=${onUtilityModelChange}
          @decision-model-change=${onDecisionModelChange}
          @fallbacks-change=${onFallbacksChange}
        ></oc-default-model-config>
      </div>
    `,
    [
      form,
      busy,
      error,
      preset,
      selectedIds,
      probeBusy,
      probeResult,
      modelGroups,
      visionModelGroups,
      curDef,
      curImg,
      configSaving,
      hasVisionModels,
      allModels,
      allowedModels,
      modelsMode,
      curUtil,
      curDec,
      curFb,
      onPresetChange,
      onPresetModelToggle,
      onPresetSelectAll,
      onFieldChange,
      onModelChange,
      onAddModel,
      onRemoveModel,
      onSubmit,
      onSaveAndTest,
      onDefaultModelChange,
      onImageModelChange,
      onAllowlistChange,
      onModelsModeChange,
      onUtilityModelChange,
      onDecisionModelChange,
      onFallbacksChange,
    ],
  );

  return <LitBridge template={template} />;
}
