import { useCallback, useEffect, useMemo, useState } from "react";

import { generateRule, saveChallenge } from "@/api/generate";
import type { RuleRuntimeStats } from "@/game/rules/types";
import { applyRulePack, clearRules, subscribeToRules } from "@/game/rules/ruleBridge";

import enemySlowPreset from "@content/presets/preset-enemy-slow.json";
import gravityPreset from "@content/presets/preset-gravity-flip.json";
import guardedPreset from "@content/presets/preset-guarded-gravity.json";
import shieldPreset from "@content/presets/preset-shield-on-coin.json";

interface PresetEntry {
  id: string;
  name: string;
  description: string;
  pack: unknown;
}

const PRESETS: PresetEntry[] = [
  {
    id: gravityPreset.id,
    name: gravityPreset.name,
    description: "每跳一次，重力方向反转。",
    pack: gravityPreset,
  },
  {
    id: guardedPreset.id,
    name: guardedPreset.name,
    description: guardedPreset.description,
    pack: guardedPreset,
  },
  {
    id: shieldPreset.id,
    name: shieldPreset.name,
    description: shieldPreset.description,
    pack: shieldPreset,
  },
  {
    id: enemySlowPreset.id,
    name: enemySlowPreset.name,
    description: "捡到金币后，所有现存敌人减速 30%，持续 5 秒。",
    pack: enemySlowPreset,
  },
];

const EMPTY_STATS: RuleRuntimeStats = {
  eventsDispatched: 0,
  eventsDropped: 0,
  actionsApplied: 0,
  actionsRejected: 0,
  conditionsBlocked: 0,
};

/**
 * Rule input panel.
 *
 * Two ways in: pick a vetted preset, or describe a rule and let the server
 * compile it. Both end at the same place — a validated pack handed to the running
 * game — and the panel reflects real engine state, never optimistic UI.
 */
export function RulePanel() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<RuleRuntimeStats>(EMPTY_STATS);
  const [unavailable, setUnavailable] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [lastPackId, setLastPackId] = useState<string | null>(null);

  useEffect(() => subscribeToRules((payload) => {
    setActiveId(payload.packId);
    setError(payload.error);
    setStats(payload.stats);
  }), []);

  const toggle = (entry: PresetEntry): void => {
    if (activeId === entry.id) {
      if (!clearRules()) {
        setUnavailable(true);
      }
      return;
    }
    if (!applyRulePack(entry.pack)) {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
  };

  const submit = useCallback(async () => {
    const text = prompt.trim();
    if (text.length === 0 || busy) {
      return;
    }

    setBusy(true);
    setServerMessage(null);

    const result = await generateRule({ prompt: text, levelId: "lab-01" });
    setBusy(false);

    if (!result.ok) {
      setServerMessage(`生成失败：${result.reason}（后端未启动？）`);
      return;
    }

    const { body } = result;

    if (body.status === "ready" && body.rulePack) {
      if (!applyRulePack(body.rulePack)) {
        setUnavailable(true);
        setServerMessage("规则已生成，但实验室还没启动，先点「进入实验室」。");
        return;
      }
      setLastPackId(body.rulePack.packId);
      setShareUrl(null);
      setServerMessage(`已生成并启用：${body.explanation || "规则已生效"}`);
      return;
    }

    if (body.status === "unsupported") {
      setServerMessage(`无法生成：${body.explanation}`);
      return;
    }

    const firstError = body.validation.errors[0] ?? "未知原因";
    setServerMessage(`规则被拒绝：${firstError}`);
  }, [busy, prompt]);

  const share = useCallback(async () => {
    if (!lastPackId || saving) {
      return;
    }

    setSaving(true);
    const result = await saveChallenge(lastPackId);
    setSaving(false);

    if (!result.ok) {
      setServerMessage(`分享链接创建失败：${result.reason}`);
      return;
    }

    setShareUrl(`${window.location.origin}${result.body.url}`);
  }, [lastPackId, saving]);

  const statusLine = useMemo(() => {
    if (unavailable) {
      return "实验室未启动：先点「进入实验室」，规则才会生效。";
    }
    if (error) {
      return `规则未生效：${error}`;
    }
    if (activeId) {
      const parts = [
        `已触发 ${stats.eventsDispatched} 次`,
        `已应用 ${stats.actionsApplied} 个动作`,
      ];
      if (stats.conditionsBlocked > 0) {
        parts.push(`条件未满足 ${stats.conditionsBlocked} 次`);
      }
      return `规则运行中 · ${parts.join(" · ")}`;
    }
    return "当前没有生效的规则。";
  }, [activeId, error, stats, unavailable]);

  return (
    <section className="panel panel--rules">
      <h3 className="panel__title">规则输入面板</h3>
      <p className="panel__note">
        用一句话描述规则，服务端会把它编译成受控 DSL 并校验；也可以直接选下面的预设。
      </p>

      <div className="rule-input">
        <input
          className="rule-input__field"
          type="text"
          value={prompt}
          placeholder="例如：每跳一次，重力反转"
          maxLength={500}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void submit();
            }
          }}
          aria-label="规则描述"
        />
        <button
          type="button"
          className="button button--primary"
          onClick={() => void submit()}
          disabled={busy || prompt.trim().length === 0}
        >
          {busy ? "生成中…" : "生成规则"}
        </button>
      </div>

      {serverMessage ? (
        <p className="rule-message" data-testid="rule-message">
          {serverMessage}
        </p>
      ) : null}

      {lastPackId ? (
        <div className="rule-share">
          <button
            type="button"
            className="button button--ghost"
            onClick={() => void share()}
            disabled={saving}
          >
            {saving ? "创建中…" : "创建分享链接"}
          </button>
          {shareUrl ? (
            <code className="rule-share__url" data-testid="share-url">
              {shareUrl}
            </code>
          ) : null}
        </div>
      ) : null}

      <div className="rule-cards">
        {PRESETS.map((entry) => {
          const active = activeId === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              className={`rule-card${active ? " rule-card--active" : ""}`}
              onClick={() => toggle(entry)}
              aria-pressed={active}
              data-rule-id={entry.id}
            >
              <span className="rule-card__name">{entry.name}</span>
              <span className="rule-card__desc">{entry.description}</span>
              <span className="rule-card__state">{active ? "已启用" : "未启用"}</span>
            </button>
          );
        })}
      </div>

      <p className={`rule-status${error ? " rule-status--error" : ""}`} data-testid="rule-status">
        {statusLine}
      </p>
    </section>
  );
}