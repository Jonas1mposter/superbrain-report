import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { forwardRef, useEffect, useRef, useState } from "react";
import {
  generateReport,
  generateBatchReports,
  MODEL_OPTIONS,
  type DailyReport,
  type ModelId,
} from "@/lib/report.functions";
import {
  DEFAULT_TEMPLATE,
  PRESETS,
  REPORT_STYLE_OPTIONS,
  SECTION_EN,
  deleteTemplateFor,
  loadStoredTemplates,
  saveTemplateFor,
  templateForStyle,
  type PosterTemplate,
  type ReportStyle,
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
          "为 AI for Good 7天夏令营导师设计的每日观察报告生成器，支持一段流水账批量拆分多学员，输出事实/观点/后续观察三段式报告海报。",
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

const SECTION_ORDER: SectionKey[] = ["facts", "thoughts", "plans"];

const EXAMPLE = {
  studentName: "林小满",
  day: "3",
  date: "2026-07-15",
  project: "用 AI 帮助听障儿童学习语言",
  mentor: "陈老师",
  observations: `上午的 AI 伦理工作坊里，小满主动举手分享了昨天在社区调研中遇到的真实故事：一位听障儿童的家长说，现有的语音学习 App 语速太快，孩子跟不上。小满立刻在小组讨论中提出"可以让 AI 把句子拆成更慢的小片段"，并画了一个三页纸的流程草图。\n\n午饭前她用 Kimi 辅助生成了一个"慢语速语音切片"的原型说明，但中途卡在选择工具上——她试了两种 TTS 工具都不满意，情绪有点低落，甚至说"是不是我的想法太简单了"。经过导师和同学提醒，她发现不是想法简单，而是还没找到适合儿童语速的参数。\n\n下午她和队友一起把流程图改成可点击的低保真原型，并决定明天先去采访 1 位小朋友验证这个方向。`,
  model: "kimi" as ModelId,
};

const BATCH_EXAMPLE = {
  day: "3",
  date: "2026-07-15",
  project: "用 AI 帮助听障儿童学习语言",
  mentor: "陈老师",
  studentHints: "林小满、陈子墨、王一诺",
  narrative: `9:30 早会时小满主动分享了昨天调研遇到的听障儿童妈妈的故事，还画了三页流程草图；子墨在一旁一直没说话，被点名后才小声说了一句"我还没想清楚"。
10:20 小组讨论开始，一诺很快组织大家分工，把白板分成三块让每个人认领任务；小满认领了"慢语速切片"方向。
11:00 子墨试了两次 TTS 工具都不满意，说"是不是我想的太简单了"，情绪低落地趴在桌上；一诺过去拍了拍他的肩膀，还把自己的笔记本让给他看。
13:30 午饭后，小满和队友做低保真原型；一诺主动跑去问导师采访问卷的模板；子墨自己安静地重写了昨晚的方案，改完后主动举手给全组念了一遍，大家鼓掌。
15:00 下午分享环节，小满决定明天去访谈 1 位小朋友；一诺主动申请当明天的主持人。`,
  model: "kimi" as ModelId,
};

type Mode = "single" | "batch";

function Index() {
  const runSingle = useServerFn(generateReport);
  const runBatch = useServerFn(generateBatchReports);

  const [mode, setMode] = useState<Mode>("single");
  const [reportStyle, setReportStyle] = useState<ReportStyle>("observation");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [batchResults, setBatchResults] = useState<ReportResult[] | null>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const batchPosterRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [form, setForm] = useState({
    studentName: "",
    day: "1",
    date: new Date().toISOString().slice(0, 10),
    project: "",
    mentor: "",
    observations: "",
    model: "kimi" as ModelId,
  });

  const [batchForm, setBatchForm] = useState({
    day: "1",
    date: new Date().toISOString().slice(0, 10),
    project: "",
    mentor: "",
    studentHints: "",
    narrative: "",
    model: "kimi" as ModelId,
  });

  const [template, setTemplate] = useState<PosterTemplate>(DEFAULT_TEMPLATE);
  const [showEditor, setShowEditor] = useState(false);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  function updateResultReport(next: DailyReport) {
    setResult((r) => (r ? { ...r, report: next } : r));
  }
  function updateResultMeta(patch: Partial<ReportResult["meta"]>) {
    setResult((r) => (r ? { ...r, meta: { ...r.meta, ...patch } } : r));
  }
  function updateBatchReport(i: number, next: DailyReport) {
    setBatchResults((list) => {
      if (!list) return list;
      const copy = [...list];
      copy[i] = { ...copy[i], report: next };
      return copy;
    });
  }
  function updateBatchMeta(i: number, patch: Partial<ReportResult["meta"]>) {
    setBatchResults((list) => {
      if (!list) return list;
      const copy = [...list];
      copy[i] = { ...copy[i], meta: { ...copy[i].meta, ...patch } };
      return copy;
    });
  }

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

  useEffect(() => {
    if (!form.studentName) return;
    const all = loadStoredTemplates();
    if (all[form.studentName]) setTemplate(all[form.studentName]);
  }, [form.studentName]);

  function switchReportStyle(next: ReportStyle) {
    if (next === reportStyle) return;
    setReportStyle(next);
    // Swap poster template to the matching preset so tags/labels align with the style.
    setTemplate(templateForStyle(next));
    // Clear old results so users don't see a mismatch between style and rendered content.
    setResult(null);
    setBatchResults(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = (await runSingle({ data: { ...form, reportStyle } })) as ReportResult;
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function onBatchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setBatchResults(null);
    try {
      const hints = batchForm.studentHints
        .split(/[,，、\n\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const r = (await runBatch({
        data: {
          day: batchForm.day,
          date: batchForm.date,
          project: batchForm.project,
          mentor: batchForm.mentor,
          narrative: batchForm.narrative,
          model: batchForm.model,
          studentHints: hints,
          reportStyle,
        },
      })) as { results: ReportResult[] };
      setBatchResults(r.results);
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

  async function exportPosterNode(node: HTMLDivElement, filename: string) {
    const EXPORT_WIDTH = 720;
    const prev = {
      width: node.style.width,
      maxWidth: node.style.maxWidth,
      minWidth: node.style.minWidth,
    };
    node.style.width = `${EXPORT_WIDTH}px`;
    node.style.maxWidth = `${EXPORT_WIDTH}px`;
    node.style.minWidth = `${EXPORT_WIDTH}px`;
    const wasEditing = editing;
    if (wasEditing) setEditing(false);
    // Give React a frame to strip contentEditable outlines before capture.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
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
      a.download = filename;
      a.click();
    } finally {
      node.style.width = prev.width;
      node.style.maxWidth = prev.maxWidth;
      node.style.minWidth = prev.minWidth;
    }
  }

  async function downloadImage() {
    if (!result || !posterRef.current) return;
    setExporting(true);
    try {
      await exportPosterNode(
        posterRef.current,
        `${result.meta.studentName}-Day${result.meta.day}-观察报告.png`,
      );
    } catch (err) {
      alert("导出图片失败：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(false);
    }
  }

  async function downloadAllBatch() {
    if (!batchResults) return;
    setExporting(true);
    try {
      for (let i = 0; i < batchResults.length; i++) {
        const node = batchPosterRefs.current[i];
        if (!node) continue;
        await exportPosterNode(
          node,
          `${batchResults[i].meta.studentName}-Day${batchResults[i].meta.day}-观察报告.png`,
        );
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (err) {
      alert("批量导出失败：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(false);
    }
  }

  async function downloadOneBatch(i: number) {
    if (!batchResults) return;
    const node = batchPosterRefs.current[i];
    if (!node) return;
    setExporting(true);
    try {
      await exportPosterNode(
        node,
        `${batchResults[i].meta.studentName}-Day${batchResults[i].meta.day}-观察报告.png`,
      );
    } catch (err) {
      alert("导出失败：" + (err instanceof Error ? err.message : String(err)));
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
        {/* mode tabs */}
        <div className="mx-auto max-w-6xl px-6 pb-3">
          <div className="inline-flex rounded-lg border border-[oklch(0.9_0.02_80)] bg-white p-1 text-xs">
            <button
              onClick={() => setMode("single")}
              className={`rounded-md px-3 py-1.5 transition ${
                mode === "single"
                  ? "bg-[oklch(0.55_0.18_30)] text-white"
                  : "text-[oklch(0.4_0.02_60)] hover:bg-[oklch(0.96_0.02_80)]"
              }`}
            >
              单人模式
            </button>
            <button
              onClick={() => setMode("batch")}
              className={`rounded-md px-3 py-1.5 transition ${
                mode === "batch"
                  ? "bg-[oklch(0.55_0.18_30)] text-white"
                  : "text-[oklch(0.4_0.02_60)] hover:bg-[oklch(0.96_0.02_80)]"
              }`}
            >
              批量模式 · 一段流水账
            </button>
          </div>
          <div className="ml-3 inline-flex rounded-lg border border-[oklch(0.9_0.02_80)] bg-white p-1 text-xs align-middle">
            {REPORT_STYLE_OPTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => switchReportStyle(s.id)}
                title={s.desc}
                className={`rounded-md px-3 py-1.5 transition ${
                  reportStyle === s.id
                    ? "bg-[oklch(0.35_0.05_260)] text-white"
                    : "text-[oklch(0.4_0.02_60)] hover:bg-[oklch(0.96_0.02_80)]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className="ml-3 text-xs text-[oklch(0.5_0.02_60)]">
            {mode === "single"
              ? "为单个学员生成一份报告"
              : "写下今天的流水账，AI 自动按学员拆分并逐个生成"}
            {" · "}
            {REPORT_STYLE_OPTIONS.find((s) => s.id === reportStyle)?.desc}
          </span>
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
                <div>
                  <div className="mb-1.5 text-xs font-medium text-[oklch(0.4_0.02_60)]">主题配色</div>
                  <div className="grid grid-cols-3 gap-2">
                    <ColorField
                      label="主色"
                      value={template.themeAccent || "#3b82f6"}
                      onChange={(v) => setTemplate({ ...template, themeAccent: v })}
                    />
                    <ColorField
                      label="背景"
                      value={template.themeBgTop || "#eaf2fb"}
                      onChange={(v) => setTemplate({ ...template, themeBgTop: v })}
                    />
                    <ColorField
                      label="金句底"
                      value={template.themeTraitBg || "#1f2a3d"}
                      onChange={(v) => setTemplate({ ...template, themeTraitBg: v })}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-[11px] text-[oklch(0.5_0.02_60)]">快选：</span>
                    {ACCENT_SWATCHES.map((sw) => (
                      <button
                        key={sw.accent}
                        type="button"
                        title={sw.name}
                        onClick={() =>
                          setTemplate({
                            ...template,
                            themeAccent: sw.accent,
                            themeBgTop: sw.bg,
                            themeTraitBg: sw.trait,
                          })
                        }
                        className="h-5 w-5 rounded-full ring-1 ring-black/10 transition hover:scale-110"
                        style={{ background: sw.accent }}
                      />
                    ))}
                  </div>
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
        {mode === "single" ? (
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
              写下你今天对学员的真实观察，AI 会输出「事实 / 观点 / 后续观察」三段式报告。
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
              <Field label="生成模型">
                <div className="flex gap-2">
                  {MODEL_OPTIONS.map((m) => (
                    <label
                      key={m.id}
                      className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                        form.model === m.id
                          ? "border-[oklch(0.55_0.18_30)] bg-[oklch(0.97_0.03_30)] font-medium text-[oklch(0.45_0.18_30)]"
                          : "border-[oklch(0.9_0.02_80)] bg-white text-[oklch(0.4_0.02_60)] hover:bg-[oklch(0.98_0.01_80)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="model"
                        value={m.id}
                        checked={form.model === m.id}
                        onChange={() => setForm({ ...form, model: m.id })}
                        className="sr-only"
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
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
                {loading
                  ? `${MODEL_OPTIONS.find((m) => m.id === form.model)?.label ?? "AI"} 正在生成…`
                  : "生成今日观察报告"}
              </button>
            </form>
          </section>
        ) : (
          <section className="rounded-2xl border border-[oklch(0.9_0.02_80)] bg-white p-6 shadow-sm">
            <h2 className="mb-1 flex items-center justify-between text-lg font-semibold">
              一段流水账，多人生成
              <button
                type="button"
                onClick={() => setBatchForm(BATCH_EXAMPLE)}
                className="text-xs font-normal text-[oklch(0.5_0.15_30)] hover:underline"
              >
                填入示例
              </button>
            </h2>
            <p className="mb-5 text-sm text-[oklch(0.5_0.02_60)]">
              按时间顺序写完你的观察流水账，AI 会自动识别每个学员的片段，逐份生成「事实 / 观点 / 后续观察」报告。
            </p>
            <form onSubmit={onBatchSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="第几天 (1-7)">
                  <input
                    required
                    type="number"
                    min={1}
                    max={7}
                    value={batchForm.day}
                    onChange={(e) => setBatchForm({ ...batchForm, day: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="日期">
                  <input
                    required
                    type="date"
                    value={batchForm.date}
                    onChange={(e) => setBatchForm({ ...batchForm, date: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="项目方向">
                  <input
                    value={batchForm.project}
                    onChange={(e) => setBatchForm({ ...batchForm, project: e.target.value })}
                    className="input"
                    placeholder="选填"
                  />
                </Field>
                <Field label="带教导师">
                  <input
                    value={batchForm.mentor}
                    onChange={(e) => setBatchForm({ ...batchForm, mentor: e.target.value })}
                    className="input"
                    placeholder="选填"
                  />
                </Field>
              </div>
              <Field label="学员名单（选填，可用逗号/顿号/换行分隔）">
                <input
                  value={batchForm.studentHints}
                  onChange={(e) => setBatchForm({ ...batchForm, studentHints: e.target.value })}
                  className="input"
                  placeholder="例：林小满、陈子墨、王一诺（留空则由 AI 自行识别）"
                />
              </Field>
              <Field label="今日流水账观察">
                <textarea
                  required
                  rows={14}
                  value={batchForm.narrative}
                  onChange={(e) => setBatchForm({ ...batchForm, narrative: e.target.value })}
                  className="input resize-y"
                  placeholder={
                    "按时间顺序写就好，比如：\n9:30 早会时小满主动分享了……\n10:20 小组讨论一诺组织分工……\n11:00 子墨试了两次工具都不满意……"
                  }
                />
              </Field>
              <Field label="生成模型">
                <div className="flex gap-2">
                  {MODEL_OPTIONS.map((m) => (
                    <label
                      key={m.id}
                      className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                        batchForm.model === m.id
                          ? "border-[oklch(0.55_0.18_30)] bg-[oklch(0.97_0.03_30)] font-medium text-[oklch(0.45_0.18_30)]"
                          : "border-[oklch(0.9_0.02_80)] bg-white text-[oklch(0.4_0.02_60)] hover:bg-[oklch(0.98_0.01_80)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="batch-model"
                        value={m.id}
                        checked={batchForm.model === m.id}
                        onChange={() => setBatchForm({ ...batchForm, model: m.id })}
                        className="sr-only"
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
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
                {loading
                  ? `${MODEL_OPTIONS.find((m) => m.id === batchForm.model)?.label ?? "AI"} 正在拆分并生成…`
                  : "拆分流水账并批量生成"}
              </button>
            </form>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {mode === "single" ? "海报预览" : `海报预览${batchResults ? `（${batchResults.length} 位学员）` : ""}`}
            </h2>
            {mode === "single" && result && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setEditing((v) => !v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    editing
                      ? "bg-[oklch(0.55_0.18_30)] text-white"
                      : "border border-[oklch(0.85_0.03_60)] bg-white hover:bg-[oklch(0.96_0.02_80)]"
                  }`}
                  title="点击海报里的文字直接改，改完点空白处保存"
                >
                  {editing ? "✅ 完成编辑" : "✏️ 编辑文字"}
                </button>
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
            {mode === "batch" && batchResults && batchResults.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setEditing((v) => !v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    editing
                      ? "bg-[oklch(0.55_0.18_30)] text-white"
                      : "border border-[oklch(0.85_0.03_60)] bg-white hover:bg-[oklch(0.96_0.02_80)]"
                  }`}
                >
                  {editing ? "✅ 完成编辑" : "✏️ 编辑文字"}
                </button>
                <button
                  onClick={downloadAllBatch}
                  disabled={exporting}
                  className="rounded-lg bg-[oklch(0.55_0.18_30)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[oklch(0.5_0.18_30)] disabled:opacity-60"
                >
                  {exporting ? "导出中…" : "📷 批量导出图片"}
                </button>
              </div>
            )}
          </div>

          {mode === "single" ? (
            result ? (
              <Poster
                ref={posterRef}
                data={result}
                template={template}
                image={image}
                editable={editing}
                onReportChange={updateResultReport}
                onMetaChange={updateResultMeta}
              />
            ) : (
              <div className="flex h-[520px] items-center justify-center rounded-2xl border border-dashed border-[oklch(0.85_0.03_60)] bg-white/60 text-sm text-[oklch(0.55_0.02_60)]">
                填写左侧表单，生成的海报会出现在这里
              </div>
            )
          ) : batchResults && batchResults.length > 0 ? (
            <div className="space-y-6">
              {batchResults.map((r, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-medium text-[oklch(0.45_0.02_60)]">
                      #{i + 1} · {r.meta.studentName}
                    </span>
                    <button
                      onClick={() => downloadOneBatch(i)}
                      disabled={exporting}
                      className="rounded-md border border-[oklch(0.85_0.03_60)] bg-white px-2 py-0.5 text-[11px] hover:bg-[oklch(0.96_0.02_80)] disabled:opacity-60"
                    >
                      导出这份
                    </button>
                  </div>
                  <Poster
                    ref={(el) => {
                      batchPosterRefs.current[i] = el;
                    }}
                    data={r}
                    template={template}
                    image={null}
                    editable={editing}
                    onReportChange={(next) => updateBatchReport(i, next)}
                    onMetaChange={(patch) => updateBatchMeta(i, patch)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-[520px] items-center justify-center rounded-2xl border border-dashed border-[oklch(0.85_0.03_60)] bg-white/60 text-sm text-[oklch(0.55_0.02_60)]">
              写下一段流水账，AI 会为每位被观察到的学员各生成一份报告
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
  return k === "facts" ? "事实 · 我看到" : k === "thoughts" ? "观点 · 我想到" : "后续观察 · 我计划";
}

function sectionEn(k: SectionKey) {
  return k === "facts" ? "FACTS" : k === "thoughts" ? "THOUGHTS" : "PLANS";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[oklch(0.4_0.02_60)]">{label}</span>
      {children}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[oklch(0.4_0.02_60)]">{label}</span>
      <div className="flex items-center gap-1.5 rounded-[10px] border border-[oklch(0.9_0.02_80)] bg-white px-1.5 py-1">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-xs outline-none"
          spellCheck={false}
        />
      </div>
    </label>
  );
}

const ACCENT_SWATCHES: { name: string; accent: string; bg: string; trait: string }[] = [
  { name: "海蓝", accent: "#3b82f6", bg: "#eaf2fb", trait: "#1f2a3d" },
  { name: "暖橙", accent: "#e07a3c", bg: "#fdf1e6", trait: "#3a2417" },
  { name: "薄荷", accent: "#14b8a6", bg: "#e6f7f4", trait: "#123c37" },
  { name: "樱粉", accent: "#e75480", bg: "#fce7ef", trait: "#3a1a26" },
  { name: "紫罗", accent: "#8b5cf6", bg: "#f0eaff", trait: "#2a1f4a" },
  { name: "琥珀", accent: "#d97706", bg: "#fef3c7", trait: "#3d2a10" },
  { name: "松绿", accent: "#16a34a", bg: "#e6f5eb", trait: "#153a24" },
  { name: "石墨", accent: "#475569", bg: "#eef1f5", trait: "#1e293b" },
];

type PosterProps = {
  data: ReportResult;
  template: PosterTemplate;
  image?: string | null;
  editable?: boolean;
  onReportChange?: (next: DailyReport) => void;
  onMetaChange?: (patch: Partial<ReportResult["meta"]>) => void;
};

const Poster = forwardRef<HTMLDivElement, PosterProps>(function Poster(
  { data, template, image, editable = false, onReportChange, onMetaChange },
  ref,
) {
  const { report, meta } = data;
  const en = SECTION_EN[template.reportStyle ?? "observation"];
  const accent = template.themeAccent || "#3b82f6";
  const bgTop = template.themeBgTop || "#eaf2fb";
  const traitBg = template.themeTraitBg || "#1f2a3d";
  const kicker = template.reportStyle === "highlight" ? "Highlight Report" : "Observation Report";
  const title = template.reportStyle === "highlight" ? "今日高光反馈" : "学员观察报告";

  const updatePoint = (key: "facts" | "thoughts", i: number, v: string) => {
    if (!onReportChange) return;
    const arr = [...report[key].points];
    arr[i] = v;
    onReportChange({ ...report, [key]: { ...report[key], points: arr } });
  };
  const updateStep = (i: number, v: string) => {
    if (!onReportChange) return;
    const arr = [...report.plans.steps];
    arr[i] = v;
    onReportChange({ ...report, plans: { ...report.plans, steps: arr } });
  };

  return (
    <div
      ref={ref}
      className="relative overflow-hidden px-6 py-9 sm:px-11 sm:py-14"
      style={{
        background: `linear-gradient(180deg, ${bgTop} 0%, color-mix(in oklab, ${bgTop} 45%, #ffffff) 35%, #ffffff 100%)`,
        color: "#0f1f3a",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif',
      }}
    >
      <div
        aria-hidden
        className="absolute left-0 right-0 top-0 h-[5px]"
        style={{
          background: `linear-gradient(90deg, ${accent} 0%, color-mix(in oklab, ${accent} 55%, #ffffff) 60%, transparent 100%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-5 top-8 h-24 w-24 rounded-[20px] sm:right-8 sm:top-10 sm:h-40 sm:w-40 sm:rounded-[28px]"
        style={{ background: `color-mix(in oklab, ${accent} 25%, transparent)` }}
      />

      <div className="relative">
        <div
          className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.24em] sm:text-[13px] sm:tracking-[0.28em]"
          style={{ color: accent }}
        >
          <span className="inline-block h-px w-6 sm:w-8" style={{ background: accent }} />
          {kicker}
        </div>
        <h1
          className="mt-4 text-[30px] font-black leading-[1.15] tracking-tight text-[#0b1b35] sm:mt-5 sm:text-[48px] sm:leading-[1.1]"
          style={{ letterSpacing: "-0.01em" }}
        >
          AI for Good 夏令营
          <br />
          <span style={{ color: accent }}>{title}</span>
        </h1>
        <div
          className="mt-4 inline-flex items-center rounded-full px-4 py-1 text-[15px] font-semibold text-white sm:mt-5 sm:px-5 sm:py-1.5 sm:text-[17px]"
          style={{
            background: accent,
            boxShadow: `0 6px 16px -6px color-mix(in oklab, ${accent} 60%, transparent)`,
          }}
        >
          Day {meta.day}
        </div>
      </div>

      <div
        className="relative mt-7 rounded-2xl bg-white/70 px-5 py-5 backdrop-blur-sm ring-1 sm:mt-10 sm:px-7 sm:py-6"
        style={{ ["--tw-ring-color" as string]: `color-mix(in oklab, ${accent} 22%, #ffffff)` }}
      >
        <div className="flex items-start justify-between gap-4 sm:gap-6">
          <div className="min-w-0">
            <div className="text-[12px] font-medium tracking-[0.32em] text-[#94a3b8] sm:text-[14px] sm:tracking-[0.4em]">学　员</div>
            <div className="mt-2 truncate text-[26px] font-bold text-[#0b1b35] sm:text-[34px]">
              <Editable
                editable={editable}
                value={meta.studentName}
                onChange={(v) => onMetaChange?.({ studentName: v })}
              />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[12px] font-medium tracking-[0.32em] text-[#94a3b8] sm:text-[14px] sm:tracking-[0.4em]">今 日 状 态</div>
            <div className="mt-2 text-[15px] font-semibold sm:text-[17px]" style={{ color: accent }}>
              ↑ 持续观察中
            </div>
          </div>
        </div>
      </div>

      {image && (
        <figure
          className="relative mt-5 overflow-hidden rounded-2xl ring-1 bg-white sm:mt-6"
          style={{ ["--tw-ring-color" as string]: `color-mix(in oklab, ${accent} 22%, #ffffff)` }}
        >
          <img src={image} alt="" className="block max-h-[260px] w-full object-cover sm:max-h-[360px]" />
        </figure>
      )}

      <div className="relative mt-5 space-y-4 sm:mt-6 sm:space-y-5">
        {template.sections.facts.enabled && (
          <SectionCard tag={template.sections.facts.tag} en={en.facts} accent={accent}>
            <ul className="ml-4 list-disc space-y-1.5" style={{ ["--tw-prose-bullets" as string]: accent }}>
              {report.facts.points.map((p, i) => (
                <li key={`f-${i}`} style={{ ["::marker" as string]: accent } as React.CSSProperties}>
                  <Editable editable={editable} value={p} onChange={(v) => updatePoint("facts", i, v)} />
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
        {template.sections.thoughts.enabled && (
          <SectionCard tag={template.sections.thoughts.tag} en={en.thoughts} accent={accent}>
            <ul className="ml-4 list-disc space-y-1.5">
              {report.thoughts.points.map((p, i) => (
                <li key={`t-${i}`}>
                  <Editable editable={editable} value={p} onChange={(v) => updatePoint("thoughts", i, v)} />
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
        {template.sections.plans.enabled && (
          <SectionCard tag={template.sections.plans.tag} en={en.plans} accent={accent}>
            <ul className="ml-4 list-disc space-y-1.5">
              {report.plans.steps.map((s, i) => (
                <li key={`p-${i}`}>
                  <Editable editable={editable} value={s} onChange={(v) => updateStep(i, v)} />
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>

      {template.showEncouragement && (
        <div
          className="relative mt-6 rounded-2xl px-6 py-6 text-center sm:mt-7 sm:px-8 sm:py-7"
          style={{ background: traitBg }}
        >
          <div
            className="text-[13px] font-semibold tracking-[0.28em] sm:text-[14px] sm:tracking-[0.32em]"
            style={{ color: `color-mix(in oklab, ${accent} 55%, #ffffff)` }}
          >
            核心特质 / TRAIT
          </div>
          <div className="mt-3 text-[17px] italic leading-relaxed text-white sm:text-[20px]">
            "<Editable
              editable={editable}
              value={report.encouragement}
              onChange={(v) => onReportChange?.({ ...report, encouragement: v })}
            />"
          </div>
        </div>
      )}

      <div className="relative mt-7 text-center sm:mt-9">
        <div
          className="text-[13px] font-semibold tracking-[0.28em] sm:text-[14px] sm:tracking-[0.32em]"
          style={{ color: accent }}
        >
          今日观察主线
        </div>
        <div className="mt-2 text-[17px] font-bold text-[#0b1b35] sm:text-[20px]">
          "{report.facts.title}"
        </div>
      </div>

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
  accent = "#3b82f6",
  children,
}: {
  tag: string;
  en: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl bg-white px-5 py-4 ring-1 ring-[#e4ecf6] sm:px-6 sm:py-5"
      style={{ boxShadow: `0 2px 10px -4px color-mix(in oklab, ${accent} 20%, transparent)` }}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in oklab, ${accent} 15%, #ffffff)`,
            color: accent,
          }}
        >
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: accent }} />
        </span>
        <span className="text-[15px] font-semibold sm:text-[16px]" style={{ color: accent }}>
          {tag} <span className="text-[#94a3b8] font-medium">/ {en}</span>
        </span>
      </div>
      <div className="text-[16px] leading-[1.75] text-[#334155] sm:text-[18px]">{children}</div>
    </div>
  );
}

function buildStandaloneHtml(data: ReportResult, t: PosterTemplate, image?: string | null) {
  const { report, meta } = data;
  const en = SECTION_EN[t.reportStyle ?? "observation"];
  const accent = t.themeAccent || "#3b82f6";
  const bgTop = t.themeBgTop || "#eaf2fb";
  const traitBg = t.themeTraitBg || "#1f2a3d";
  const kicker = t.reportStyle === "highlight" ? "Highlight Report" : "Observation Report";
  const title = t.reportStyle === "highlight" ? "今日高光反馈" : "学员观察报告";
  const factsPoints = report.facts.points.map((p) => `<li>${esc(p)}</li>`).join("");
  const thoughtsPoints = report.thoughts.points.map((p) => `<li>${esc(p)}</li>`).join("");
  const plansSteps = report.plans.steps.map((s) => `<li>${esc(s)}</li>`).join("");

  const section = (tag: string, en: string, inner: string, enabled: boolean) =>
    enabled
      ? `<div class="card"><div class="cardhead"><span class="ico"></span><span class="tag">${esc(tag)} <em>/ ${en}</em></span></div><div class="cardbody">${inner}</div></div>`
      : "";

  const imgHtml = image
    ? `<figure class="figure"><img src="${esc(image)}" alt=""/></figure>`
    : "";

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<title>${esc(meta.studentName)} · Day ${esc(meta.day)} ${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  :root{--accent:${accent};--bgtop:${bgTop};--trait:${traitBg}}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif;background:color-mix(in oklab, var(--bgtop) 60%, #ffffff);padding:24px 12px;color:#0f1f3a}
  .card-root{position:relative;max-width:640px;margin:0 auto;background:linear-gradient(180deg,var(--bgtop) 0%,color-mix(in oklab, var(--bgtop) 45%, #ffffff) 35%,#ffffff 100%);padding:48px 36px 40px;overflow:hidden;border-radius:4px}
  .topbar{position:absolute;left:0;right:0;top:0;height:5px;background:linear-gradient(90deg,var(--accent) 0%,color-mix(in oklab, var(--accent) 55%, #ffffff) 60%,transparent 100%)}
  .deco{position:absolute;right:24px;top:36px;width:140px;height:140px;border-radius:24px;background:color-mix(in oklab, var(--accent) 25%, transparent)}
  .kicker{position:relative;font-size:13px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:var(--accent);display:flex;align-items:center;gap:10px}
  .kicker::before{content:"";display:inline-block;width:30px;height:1px;background:var(--accent)}
  h1{position:relative;font-size:40px;font-weight:900;margin:18px 0 18px;letter-spacing:-.01em;line-height:1.1;color:#0b1b35}
  h1 .blue{color:var(--accent)}
  .day{position:relative;display:inline-block;background:var(--accent);color:#fff;border-radius:9999px;padding:6px 18px;font-size:16px;font-weight:600;box-shadow:0 6px 16px -6px color-mix(in oklab, var(--accent) 60%, transparent)}
  .student{position:relative;margin-top:32px;background:rgba(255,255,255,.7);border:1px solid color-mix(in oklab, var(--accent) 22%, #ffffff);border-radius:18px;padding:22px 26px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
  .student .lbl{font-size:13px;letter-spacing:.4em;color:#94a3b8;font-weight:500}
  .student .name{font-size:32px;font-weight:700;margin-top:8px;color:#0b1b35}
  .student .state{font-size:16px;font-weight:600;color:var(--accent);margin-top:8px}
  .figure{position:relative;margin:20px 0 0;border:1px solid color-mix(in oklab, var(--accent) 22%, #ffffff);background:#fff;border-radius:18px;overflow:hidden}
  .figure img{display:block;width:100%;max-height:360px;object-fit:cover}
  .sections{position:relative;margin-top:22px;display:flex;flex-direction:column;gap:18px}
  .card{background:#fff;border:1px solid #e4ecf6;border-radius:18px;padding:20px 22px;box-shadow:0 2px 10px -4px color-mix(in oklab, var(--accent) 20%, transparent)}
  .cardhead{display:flex;align-items:center;gap:10px;margin-bottom:10px}
  .ico{display:inline-block;width:24px;height:24px;border-radius:7px;background:color-mix(in oklab, var(--accent) 15%, #ffffff);position:relative}
  .ico::after{content:"";position:absolute;left:8px;top:8px;width:8px;height:8px;border-radius:2px;background:var(--accent)}
  .tag{font-size:16px;font-weight:600;color:var(--accent)}
  .tag em{font-style:normal;color:#94a3b8;font-weight:500}
  .cardbody{font-size:17px;line-height:1.75;color:#334155}
  .cardbody ul{margin:0;padding-left:18px}
  .cardbody ul li{margin:4px 0}
  .cardbody ul li::marker{color:var(--accent)}
  .trait{position:relative;margin-top:24px;background:var(--trait);border-radius:18px;padding:24px 28px;text-align:center}
  .trait .l{font-size:14px;font-weight:600;letter-spacing:.32em;color:color-mix(in oklab, var(--accent) 55%, #ffffff)}
  .trait .q{margin-top:10px;font-size:19px;font-style:italic;color:#fff;line-height:1.6}
  .coach{position:relative;margin-top:32px;text-align:center}
  .coach .l{font-size:14px;font-weight:600;letter-spacing:.32em;color:var(--accent)}
  .coach .q{margin-top:6px;font-size:19px;font-weight:700;color:#0b1b35}
  .meta{position:relative;margin-top:32px;display:flex;justify-content:center;gap:32px;font-size:15px;color:#64748b}
  .foot{position:relative;margin-top:20px;text-align:center;font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#94a3b8}
  @media (max-width:520px){
    body{padding:14px 8px}
    .card-root{padding:32px 20px 28px;border-radius:14px}
    .deco{width:90px;height:90px;right:14px;top:24px;border-radius:18px}
    h1{font-size:28px;margin:14px 0 14px}
    .day{font-size:15px;padding:5px 14px}
    .student{margin-top:22px;padding:16px 18px;border-radius:14px;gap:14px}
    .student .name{font-size:25px;margin-top:6px}
    .student .lbl{font-size:12px;letter-spacing:.28em}
    .student .state{font-size:15px;margin-top:6px}
    .figure{border-radius:14px}
    .figure img{max-height:240px}
    .sections{margin-top:18px;gap:14px}
    .card{padding:16px 18px;border-radius:14px}
    .cardbody{font-size:16px}
    .trait{padding:20px 18px;border-radius:14px}
    .trait .q{font-size:17px}
    .coach .q{font-size:17px}
    .meta{gap:18px;flex-wrap:wrap;font-size:14px;margin-top:24px}
  }
</style></head><body>
<div class="card-root">
  <div class="topbar"></div>
  <div class="deco"></div>
  <div class="kicker">${kicker}</div>
  <h1>AI for Good 夏令营<br/><span class="blue">${esc(title)}</span></h1>
  <div class="day">Day ${esc(meta.day)}</div>
  <div class="student">
    <div><div class="lbl">学　员</div><div class="name">${esc(meta.studentName)}</div></div>
    <div style="text-align:right"><div class="lbl">今 日 状 态</div><div class="state">↑ 持续观察中</div></div>
  </div>
  ${imgHtml}
  <div class="sections">
    ${section(t.sections.facts.tag, en.facts, `<ul>${factsPoints}</ul>`, t.sections.facts.enabled)}
    ${section(t.sections.thoughts.tag, en.thoughts, `<ul>${thoughtsPoints}</ul>`, t.sections.thoughts.enabled)}
    ${section(t.sections.plans.tag, en.plans, `<ul>${plansSteps}</ul>`, t.sections.plans.enabled)}
  </div>
  ${t.showEncouragement ? `<div class="trait"><div class="l">核心特质 / TRAIT</div><div class="q">"${esc(report.encouragement)}"</div></div>` : ""}
  <div class="coach"><div class="l">今日观察主线</div><div class="q">"${esc(report.facts.title)}"</div></div>
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
