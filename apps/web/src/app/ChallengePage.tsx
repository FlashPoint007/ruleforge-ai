import { useEffect, useState } from "react";

import { fetchChallenge } from "@/api/challenges";
import { checkChallengeCompatibility } from "@/game/rules/compatibility";
import type { Challenge } from "@ruleforge/shared-types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; reason: string }
  | { status: "loaded"; challenge: Challenge };

/**
 * The page a shared link opens.
 *
 * It is deliberately read-only about the challenge: a challenge is frozen, so the
 * only thing this page may do is show it and hand the pack to the game. Editing
 * it would create a new rule, which belongs on the home page.
 */
export function ChallengePage({ challengeId }: { challengeId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    void fetchChallenge(challengeId).then((result) => {
      if (cancelled) {
        return;
      }
      setState(
        result.ok ? { status: "loaded", challenge: result.challenge } : { status: "error", reason: result.reason },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  if (state.status === "loading") {
    return (
      <section className="panel">
        <h2 className="panel__title">正在载入挑战…</h2>
        <p className="panel__note">{challengeId}</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="panel">
        <h2 className="panel__title">无法打开这条挑战</h2>
        <p className="panel__note" data-testid="challenge-error">
          {state.reason}
        </p>
        <a className="button button--primary" href="/">
          回到首页
        </a>
      </section>
    );
  }

  const { challenge } = state;
  const compatibility = checkChallengeCompatibility(challenge);
  const pack = challenge.rulePack;

  return (
    <div className="page">
      <section className="panel">
        <p className="hero__eyebrow">分享的挑战</p>
        <h2 className="panel__title">{challenge.challengeId}</h2>
        <p className="panel__note">
          关卡 {challenge.levelId} · v{challenge.levelVersion} · 种子 {challenge.seed}
        </p>

        {compatibility.level !== "ok" ? (
          <p
            className={`rule-status${compatibility.level === "rejected" ? " rule-status--error" : ""}`}
            data-testid="challenge-compat"
          >
            {compatibility.reason}
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h3 className="panel__title">规则内容</h3>
        {pack ? (
          <ul className="cards">
            {pack.rules.map((rule) => (
              <li key={rule.id} className="card">
                <span className="card__name">{rule.trigger.event}</span>
                <dl className="card__meta">
                  <div>
                    <dt>动作</dt>
                    <dd>{rule.actions.map((action) => action.op).join(" · ")}</dd>
                  </div>
                  <div>
                    <dt>条件</dt>
                    <dd>{rule.conditions.length > 0 ? `${rule.conditions.length} 个` : "无"}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel__note">这条挑战没有附带规则内容。</p>
        )}
      </section>

      <section className="panel">
        <a
          className="button button--primary"
          href={`/?challenge=${encodeURIComponent(challenge.challengeId)}`}
          data-testid="play-challenge"
        >
          用这条规则去实验室
        </a>
        <p className="panel__note" style={{ marginTop: 12 }}>
          会带着这条规则打开实验室；规则本身是冻结的，不会被改写。
        </p>
      </section>
    </div>
  );
}