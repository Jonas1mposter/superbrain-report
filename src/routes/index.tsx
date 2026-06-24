import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { forwardRef, useEffect, useRef, useState } from "react";
import { generateReport, type DailyReport } from "@/lib/report.functions";
import {
  DEFAULT_TEMPLATE,
  PRESETS,
  TONE_STYLES,
  deleteTemplateFor,
  loadStoredTemplates,
  saveTemplateFor,
  type PosterTemplate,
  type SectionConfig,
  type SectionKey,
} from "@/lib/template";

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

const SECTION_ORDER: SectionKey[] = ["highlight", "stuck", "improve"];

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

  const [template, setTemplate] = useState<PosterTemplate>(DEFAULT_TEMPLATE);
  const [showEditor, setShowEditor] = useState(false);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [image, setImage] = useState<string | null>(null);

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      alert("图片不能超过 4MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    setSavedNames(Object.keys(loadStoredTemplates()));
  }, []);

  // Auto-load template when student name matches a saved one
  useEffect(() => {
    if (!form.studentName) return;
    const all = loadStoredTemplates();
    if (all[form.studentName]) setTemplate(all[form.studentName]);
  }, [form.studentName]);

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
    const html = buildStandaloneHtml(result, template, image);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.meta.studentName}-Day${result.meta.day}-观察报告.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function applyPreset(idx: number) {
    setTemplate(PRESETS[idx].template);
  }

  function saveForStudent() {
    if (!form.studentName) {
      alert("请先填写学员姓名");
      return;
    }
    saveTemplateFor(form.studentName, template);
    setSavedNames(Object.keys(loadStoredTemplates()));
  }

  function removeForStudent(name: string) {
    deleteTemplateFor(name);
    setSavedNames(Object.keys(loadStoredTemplates()));
  }

  function updateSection(key: SectionKey, patch: Partial<SectionConfig>) {
    setTemplate({
      ...template,
      sections: { ...template.sections, [key]: { ...template.sections[key], ...patch } },
    });
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
          <button
            onClick={() => setShowEditor((s) => !s)}
            className="rounded-lg border border-[oklch(0.85_0.03_60)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[oklch(0.96_0.02_80)]"
          >
            {showEditor ? "收起模板编辑器" : "🎨 打开模板编辑器"}
          </button>
        </div>
      </header>

      {showEditor && (
        <div className="border-b border-[oklch(0.9_0.02_80)] bg-white">
          <div className="mx-auto max-w-6xl px-6 py-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">模板编辑器</h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[oklch(0.5_0.02_60)]">预设：</span>
                {PRESETS.map((p, i) => (
                  <button
                    key={p.name}
                    onClick={() => applyPreset(i)}
                    className="rounded-md border border-[oklch(0.88_0.03_60)] bg-white px-2.5 py-1 text-xs hover:bg-[oklch(0.96_0.02_80)]"
                  >
                    {p.name}
                  </button>
                ))}
                <button
                  onClick={saveForStudent}
                  className="rounded-md bg-[oklch(0.55_0.18_30)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[oklch(0.5_0.18_30)]"
                >
                  保存为「{form.studentName || "当前学员"}」模板
                </button>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[oklch(0.45_0.02_60)]">
                  布局与配色
                </h3>
                <Field label="布局">
                  <select
                    value={template.layout}
                    onChange={(e) =>
                      setTemplate({ ...template, layout: e.target.value as PosterTemplate["layout"] })
                    }
                    className="input"
                  >
                    <option value="stack">堆叠（默认）</option>
                    <option value="split">两栏分屏</option>
                    <option value="compact">紧凑单卡</option>
                  </select>
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="渐变起">
                    <input
                      className="input"
                      value={template.themeFrom}
                      onChange={(e) => setTemplate({ ...template, themeFrom: e.target.value })}
                    />
                  </Field>
                  <Field label="渐变中">
                    <input
                      className="input"
                      value={template.themeVia}
                      onChange={(e) => setTemplate({ ...template, themeVia: e.target.value })}
                    />
                  </Field>
                  <Field label="渐变止">
                    <input
                      className="input"
                      value={template.themeTo}
                      onChange={(e) => setTemplate({ ...template, themeTo: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="底部脚注">
                  <input
                    className="input"
                    value={template.footer}
                    onChange={(e) => setTemplate({ ...template, footer: e.target.value })}
                  />
                </Field>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={template.showEncouragement}
                      onChange={(e) =>
                        setTemplate({ ...template, showEncouragement: e.target.checked })
                      }
                    />
                    显示鼓励语
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={template.showMentor}
                      onChange={(e) => setTemplate({ ...template, showMentor: e.target.checked })}
                    />
                    显示导师信息
                  </label>
                </div>

                {savedNames.length > 0 && (
                  <div className="pt-2">
                    <div className="mb-1 text-xs text-[oklch(0.45_0.02_60)]">
                      已保存的学员模板：
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {savedNames.map((n) => (
                        <span
                          key={n}
                          className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.96_0.02_80)] px-2 py-0.5 text-xs"
                        >
                          {n}
                          <button
                            onClick={() => removeForStudent(n)}
                            className="text-[oklch(0.5_0.15_30)] hover:underline"
                            title="删除"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[oklch(0.45_0.02_60)]">
                  板块设置
                </h3>
                {SECTION_ORDER.map((k) => {
                  const s = template.sections[k];
                  return (
                    <div
                      key={k}
                      className="rounded-lg border border-[oklch(0.92_0.02_80)] bg-[oklch(0.99_0.005_80)] p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-medium">
                          <input
                            type="checkbox"
                            checked={s.enabled}
                            onChange={(e) => updateSection(k, { enabled: e.target.checked })}
                          />
                          {sectionLabel(k)}
                        </label>
                      </div>
                      <div className="grid grid-cols-[2fr_1fr] gap-2">
                        <input
                          className="input"
                          value={s.tag}
                          onChange={(e) => updateSection(k, { tag: e.target.value })}
                          placeholder="标签（含 emoji）"
                        />
                        <select
                          className="input"
                          value={s.tone}
                          onChange={(e) =>
                            updateSection(k, { tone: e.target.value as SectionConfig["tone"] })
                          }
                        >
                          <option value="warm">暖橙</option>
                          <option value="cool">冷蓝</option>
                          <option value="green">青绿</option>
                          <option value="violet">紫</option>
                          <option value="slate">石板灰</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

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
            <Field label="海报配图（选填）">
              <input type="file" accept="image/*" onChange={onPickImage} className="input" />
              {image && (
                <div className="mt-2 flex items-center gap-2">
                  <img src={image} alt="预览" className="h-14 w-14 rounded-md object-cover" />
                  <button
                    type="button"
                    onClick={() => setImage(null)}
                    className="text-xs text-[oklch(0.5_0.15_30)] hover:underline"
                  >
                    移除图片
                  </button>
                </div>
              )}
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
            <Poster ref={posterRef} data={result} template={template} image={image} />
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

function sectionLabel(k: SectionKey) {
  return k === "highlight" ? "今日高光" : k === "stuck" ? "今日卡点" : "如何进步";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[oklch(0.4_0.02_60)]">{label}</span>
      {children}
    </label>
  );
}

const Poster = forwardRef<
  HTMLDivElement,
  { data: ReportResult; template: PosterTemplate; image?: string | null }
>(function Poster({ data, template, image }, ref) {
  const { report, meta } = data;
  const sectionsLayout =
    template.layout === "split"
      ? "grid grid-cols-2 gap-3"
      : template.layout === "compact"
        ? "space-y-2"
        : "space-y-3";

  const sectionNodes: Record<SectionKey, React.ReactNode> = {
    highlight: (
      <Block
        key="highlight"
        cfg={template.sections.highlight}
        title={report.highlight.title}
      >
        <p>{report.highlight.detail}</p>
      </Block>
    ),
    stuck: (
      <Block key="stuck" cfg={template.sections.stuck} title={report.stuck.title}>
        <p>{report.stuck.detail}</p>
      </Block>
    ),
    improve: (
      <Block key="improve" cfg={template.sections.improve} title={report.improve.title}>
        <ul className="ml-4 list-disc space-y-1">
          {report.improve.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </Block>
    ),
  };

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-2xl shadow-xl"
      style={{
        background: `linear-gradient(160deg, ${template.themeFrom} 0%, ${template.themeVia} 55%, ${template.themeTo} 100%)`,
        color: "oklch(0.2 0.03 60)",
      }}
    >
      {image && (
        <img
          src={image}
          alt="海报配图"
          className="h-48 w-full object-cover"
        />
      )}
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
          {template.showMentor && meta.mentor ? ` · 导师 ${meta.mentor}` : ""}
        </p>
      </div>

      <div className="mt-6 px-7 pb-7">
        <div className={sectionsLayout}>
          {SECTION_ORDER.filter((k) => template.sections[k].enabled).map(
            (k) => sectionNodes[k],
          )}
        </div>

        {template.showEncouragement && (
          <div
            className="mt-4 rounded-xl border border-white/60 bg-white/70 px-4 py-3 text-center text-sm italic"
            style={{ color: "oklch(0.35 0.1 30)" }}
          >
            “{report.encouragement}”
          </div>
        )}

        <div className="pt-3 text-center text-[10px] tracking-wider text-[oklch(0.45_0.05_40)]">
          {template.footer}
        </div>
      </div>
    </div>
  );
});

function Block({
  cfg,
  title,
  children,
}: {
  cfg: SectionConfig;
  title: string;
  children: React.ReactNode;
}) {
  const tone = TONE_STYLES[cfg.tone];
  return (
    <div
      className="rounded-xl border border-white/70 px-4 py-3 text-sm leading-relaxed"
      style={{ background: tone.bg }}
    >
      <div
        className="mb-1 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: tone.accent }}
      >
        {cfg.tag}
      </div>
      <div className="mb-1 font-semibold text-[oklch(0.2_0.03_60)]">{title}</div>
      <div className="text-[oklch(0.3_0.03_60)]">{children}</div>
    </div>
  );
}

function buildStandaloneHtml(data: ReportResult, t: PosterTemplate) {
  const { report, meta } = data;
  const steps = report.improve.steps.map((s) => `<li>${esc(s)}</li>`).join("");

  const blockHtml = (key: SectionKey) => {
    const cfg = t.sections[key];
    if (!cfg.enabled) return "";
    const tone = TONE_STYLES[cfg.tone];
    const inner =
      key === "highlight"
        ? `<div class="title">${esc(report.highlight.title)}</div><div class="detail">${esc(report.highlight.detail)}</div>`
        : key === "stuck"
          ? `<div class="title">${esc(report.stuck.title)}</div><div class="detail">${esc(report.stuck.detail)}</div>`
          : `<div class="title">${esc(report.improve.title)}</div><div class="detail"><ul>${steps}</ul></div>`;
    return `<div class="block" style="background:${tone.cssBg}"><div class="tag" style="color:${tone.cssAccent}">${esc(cfg.tag)}</div>${inner}</div>`;
  };

  const sectionsHtml = SECTION_ORDER.map(blockHtml).join("");
  const bodyLayout =
    t.layout === "split"
      ? "display:grid;grid-template-columns:1fr 1fr;gap:12px"
      : "display:flex;flex-direction:column;gap:" + (t.layout === "compact" ? "8px" : "12px");

  const gradient = `linear-gradient(160deg, ${oklchToCss(t.themeFrom)} 0%, ${oklchToCss(t.themeVia)} 55%, ${oklchToCss(t.themeTo)} 100%)`;

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<title>${esc(meta.studentName)} · Day ${esc(meta.day)} 观察报告</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f4ede2;padding:24px;color:#2a221b}
  .card{max-width:560px;margin:0 auto;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(160,80,40,.18);background:${gradient}}
  .head{padding:28px 28px 0}
  .kicker{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7a4a2a}
  h1{font-size:28px;margin:14px 0 4px}
  .sub{font-size:13px;color:#7a4a2a;margin:0}
  .body{padding:20px 28px 28px}
  .sections{${bodyLayout}}
  .block{border:1px solid rgba(255,255,255,.7);border-radius:14px;padding:14px 16px}
  .tag{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
  .title{font-weight:600;margin-bottom:4px}
  .detail{color:#4a3a2a;font-size:14px;line-height:1.6}
  ul{margin:6px 0 0 18px;padding:0}
  .quote{margin-top:12px;background:rgba(255,255,255,.7);border-radius:12px;padding:12px;text-align:center;font-style:italic;color:#7a3a1a}
  .foot{text-align:center;font-size:10px;letter-spacing:.1em;color:#7a4a2a;padding-top:10px}
</style></head><body>
<div class="card">
  <div class="head">
    <div class="kicker"><span>AI for Good · Summer Camp</span><span>Day ${esc(meta.day)} / 7</span></div>
    <h1>${esc(meta.studentName)} 的第 ${esc(meta.day)} 天</h1>
    <p class="sub">${esc(meta.date)}${meta.project ? " · " + esc(meta.project) : ""}${t.showMentor && meta.mentor ? " · 导师 " + esc(meta.mentor) : ""}</p>
  </div>
  <div class="body">
    <div class="sections">${sectionsHtml}</div>
    ${t.showEncouragement ? `<div class="quote">“${esc(report.encouragement)}”</div>` : ""}
    <div class="foot">${esc(t.footer)}</div>
  </div>
</div>
</body></html>`;
}

// Best-effort: keep oklch() as-is for modern browsers; standalone HTML opened
// in any recent browser supports it.
function oklchToCss(v: string) {
  return v;
}

function esc(s: string) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
