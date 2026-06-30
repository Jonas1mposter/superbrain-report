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
    const node = posterRef.current;
    // Force a phone-friendly poster width during capture so the exported
    // PNG looks good when shared to mobile (WeChat / 朋友圈), regardless of
    // how wide the on-screen preview happens to be.
    const EXPORT_WIDTH = 720;
    const prev = {
      width: node.style.width,
      maxWidth: node.style.maxWidth,
      minWidth: node.style.minWidth,
    };
    node.style.width = `${EXPORT_WIDTH}px`;
    node.style.maxWidth = `${EXPORT_WIDTH}px`;
    node.style.minWidth = `${EXPORT_WIDTH}px`;
    try {
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
      // Give the browser one more frame to commit layout after resize+decode.
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: false,
        width: EXPORT_WIDTH,
        height: node.scrollHeight,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${result.meta.studentName}-Day${result.meta.day}-观察报告.png`;
      a.click();
    } catch (err) {
      alert("导出图片失败：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      node.style.width = prev.width;
      node.style.maxWidth = prev.maxWidth;
      node.style.minWidth = prev.minWidth;
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

  return (
    <div
      ref={ref}
      className="relative overflow-hidden px-6 py-9 sm:px-11 sm:py-14"
      style={{
        background:
          "linear-gradient(180deg, #eaf2fb 0%, #f3f7fc 35%, #ffffff 100%)",
        color: "#0f1f3a",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif',
      }}
    >
      {/* top thin accent bar */}
      <div
        aria-hidden
        className="absolute left-0 right-0 top-0 h-[5px]"
        style={{ background: "linear-gradient(90deg,#3b82f6 0%,#93c5fd 60%,transparent 100%)" }}
      />
      {/* decorative soft square */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-5 top-8 h-24 w-24 rounded-[20px] sm:right-8 sm:top-10 sm:h-40 sm:w-40 sm:rounded-[28px]"
        style={{ background: "rgba(186,214,242,0.35)" }}
      />

      {/* header */}
      <div className="relative">
        <div className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.24em] text-[#3b82f6] sm:text-[13px] sm:tracking-[0.28em]">
          <span className="inline-block h-px w-6 bg-[#3b82f6] sm:w-8" />
          Observation Report
        </div>
        <h1
          className="mt-4 text-[30px] font-black leading-[1.15] tracking-tight text-[#0b1b35] sm:mt-5 sm:text-[48px] sm:leading-[1.1]"
          style={{ letterSpacing: "-0.01em" }}
        >
          AI for Good 冬令营
          <br />
          <span className="text-[#3b82f6]">学员观察报告</span>
        </h1>
        <div className="mt-4 inline-flex items-center rounded-full bg-[#3b82f6] px-4 py-1 text-[15px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(59,130,246,0.6)] sm:mt-5 sm:px-5 sm:py-1.5 sm:text-[17px]">
          Day {meta.day}
        </div>
      </div>

      {/* student card */}
      <div className="relative mt-7 rounded-2xl bg-white/70 px-5 py-5 backdrop-blur-sm ring-1 ring-[#dbe6f4] sm:mt-10 sm:px-7 sm:py-6">
        <div className="flex items-start justify-between gap-4 sm:gap-6">
          <div className="min-w-0">
            <div className="text-[12px] font-medium tracking-[0.32em] text-[#94a3b8] sm:text-[14px] sm:tracking-[0.4em]">学　员</div>
            <div className="mt-2 truncate text-[26px] font-bold text-[#0b1b35] sm:text-[34px]">{meta.studentName}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[12px] font-medium tracking-[0.32em] text-[#94a3b8] sm:text-[14px] sm:tracking-[0.4em]">今 日 状 态</div>
            <div className="mt-2 text-[15px] font-semibold text-[#3b82f6] sm:text-[17px]">
              ↑ 持续观察中
            </div>
          </div>
        </div>
      </div>

      {/* image (optional) */}
      {image && (
        <figure className="relative mt-5 overflow-hidden rounded-2xl ring-1 ring-[#dbe6f4] bg-white sm:mt-6">
          <img src={image} alt="" className="block max-h-[260px] w-full object-cover sm:max-h-[360px]" />
        </figure>
      )}

      {/* sections */}
      <div className="relative mt-5 space-y-4 sm:mt-6 sm:space-y-5">
        {template.sections.highlight.enabled && (
          <SectionCard tag={template.sections.highlight.tag} en="HIGHLIGHTS">
            <p className="whitespace-pre-line">{report.highlight.detail}</p>
          </SectionCard>
        )}
        {template.sections.stuck.enabled && (
          <SectionCard tag={template.sections.stuck.tag} en="REFLECTION">
            <p className="whitespace-pre-line">{report.stuck.detail}</p>
          </SectionCard>
        )}
        {template.sections.improve.enabled && (
          <SectionCard tag={template.sections.improve.tag} en="FOR PARENTS">
            <ul className="ml-4 list-disc space-y-1.5 marker:text-[#3b82f6]">
              {report.improve.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>

      {/* core trait / encouragement dark card */}
      {template.showEncouragement && (
        <div className="relative mt-6 rounded-2xl bg-[#1f2a3d] px-6 py-6 text-center sm:mt-7 sm:px-8 sm:py-7">
          <div className="text-[13px] font-semibold tracking-[0.28em] text-[#7eb6ff] sm:text-[14px] sm:tracking-[0.32em]">
            核心特质 / TRAIT
          </div>
          <div className="mt-3 text-[17px] italic leading-relaxed text-white sm:text-[20px]">
            "{report.encouragement}"
          </div>
        </div>
      )}

      {/* coach line */}
      <div className="relative mt-7 text-center sm:mt-9">
        <div className="text-[13px] font-semibold tracking-[0.28em] text-[#3b82f6] sm:text-[14px] sm:tracking-[0.32em]">
          教练反馈
        </div>
        <div className="mt-2 text-[17px] font-bold text-[#0b1b35] sm:text-[20px]">
          "{report.highlight.title}"
        </div>
      </div>

      {/* footer meta */}
      <div className="relative mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[#64748b] sm:mt-10 sm:gap-8 sm:text-[15px]">
        {template.showMentor && meta.mentor && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full ring-1 ring-[#64748b]" />
            观察教练：{meta.mentor}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-[3px] ring-1 ring-[#64748b]" />
          {formatDateCn(meta.date)}
        </span>
      </div>

      {template.footer && (
        <div className="relative mt-5 text-center text-[12px] uppercase tracking-[0.22em] text-[#94a3b8] sm:mt-6 sm:tracking-[0.24em]">
          {template.footer}
        </div>
      )}
    </div>
  );
});

function formatDateCn(d: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

function SectionCard({
  tag,
  en,
  children,
}: {
  tag: string;
  en: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-[#e4ecf6] shadow-[0_2px_10px_-4px_rgba(59,130,246,0.08)] sm:px-6 sm:py-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#eaf2fb] text-[#3b82f6]"
        >
          <span className="inline-block h-2 w-2 rounded-sm bg-[#3b82f6]" />
        </span>
        <span className="text-[13px] font-semibold text-[#3b82f6] sm:text-[14px]">
          {tag} <span className="text-[#94a3b8] font-medium">/ {en}</span>
        </span>
      </div>
      <div className="text-[14px] leading-[1.75] text-[#334155] sm:text-[15px]">{children}</div>
    </div>
  );
}

function buildStandaloneHtml(data: ReportResult, t: PosterTemplate, image?: string | null) {
  const { report, meta } = data;
  const steps = report.improve.steps.map((s) => `<li>${esc(s)}</li>`).join("");

  const section = (tag: string, en: string, inner: string, enabled: boolean) =>
    enabled
      ? `<div class="card"><div class="cardhead"><span class="ico"></span><span class="tag">${esc(tag)} <em>/ ${en}</em></span></div><div class="cardbody">${inner}</div></div>`
      : "";

  const imgHtml = image
    ? `<figure class="figure"><img src="${esc(image)}" alt=""/></figure>`
    : "";

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<title>${esc(meta.studentName)} · Day ${esc(meta.day)} 观察报告</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif;background:#eef3fa;padding:24px 12px;color:#0f1f3a}
  .card-root{position:relative;max-width:640px;margin:0 auto;background:linear-gradient(180deg,#eaf2fb 0%,#f3f7fc 35%,#ffffff 100%);padding:48px 36px 40px;overflow:hidden;border-radius:4px}
  .topbar{position:absolute;left:0;right:0;top:0;height:5px;background:linear-gradient(90deg,#3b82f6 0%,#93c5fd 60%,transparent 100%)}
  .deco{position:absolute;right:24px;top:36px;width:140px;height:140px;border-radius:24px;background:rgba(186,214,242,.35)}
  .kicker{position:relative;font-size:11px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:#3b82f6;display:flex;align-items:center;gap:10px}
  .kicker::before{content:"";display:inline-block;width:30px;height:1px;background:#3b82f6}
  h1{position:relative;font-size:34px;font-weight:900;margin:18px 0 18px;letter-spacing:-.01em;line-height:1.1;color:#0b1b35}
  h1 .blue{color:#3b82f6}
  .day{position:relative;display:inline-block;background:#3b82f6;color:#fff;border-radius:9999px;padding:6px 18px;font-size:14px;font-weight:600;box-shadow:0 6px 16px -6px rgba(59,130,246,.6)}
  .student{position:relative;margin-top:32px;background:rgba(255,255,255,.7);border:1px solid #dbe6f4;border-radius:18px;padding:22px 26px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
  .student .lbl{font-size:11px;letter-spacing:.4em;color:#94a3b8;font-weight:500}
  .student .name{font-size:28px;font-weight:700;margin-top:8px;color:#0b1b35}
  .student .state{font-size:14px;font-weight:600;color:#3b82f6;margin-top:8px}
  .figure{position:relative;margin:20px 0 0;border:1px solid #dbe6f4;background:#fff;border-radius:18px;overflow:hidden}
  .figure img{display:block;width:100%;max-height:360px;object-fit:cover}
  .sections{position:relative;margin-top:22px;display:flex;flex-direction:column;gap:18px}
  .card{background:#fff;border:1px solid #e4ecf6;border-radius:18px;padding:20px 22px;box-shadow:0 2px 10px -4px rgba(59,130,246,.08)}
  .cardhead{display:flex;align-items:center;gap:10px;margin-bottom:10px}
  .ico{display:inline-block;width:24px;height:24px;border-radius:7px;background:#eaf2fb;position:relative}
  .ico::after{content:"";position:absolute;left:8px;top:8px;width:8px;height:8px;border-radius:2px;background:#3b82f6}
  .tag{font-size:14px;font-weight:600;color:#3b82f6}
  .tag em{font-style:normal;color:#94a3b8;font-weight:500}
  .cardbody{font-size:14px;line-height:1.75;color:#334155}
  .cardbody ul{margin:0;padding-left:18px}
  .cardbody ul li{margin:4px 0}
  .trait{position:relative;margin-top:24px;background:#1f2a3d;border-radius:18px;padding:24px 28px;text-align:center}
  .trait .l{font-size:12px;font-weight:600;letter-spacing:.32em;color:#7eb6ff}
  .trait .q{margin-top:10px;font-size:16px;font-style:italic;color:#fff;line-height:1.6}
  .coach{position:relative;margin-top:32px;text-align:center}
  .coach .l{font-size:12px;font-weight:600;letter-spacing:.32em;color:#3b82f6}
  .coach .q{margin-top:6px;font-size:16px;font-weight:700;color:#0b1b35}
  .meta{position:relative;margin-top:32px;display:flex;justify-content:center;gap:32px;font-size:13px;color:#64748b}
  .foot{position:relative;margin-top:20px;text-align:center;font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#94a3b8}
  @media (max-width:520px){
    body{padding:14px 8px}
    .card-root{padding:32px 20px 28px;border-radius:14px}
    .deco{width:90px;height:90px;right:14px;top:24px;border-radius:18px}
    h1{font-size:24px;margin:14px 0 14px}
    .day{font-size:13px;padding:5px 14px}
    .student{margin-top:22px;padding:16px 18px;border-radius:14px;gap:14px}
    .student .name{font-size:21px;margin-top:6px}
    .student .lbl{font-size:10px;letter-spacing:.28em}
    .student .state{font-size:13px;margin-top:6px}
    .figure{border-radius:14px}
    .figure img{max-height:240px}
    .sections{margin-top:18px;gap:14px}
    .card{padding:16px 18px;border-radius:14px}
    .cardbody{font-size:14px}
    .trait{padding:20px 18px;border-radius:14px}
    .trait .q{font-size:15px}
    .coach .q{font-size:15px}
    .meta{gap:18px;flex-wrap:wrap;font-size:12px;margin-top:24px}
  }
</style></head><body>
<div class="card-root">
  <div class="topbar"></div>
  <div class="deco"></div>
  <div class="kicker">Observation Report</div>
  <h1>AI for Good 冬令营<br/><span class="blue">学员观察报告</span></h1>
  <div class="day">Day ${esc(meta.day)}</div>
  <div class="student">
    <div><div class="lbl">学　员</div><div class="name">${esc(meta.studentName)}</div></div>
    <div style="text-align:right"><div class="lbl">今 日 状 态</div><div class="state">↑ 持续观察中</div></div>
  </div>
  ${imgHtml}
  <div class="sections">
    ${section(t.sections.highlight.tag, "HIGHLIGHTS", `<p>${esc(report.highlight.detail)}</p>`, t.sections.highlight.enabled)}
    ${section(t.sections.stuck.tag, "REFLECTION", `<p>${esc(report.stuck.detail)}</p>`, t.sections.stuck.enabled)}
    ${section(t.sections.improve.tag, "FOR PARENTS", `<ul>${steps}</ul>`, t.sections.improve.enabled)}
  </div>
  ${t.showEncouragement ? `<div class="trait"><div class="l">核心特质 / TRAIT</div><div class="q">"${esc(report.encouragement)}"</div></div>` : ""}
  <div class="coach"><div class="l">教练反馈</div><div class="q">"${esc(report.highlight.title)}"</div></div>
  <div class="meta">
    ${t.showMentor && meta.mentor ? `<span>观察教练：${esc(meta.mentor)}</span>` : ""}
    <span>${esc(formatDateCnPlain(meta.date))}</span>
  </div>
  ${t.footer ? `<div class="foot">${esc(t.footer)}</div>` : ""}
</div>
</body></html>`;
}

function formatDateCnPlain(d: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

function esc(s: string) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
