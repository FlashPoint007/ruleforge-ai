import { useEffect, useState } from "react";

import { checkBackend, type HealthState } from "@/app/health";
import { ChallengePage } from "@/app/ChallengePage";
import { HomePage } from "@/app/HomePage";
import { parseRoute } from "@/app/route";
import { resolveBaseUrl } from "@/api/ApiClient";

export function App() {
  const [health, setHealth] = useState<HealthState>({ status: "checking", detail: "检测中…" });
  const route = parseRoute(window.location.pathname);

  useEffect(() => {
    let cancelled = false;

    void checkBackend().then((next) => {
      if (!cancelled) {
        setHealth(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead__brand">
          <span className="masthead__mark" aria-hidden="true" />
          <div>
            <h1 className="masthead__title">RuleForge AI</h1>
            <p className="masthead__subtitle">规则造物局 · 把一句话锻造成可玩的规则</p>
          </div>
        </div>
        <span className={`badge badge--${health.status}`} data-testid="backend-status">
          {health.detail}
        </span>
      </header>

      <main>
        {route.name === "home" ? <HomePage /> : null}
        {route.name === "challenge" ? <ChallengePage challengeId={route.challengeId} /> : null}
        {route.name === "unknown" ? (
          <section className="panel">
            <h2 className="panel__title">页面不存在</h2>
            <p className="panel__note">{route.path}</p>
            <a className="button button--primary" href="/">
              回到首页
            </a>
          </section>
        ) : null}
      </main>

      <footer className="footer">
        <span>API 基址：{resolveBaseUrl()}</span>
        <span>规则生成 · DSL 运行时 · 挑战分享</span>
      </footer>
    </div>
  );
}