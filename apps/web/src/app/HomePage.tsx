import { lazy, Suspense, useEffect, useState } from "react";

import { P0_ACTIONS } from "@ruleforge/rule-schema";

import { RulePanel } from "@/app/RulePanel";
import { TouchControls } from "@/game/TouchControls";
import { DEFAULT_LEVEL_ID, listLevels } from "@/game/levels/levelRegistry";

const GameCanvas = lazy(() =>
  import("@/game/GameCanvas").then((module) => ({ default: module.GameCanvas })),
);

const PRESETS = [
  { id: "preset-gravity-flip", name: "重力反转", trigger: "每跳一次", effect: "重力方向反转" },
  { id: "preset-enemy-slow", name: "拾金减速", trigger: "捡到金币", effect: "敌人减速 30%，持续 5 秒" },
];

export function HomePage() {
  // A shared link opens the lab with that challenge already loaded.
  const challengeId = new URLSearchParams(window.location.search).get("challenge");
  const [arenaOpen, setArenaOpen] = useState(challengeId !== null);
  const [levelId, setLevelId] = useState(DEFAULT_LEVEL_ID);
  const levels = listLevels();

  useEffect(() => {
    if (challengeId) {
      setArenaOpen(true);
    }
  }, [challengeId]);

  return (
    <div className="page">
      <section className="hero">
        <p className="hero__eyebrow">RF-003 · 可玩原型</p>
        <h2 className="hero__title">
          用一句自然语言，
          <br />
          锻造一条能被验证的规则。
        </h2>
        <p className="hero__lead">
          你说「每跳一次重力反转」，模型只负责产出受控的 Rule IR，
          确定性编译器把它校验成带版本的 DSL，Phaser 在本地执行。
          模型永远不返回可执行代码。
        </p>

        <div className="level-picker" role="group" aria-label="选择关卡">
          {levels.map((level) => (
            <button
              key={level.id}
              type="button"
              className={`level-chip${levelId === level.id ? " level-chip--active" : ""}`}
              onClick={() => setLevelId(level.id)}
              aria-pressed={levelId === level.id}
              data-level-id={level.id}
            >
              <span className="level-chip__name">{level.name}</span>
              <span className="level-chip__meta">{level.id}</span>
            </button>
          ))}
        </div>

        <div className="hero__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => setArenaOpen((open) => !open)}
          >
            {arenaOpen ? "收起实验室" : "进入实验室"}
          </button>
          <span className="hero__hint">
            进入实验室后，在下方「规则输入面板」启用「重力反转」，跳一次就能看到世界真的翻过来。
          </span>
        </div>
      </section>

      {arenaOpen ? (
        <section className="panel panel--stage" aria-label="实验室">
          <Suspense fallback={<p className="panel__note">正在载入实验室…</p>}>
            <GameCanvas key={levelId} levelId={levelId} />
            <TouchControls />
          </Suspense>
        </section>
      ) : null}

      <RulePanel initialChallengeId={challengeId} levelId={levelId} />

      <section className="panel">
        <h3 className="panel__title">预设规则</h3>
        <p className="panel__note">
          以下预设无需任何模型密钥即可使用，由 <code>game-content/presets</code> 提供。
        </p>
        <ul className="cards">
          {PRESETS.map((preset) => (
            <li key={preset.id} className="card">
              <span className="card__name">{preset.name}</span>
              <dl className="card__meta">
                <div>
                  <dt>触发</dt>
                  <dd>{preset.trigger}</dd>
                </div>
                <div>
                  <dt>效果</dt>
                  <dd>{preset.effect}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel panel--muted">
        <h3 className="panel__title">已注册动作（{P0_ACTIONS.length} / 12）</h3>
        <p className="panel__note">
          AI 只能从这张注册表里选动作并填充受限参数，这是生成层与执行层的边界。
        </p>
        <ul className="chips">
          {P0_ACTIONS.map((action) => (
            <li key={action} className="chip">
              {action}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}