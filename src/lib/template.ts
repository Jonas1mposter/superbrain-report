export type SectionKey = "facts" | "thoughts" | "plans";

export type SectionConfig = {
  enabled: boolean;
  tag: string;
  tone: "warm" | "cool" | "green" | "violet" | "slate";
};

export type LayoutKey = "stack" | "split" | "compact";

export type ReportStyle = "observation" | "highlight";

export type PosterTemplate = {
  layout: LayoutKey;
  themeFrom: string;
  themeVia: string;
  themeTo: string;
  showEncouragement: boolean;
  showMentor: boolean;
  footer: string;
  reportStyle?: ReportStyle;
  sections: Record<SectionKey, SectionConfig>;
};

export const REPORT_STYLE_OPTIONS: { id: ReportStyle; label: string; desc: string }[] = [
  {
    id: "observation",
    label: "观察三段",
    desc: "事实 / 观点 / 后续观察（面向家长的专业观察者视角）",
  },
  {
    id: "highlight",
    label: "高光卡点",
    desc: "高光 / 卡点 / 家长建议（更温暖的家庭沟通版）",
  },
];

export const SECTION_EN: Record<ReportStyle, Record<SectionKey, string>> = {
  observation: { facts: "FACTS", thoughts: "THOUGHTS", plans: "PLANS" },
  highlight: { facts: "HIGHLIGHT", thoughts: "CHECKPOINT", plans: "ADVICE" },
};

export const DEFAULT_TEMPLATE: PosterTemplate = {
  layout: "stack",
  themeFrom: "oklch(0.97 0.04 80)",
  themeVia: "oklch(0.94 0.06 50)",
  themeTo: "oklch(0.88 0.12 30)",
  showEncouragement: true,
  showMentor: true,
  footer: "Generated with Kimi · AI for Good 观察导师工具",
  reportStyle: "observation",
  sections: {
    facts: { enabled: true, tag: "👀 事实 · 我看到", tone: "cool" },
    thoughts: { enabled: true, tag: "💭 观点 · 我想到", tone: "warm" },
    plans: { enabled: true, tag: "🧭 后续观察 · 我计划", tone: "green" },
  },
};

export const HIGHLIGHT_TEMPLATE: PosterTemplate = {
  layout: "stack",
  themeFrom: "oklch(0.97 0.04 80)",
  themeVia: "oklch(0.94 0.06 50)",
  themeTo: "oklch(0.88 0.12 30)",
  showEncouragement: true,
  showMentor: true,
  footer: "Generated with Kimi · AI for Good 导师工具",
  reportStyle: "highlight",
  sections: {
    facts: { enabled: true, tag: "✨ 今日高光", tone: "warm" },
    thoughts: { enabled: true, tag: "🌱 卡点与支持", tone: "cool" },
    plans: { enabled: true, tag: "🤝 给家长的建议", tone: "green" },
  },
};

export function templateForStyle(style: ReportStyle): PosterTemplate {
  return style === "highlight" ? HIGHLIGHT_TEMPLATE : DEFAULT_TEMPLATE;
}

export const PRESETS: { name: string; template: PosterTemplate }[] = [
  { name: "暖阳", template: DEFAULT_TEMPLATE },
  {
    name: "薄荷",
    template: {
      ...DEFAULT_TEMPLATE,
      themeFrom: "oklch(0.97 0.03 180)",
      themeVia: "oklch(0.92 0.07 170)",
      themeTo: "oklch(0.82 0.13 160)",
      sections: {
        facts: { enabled: true, tag: "👀 我看到", tone: "green" },
        thoughts: { enabled: true, tag: "💭 我想到", tone: "cool" },
        plans: { enabled: true, tag: "🧭 我计划", tone: "violet" },
      },
    },
  },
  {
    name: "夜空",
    template: {
      ...DEFAULT_TEMPLATE,
      themeFrom: "oklch(0.92 0.04 280)",
      themeVia: "oklch(0.82 0.09 270)",
      themeTo: "oklch(0.7 0.14 260)",
      sections: {
        facts: { enabled: true, tag: "👀 事实", tone: "violet" },
        thoughts: { enabled: true, tag: "💭 观点", tone: "slate" },
        plans: { enabled: true, tag: "🧭 后续观察", tone: "cool" },
      },
    },
  },
];

export const TONE_STYLES: Record<
  SectionConfig["tone"],
  { bg: string; accent: string; cssBg: string; cssAccent: string }
> = {
  warm: {
    bg: "oklch(1 0 0 / 0.78)",
    accent: "oklch(0.55 0.18 30)",
    cssBg: "rgba(255,255,255,.78)",
    cssAccent: "#b14a1a",
  },
  cool: {
    bg: "oklch(0.97 0.02 250 / 0.85)",
    accent: "oklch(0.45 0.12 250)",
    cssBg: "rgba(232,238,250,.85)",
    cssAccent: "#2a4a8a",
  },
  green: {
    bg: "oklch(0.96 0.05 145 / 0.85)",
    accent: "oklch(0.45 0.15 145)",
    cssBg: "rgba(228,245,228,.85)",
    cssAccent: "#2a6a3a",
  },
  violet: {
    bg: "oklch(0.96 0.04 300 / 0.85)",
    accent: "oklch(0.45 0.15 300)",
    cssBg: "rgba(240,232,250,.85)",
    cssAccent: "#6a2a8a",
  },
  slate: {
    bg: "oklch(0.95 0.01 250 / 0.85)",
    accent: "oklch(0.4 0.02 250)",
    cssBg: "rgba(232,234,238,.85)",
    cssAccent: "#3a4250",
  },
};

const STORAGE_KEY = "ai4good.templates.v2";

export function loadStoredTemplates(): Record<string, PosterTemplate> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveTemplateFor(name: string, template: PosterTemplate) {
  if (typeof window === "undefined" || !name) return;
  const all = loadStoredTemplates();
  all[name] = template;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteTemplateFor(name: string) {
  if (typeof window === "undefined") return;
  const all = loadStoredTemplates();
  delete all[name];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
