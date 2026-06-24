import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { forwardRef, useRef, useState } from "react";
import { generateReport, type DailyReport } from "@/lib/report.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI for Good · 每日观察报告生成器" },
      {
        name: "description",
        content:
          "为 AI for Good 7天夏令营导师设计的每日观察报告生成器，一键生成包含今日高光、卡点与进步建议的 HTML 海报。",
      },
    ],
  }),
  component: Index,
});

type ReportResult = {
  report: DailyReport;
  meta: {
    studentName: string;
    day: string;
    date: string;
    project?: string;
    mentor?: string;
  };
};

function Index() {
  const run = useServerFn(generateReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const posterRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    studentName: "",
    day: "1",
    date: new Date().toISOString().slice(0, 10),
    project: "",
    mentor: "",
    observations: "",
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = (await run({ data: form })) as ReportResult;
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  function downloadHtml() {
    if (!result) return;
    const html = buildStandaloneHtml(result);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.meta.studentName}-Day${result.meta.day}-观察报告.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.01_95)] text-[oklch(0.2_0.03_60)]">
      <header className="border-b border-[oklch(0.9_0.02_80)] bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[oklch(0.55_0.18_30)] text-lg font-bold text-white">
              AI
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">AI for Good · 每日观察报告</h1>
              <p className="text-xs text-[oklch(0.5_0.02_60)]">7-Day Summer Camp · 导师工具</p>
            </div>
          </div>
          <div className="text-xs text-[oklch(0.5_0.02_60)]">由 Kimi 大模型驱动</div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[1fr_1.1fr]">
        <section className="rounded-2xl border border-[oklch(0.9_0.02_80)] bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold">填写基础信息</h2>
          <p className="mb-5 text-sm text-[oklch(0.5_0.02_60)]">
            写下你今天对学员的真实观察，AI 会帮你整理成一份温暖的报告海报。
          </p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="学员姓名">
                <input
                  required
                  value={form.studentName}
                  onChange={(e) => setForm({ ...form, studentName: e.target.value })}
                  className="input"
                  placeholder="例：林小满"
                />
              </Field>
              <Field label="第几天 (1-7)">
                <input
                  required
                  type="number"
                  min={1}
                  max={7}
                  value={form.day}
                  onChange={(e) => setForm({ ...form, day: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="日期">
                <input
                  required
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="带教导师">
                <input
                  value={form.mentor}
                  onChange={(e) => setForm({ ...form, mentor: e.target.value })}
                  className="input"
                  placeholder="选填"
                />
              </Field>
            </div>
            <Field label="项目方向">
              <input
                value={form.project}
                onChange={(e) => setForm({ ...form, project: e.target.value })}
                className="input"
                placeholder="例：用 AI 帮助听障儿童学习语言"
              />
            </Field>
            <Field label="今日观察记录">
              <textarea
                required
                rows={8}
                value={form.observations}
                onChange={(e) => setForm({ ...form, observations: e.target.value })}
                className="input resize-y"
                placeholder={"尽量具体，比如：\n- 上午做了什么\n- 遇到的困难\n- 与队友的互动\n- 让你眼前一亮的瞬间"}
              />
            </Field>

            {error && (
              <div className="rounded-lg border border-[oklch(0.85_0.1_30)] bg-[oklch(0.97_0.03_30)] px-3 py-2 text-sm text-[oklch(0.45_0.18_30)]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[oklch(0.55_0.18_30)] px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-[oklch(0.5_0.18_30)] disabled:opacity-60"
            >
              {loading ? "Kimi 正在生成…" : "生成今日观察报告"}
            </button>
          </form>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">海报预览</h2>
            {result && (
              <button
                onClick={downloadHtml}
                className="rounded-lg border border-[oklch(0.85_0.03_60)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[oklch(0.96_0.02_80)]"
              >
                下载 HTML 海报
              </button>
            )}
          </div>
          {result ? (
            <Poster ref={posterRef} data={result} />
          ) : (
            <div className="flex h-[520px] items-center justify-center rounded-2xl border border-dashed border-[oklch(0.85_0.03_60)] bg-white/60 text-sm text-[oklch(0.55_0.02_60)]">
              填写左侧表单，生成的海报会出现在这里
            </div>
          )}
        </section>
      </main>

      <style>{`
        .input {
          width: 100%;
          border-radius: 10px;
          border: 1px solid oklch(0.9 0.02 80);
          background: white;
          padding: 0.55rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .input:focus {
          border-color: oklch(0.55 0.18 30);
          box-shadow: 0 0 0 3px oklch(0.55 0.18 30 / 0.15);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[oklch(0.4_0.02_60)]">{label}</span>
      {children}
    </label>
  );
}

const Poster = forwardRef<HTMLDivElement, { data: ReportResult }>(function Poster(
  { data },
  ref,
) {
  const { report, meta } = data;
  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-2xl shadow-xl"
      style={{
        background:
          "linear-gradient(160deg, oklch(0.97 0.04 80) 0%, oklch(0.94 0.06 50) 55%, oklch(0.88 0.12 30) 100%)",
        color: "oklch(0.2 0.03 60)",
      }}
    >
      <div className="px-7 pt-7">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-[oklch(0.4_0.05_40)]">
          <span>AI for Good · Summer Camp</span>
          <span>Day {meta.day} / 7</span>
        </div>
        <h3 className="mt-4 text-3xl font-bold leading-tight">
          {meta.studentName} 的第 {meta.day} 天
        </h3>
        <p className="mt-1 text-sm text-[oklch(0.4_0.05_40)]">
          {meta.date}
          {meta.project ? ` · ${meta.project}` : ""}
          {meta.mentor ? ` · 导师 ${meta.mentor}` : ""}
        </p>
      </div>

      <div className="mt-6 space-y-3 px-7 pb-7">
        <Block tag="✨ 今日高光" tone="warm" title={report.highlight.title}>
          <p>{report.highlight.detail}</p>
        </Block>
        <Block tag="🧱 今日卡点" tone="cool" title={report.stuck.title}>
          <p>{report.stuck.detail}</p>
        </Block>
        <Block tag="🚀 如何进步" tone="green" title={report.improve.title}>
          <ul className="ml-4 list-disc space-y-1">
            {report.improve.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Block>

        <div
          className="mt-4 rounded-xl border border-white/60 bg-white/70 px-4 py-3 text-center text-sm italic"
          style={{ color: "oklch(0.35 0.1 30)" }}
        >
          “{report.encouragement}”
        </div>

        <div className="pt-3 text-center text-[10px] tracking-wider text-[oklch(0.45_0.05_40)]">
          Generated with Kimi · AI for Good 观察导师工具
        </div>
      </div>
    </div>
  );
});

function Block({
  tag,
  title,
  tone,
  children,
}: {
  tag: string;
  title: string;
  tone: "warm" | "cool" | "green";
  children: React.ReactNode;
}) {
  const bg =
    tone === "warm"
      ? "oklch(1 0 0 / 0.78)"
      : tone === "cool"
        ? "oklch(0.97 0.02 250 / 0.85)"
        : "oklch(0.96 0.05 145 / 0.85)";
  const accent =
    tone === "warm"
      ? "oklch(0.55 0.18 30)"
      : tone === "cool"
        ? "oklch(0.45 0.12 250)"
        : "oklch(0.45 0.15 145)";
  return (
    <div
      className="rounded-xl border border-white/70 px-4 py-3 text-sm leading-relaxed"
      style={{ background: bg }}
    >
      <div
        className="mb-1 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: accent }}
      >
        {tag}
      </div>
      <div className="mb-1 font-semibold text-[oklch(0.2_0.03_60)]">{title}</div>
      <div className="text-[oklch(0.3_0.03_60)]">{children}</div>
    </div>
  );
}

function buildStandaloneHtml(data: ReportResult) {
  const { report, meta } = data;
  const steps = report.improve.steps.map((s) => `<li>${esc(s)}</li>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<title>${esc(meta.studentName)} · Day ${esc(meta.day)} 观察报告</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f4ede2;padding:24px;color:#2a221b}
  .card{max-width:520px;margin:0 auto;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(160,80,40,.18);background:linear-gradient(160deg,#fbf2dd 0%,#f5d7b0 55%,#e89a6d 100%)}
  .head{padding:28px 28px 0}
  .kicker{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7a4a2a}
  h1{font-size:28px;margin:14px 0 4px}
  .sub{font-size:13px;color:#7a4a2a;margin:0}
  .body{padding:20px 28px 28px;display:flex;flex-direction:column;gap:12px}
  .block{background:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.7);border-radius:14px;padding:14px 16px}
  .tag{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
  .t-warm{color:#b14a1a}.t-cool{color:#2a4a8a}.t-green{color:#2a6a3a}
  .title{font-weight:600;margin-bottom:4px}
  .detail{color:#4a3a2a;font-size:14px;line-height:1.6}
  ul{margin:6px 0 0 18px;padding:0}
  .quote{margin-top:6px;background:rgba(255,255,255,.7);border-radius:12px;padding:12px;text-align:center;font-style:italic;color:#7a3a1a}
  .foot{text-align:center;font-size:10px;letter-spacing:.1em;color:#7a4a2a;padding-top:4px}
</style></head><body>
<div class="card">
  <div class="head">
    <div class="kicker"><span>AI for Good · Summer Camp</span><span>Day ${esc(meta.day)} / 7</span></div>
    <h1>${esc(meta.studentName)} 的第 ${esc(meta.day)} 天</h1>
    <p class="sub">${esc(meta.date)}${meta.project ? " · " + esc(meta.project) : ""}${meta.mentor ? " · 导师 " + esc(meta.mentor) : ""}</p>
  </div>
  <div class="body">
    <div class="block"><div class="tag t-warm">✨ 今日高光</div><div class="title">${esc(report.highlight.title)}</div><div class="detail">${esc(report.highlight.detail)}</div></div>
    <div class="block"><div class="tag t-cool">🧱 今日卡点</div><div class="title">${esc(report.stuck.title)}</div><div class="detail">${esc(report.stuck.detail)}</div></div>
    <div class="block"><div class="tag t-green">🚀 如何进步</div><div class="title">${esc(report.improve.title)}</div><div class="detail"><ul>${steps}</ul></div></div>
    <div class="quote">“${esc(report.encouragement)}”</div>
    <div class="foot">Generated with Kimi · AI for Good 观察导师工具</div>
  </div>
</div>
</body></html>`;
}

function esc(s: string) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
