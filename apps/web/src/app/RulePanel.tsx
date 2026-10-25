import { useEffect, useMemo, useState } from "react";

import type { RuleRuntimeStats } from "@/game/rules/types";
import { applyRulePack, clearRules, subscribeToRules } from "@/game/rules/ruleBridge";

import gravityPreset from "@content/presets/preset-gravity-flip.json";
import enemySlowPreset from "@content/presets/preset-enemy-slow.json";

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
    id: enemySlowPreset.id,
    name: enemySlowPreset.name,
    description: "捡到金币后敌人减速 30%（需要敌人，RF-004 接入）。",
    pack: enemySlowPreset,
  },
];

const EMPTY_STATS: RuleRuntimeStats = {
  eventsDispatched: 0,
  eventsDropped: 0,
  actionsApplied: 0,
  actionsRejected: 0,
};

/**
 * Rule input panel.
 *
 * It reflects real engine state, not optimistic UI: if the scene rejects a pack,
 * the error is shown and the card is not marked active.
 */
export function RulePanel() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<RuleRuntimeStats>(EMPTY_STATS);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => subscribeToRules((payload) => {
    setActiveId(payload.packId);
    setError(payload.error);
    setStats(payload.stats);
  }), []);

  const toggle = (entry: PresetEntry): void => {
    if (activeId === entry.id) {
      const ok = clearRules();
      if (!ok) {
        setUnavailable(true);
      }
      return;
    }

    const ok = applyRulePack(entry.pack);
    if (!ok) {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
  };

  const statusLine = useMemo(() => {
    if (unavailable) {
      return "实验室未启动：先点「进入实验室」，规则才会生效。";
    }
    if (error) {
      return `规则未生效：${error}`;
    }
    if (activeId) {
      return `规则运行中 · 已触发 ${stats.eventsDispatched} 次 · 已应用 ${stats.actionsApplied} 个动作`;
    }
    return "当前没有生效的规则。";
  }, [activeId, error, stats, unavailable]);

  return (
    <section className="panel panel--rules">
      <h3 className="panel__title">规则输入面板</h3>
      <p className="panel__note">
        选一张规则卡，游戏世界会立刻按它运行。这里跑的是真实的规则引擎，不是演示动画。
      </p>

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
