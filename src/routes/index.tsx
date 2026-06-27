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

const EXAMPLE = {
  studentName: "林小满",
  day: "3",
  date: "2026-07-15",
  project: "用 AI 帮助听障儿童学习语言",
  mentor: "陈老师",
  observations: `上午的 AI 伦理工作坊里，小满主动举手分享了昨天在社区调研中遇到的真实故事：一位听障儿童的家长说，现有的语音学习 App 语速太快，孩子跟不上。小满立刻在小组讨论中提出"可以让 AI 把句子拆成更慢的小片段"，并画了一个三页纸的流程草图。\n\n午饭前她用 Kimi 辅助生成了一个"慢语速语音切片"的原型说明，但中途卡在选择工具上——她试了两种 TTS 工具都不满意，情绪有点低落，甚至说"是不是我的想法太简单了"。经过导师和同学提醒，她发现不是想法简单，而是还没找到适合儿童语速的参数。\n\n下午她和队友一起把流程图改成可点击的低保真原型，并决定明天先去采访 1 位小朋友验证这个方向。`,
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
    reader.onload = async () => {
      const raw = reader.result as string;
      // Normalize via canvas so the resulting data URL is a freshly-encoded
      // PNG/JPEG bitmap. This avoids html-to-image edge cases where the
      // original file's encoding (HEIC-converted, large progressive JPEG,
      // etc.) fails to embed into the exported poster.
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("decode failed"));
          img.src = raw;
        });
        const maxW = 1200;
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        setImage(canvas.toDataURL("image/jpeg", 0.92));
      } catch {
        setImage(raw);
      }
    };
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

  const [exporting, setExporting] = useState(false);
  async function downloadImage() {
    if (!result || !posterRef.current) return;
    setExporting(true);
    try {
      const node = posterRef.current;
      // Ensure every <img> (including the user-uploaded data: URL) is fully
      // decoded before snapshotting; otherwise html-to-image will rasterize
      // before the bitmap is ready and produce a poster with the image
      // area missing.
      const imgs = Array.from(node.querySelectorAll("img"));
      await Promise.all(
        imgs.map((img) =>
          img.complete && img.naturalWidth > 0
            ? Promise.resolve()
            : img.decode().catch(
                () =>
                  new Promise<void>((resolve) => {
                    img.onload = () => resolve();
                    img.onerror = () => resolve();
                  }),
              ),
        ),
      );
      // Give the browser one more frame to commit layout after decode.
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: false,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${result.meta.studentName}-Day${result.meta.day}-观察报告.png`;
      a.click();
    } catch (err) {
      alert("导出图片失败：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(false);
    }
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
          <h2 className="mb-1 flex items-center justify-between text-lg font-semibold">
            填写基础信息
            <button
              type="button"
              onClick={() => setForm(EXAMPLE)}
              className="text-xs font-normal text-[oklch(0.5_0.15_30)] hover:underline"
            >
              填入示例
            </button>
          </h2>
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
              <div className="flex gap-2">
                <button
                  onClick={downloadImage}
                  disabled={exporting}
                  className="rounded-lg bg-[oklch(0.55_0.18_30)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[oklch(0.5_0.18_30)] disabled:opacity-60"
                >
                  {exporting ? "导出中…" : "📷 导出图片"}
                </button>
                <button
                  onClick={downloadHtml}
                  className="rounded-lg border border-[oklch(0.85_0.03_60)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[oklch(0.96_0.02_80)]"
                >
                  下载 HTML
                </button>
              </div>
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
  return k === "highlight" ? "今日高光" : k === "stuck" ? "今日卡点" : "给家长的建议";
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

  const enabledSections = SECTION_ORDER.filter((k) => template.sections[k].enabled);
  const imageInsertAt = Math.min(1, Math.max(0, enabledSections.length - 1)); // after first section

  const renderSection = (k: SectionKey) => {
    if (k === "highlight")
      return (
        <Block key="highlight" cfg={template.sections.highlight} title={report.highlight.title}>
          <p>{report.highlight.detail}</p>
        </Block>
      );
    if (k === "stuck")
      return (
        <Block key="stuck" cfg={template.sections.stuck} title={report.stuck.title}>
          <p>{report.stuck.detail}</p>
        </Block>
      );
    return (
      <Block key="improve" cfg={template.sections.improve} title={report.improve.title}>
        <ul className="ml-4 list-disc space-y-1.5 marker:text-[oklch(0.6_0.15_30)]">
          {report.improve.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </Block>
    );
  };

  const imageBlock = image ? (
    <figure
      key="image"
      className="overflow-hidden rounded-2xl border border-white/70 bg-[oklch(0.97_0.01_80)] p-2 shadow-[0_8px_24px_-12px_rgba(80,40,20,0.25)]"
    >
      <img
        src={image}
        alt="海报配图"
        className="block max-h-[360px] w-full rounded-xl object-contain"
      />
    </figure>
  ) : null;

  const sectionItems: React.ReactNode[] = enabledSections.map(renderSection);
  if (imageBlock) sectionItems.splice(imageInsertAt, 0, imageBlock);

  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-[28px] shadow-[0_30px_80px_-30px_rgba(120,60,30,0.45)]"
      style={{
        background: `linear-gradient(160deg, ${template.themeFrom} 0%, ${template.themeVia} 55%, ${template.themeTo} 100%)`,
        color: "oklch(0.2 0.03 60)",
      }}
    >
      {/* decorative blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-40 blur-3xl"
        style={{ background: "oklch(0.85 0.12 50)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full opacity-30 blur-3xl"
        style={{ background: "oklch(0.85 0.1 350)" }}
      />

      <div className="relative px-8 pt-8">
        <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.22em] text-[oklch(0.4_0.05_40)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[oklch(0.55_0.18_30)]" />
            AI for Good · Summer Camp
          </span>
          <span className="rounded-full bg-white/60 px-2.5 py-0.5 text-[10px] text-[oklch(0.35_0.1_30)]">
            Day {meta.day} / 7
          </span>
        </div>
        <h3 className="mt-5 text-[28px] font-bold leading-[1.15] tracking-tight text-[oklch(0.22_0.05_40)]">
          {meta.studentName} 的第 {meta.day} 天
        </h3>
        <p className="mt-2 text-sm text-[oklch(0.42_0.05_40)]">
          {meta.date}
          {meta.project ? ` · ${meta.project}` : ""}
          {template.showMentor && meta.mentor ? ` · 导师 ${meta.mentor}` : ""}
        </p>
        <div className="mt-5 h-px w-full bg-gradient-to-r from-transparent via-white/80 to-transparent" />
      </div>

      <div className="relative mt-5 space-y-3 px-8 pb-8">
        {sectionItems}

        {template.showEncouragement && (
          <div
            className="relative mt-5 rounded-2xl border border-white/70 bg-white/80 px-6 py-5 text-center text-[15px] italic backdrop-blur"
            style={{ color: "oklch(0.35 0.1 30)" }}
          >
            <span className="absolute left-3 top-1 select-none font-serif text-4xl leading-none text-[oklch(0.55_0.18_30)]/40">
              “
            </span>
            {report.encouragement}
            <span className="absolute bottom-0 right-3 select-none font-serif text-4xl leading-none text-[oklch(0.55_0.18_30)]/40">
              ”
            </span>
          </div>
        )}

        <div className="pt-4 text-center text-[10px] uppercase tracking-[0.2em] text-[oklch(0.45_0.05_40)]">
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
      className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-5 py-4 text-[14px] leading-relaxed backdrop-blur-sm shadow-[0_4px_16px_-8px_rgba(80,40,20,0.18)]"
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: tone.accent }}
      />
      <div
        className="mb-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{ background: tone.bg, color: tone.accent }}
      >
        {cfg.tag}
      </div>
      <div className="mb-1 text-[15px] font-semibold text-[oklch(0.22_0.04_60)]">{title}</div>
      <div className="text-[oklch(0.32_0.03_60)]">{children}</div>
    </div>
  );
}

function buildStandaloneHtml(data: ReportResult, t: PosterTemplate, image?: string | null) {
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
    return `<div class="block"><span class="bar" style="background:${tone.cssAccent}"></span><div class="tag" style="background:${tone.cssBg};color:${tone.cssAccent}">${esc(cfg.tag)}</div>${inner}</div>`;
  };

  const enabled = SECTION_ORDER.filter((k) => t.sections[k].enabled);
  const blocks = enabled.map(blockHtml);
  const imgHtml = image
    ? `<figure class="figure"><img src="${esc(image)}" alt=""/></figure>`
    : "";
  if (imgHtml) {
    const insertAt = Math.min(1, Math.max(0, blocks.length - 1));
    blocks.splice(insertAt, 0, imgHtml);
  }
  const sectionsHtml = blocks.join("");

  const gradient = `linear-gradient(160deg, ${oklchToCss(t.themeFrom)} 0%, ${oklchToCss(t.themeVia)} 55%, ${oklchToCss(t.themeTo)} 100%)`;

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<title>${esc(meta.studentName)} · Day ${esc(meta.day)} 观察报告</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f4ede2;padding:28px 16px;color:#2a221b}
  .card{position:relative;max-width:580px;margin:0 auto;border-radius:28px;overflow:hidden;box-shadow:0 30px 80px -30px rgba(120,60,30,.45);background:${gradient}}
  .blob{position:absolute;border-radius:9999px;filter:blur(60px);pointer-events:none}
  .blob.a{right:-60px;top:-60px;width:220px;height:220px;background:#f0b48a;opacity:.45}
  .blob.b{left:-40px;bottom:-80px;width:220px;height:220px;background:#e8b8d4;opacity:.35}
  .head{position:relative;padding:32px 32px 0}
  .kicker{display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#7a4a2a;font-weight:500}
  .kicker .dot{display:inline-flex;align-items:center;gap:6px}
  .kicker .dot::before{content:"";display:inline-block;width:6px;height:6px;border-radius:9999px;background:#c25535}
  .badge{background:rgba(255,255,255,.6);padding:3px 10px;border-radius:9999px;color:#8a3a1a}
  h1{font-size:28px;margin:18px 0 6px;letter-spacing:-.01em;color:#3a2418;line-height:1.15}
  .sub{font-size:13px;color:#7a4a2a;margin:0}
  .divider{margin-top:20px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.8),transparent)}
  .body{position:relative;padding:20px 32px 32px;display:flex;flex-direction:column;gap:12px}
  .block{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.8);background:rgba(255,255,255,.85);border-radius:16px;padding:16px 18px;box-shadow:0 4px 16px -8px rgba(80,40,20,.18)}
  .block .bar{position:absolute;left:0;top:0;width:4px;height:100%}
  .tag{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;padding:3px 9px;border-radius:9999px;margin-bottom:8px}
  .title{font-weight:600;margin-bottom:4px;font-size:15px;color:#2a1a10}
  .detail{color:#4a3a2a;font-size:14px;line-height:1.65}
  ul{margin:6px 0 0 18px;padding:0}
  ul li{margin:4px 0}
  .figure{margin:0;border:1px solid rgba(255,255,255,.8);background:#fbf5ec;border-radius:18px;padding:8px;box-shadow:0 8px 24px -12px rgba(80,40,20,.25)}
  .figure img{display:block;width:100%;max-height:380px;object-fit:contain;border-radius:12px}
  .quote{position:relative;margin-top:8px;background:rgba(255,255,255,.85);border:1px solid rgba(255,255,255,.7);border-radius:16px;padding:18px 28px;text-align:center;font-style:italic;color:#7a3a1a;font-size:15px}
  .quote::before,.quote::after{position:absolute;font-family:Georgia,serif;font-size:34px;color:rgba(194,85,53,.4);line-height:1}
  .quote::before{content:"\\201C";left:10px;top:6px}
  .quote::after{content:"\\201D";right:10px;bottom:0}
  .foot{text-align:center;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#7a4a2a;padding-top:12px}
</style></head><body>
<div class="card">
  <div class="blob a"></div><div class="blob b"></div>
  <div class="head">
    <div class="kicker"><span class="dot">AI for Good · Summer Camp</span><span class="badge">Day ${esc(meta.day)} / 7</span></div>
    <h1>${esc(meta.studentName)} 的第 ${esc(meta.day)} 天</h1>
    <p class="sub">${esc(meta.date)}${meta.project ? " · " + esc(meta.project) : ""}${t.showMentor && meta.mentor ? " · 导师 " + esc(meta.mentor) : ""}</p>
    <div class="divider"></div>
  </div>
  <div class="body">
    ${sectionsHtml}
    ${t.showEncouragement ? `<div class="quote">${esc(report.encouragement)}</div>` : ""}
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
