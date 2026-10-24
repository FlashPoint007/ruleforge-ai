import { useEffect, useState } from "react";

import { checkBackend, type HealthState } from "@/app/health";
import { HomePage } from "@/app/HomePage";
import { resolveBaseUrl } from "@/api/ApiClient";

export function App() {
  const [health, setHealth] = useState<HealthState>({ status: "checking", detail: "检测中…" });

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
        <HomePage />
      </main>

      <footer className="footer">
        <span>API 基址：{resolveBaseUrl()}</span>
        <span>M0 脚手架 · 规则生成与 DSL 运行时尚未实现</span>
      </footer>
    </div>
  );
}
