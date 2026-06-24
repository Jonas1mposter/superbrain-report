export type SectionKey = "highlight" | "stuck" | "improve";

export type SectionConfig = {
  enabled: boolean;
  tag: string; // e.g. "✨ 今日高光"
  tone: "warm" | "cool" | "green" | "violet" | "slate";
};

export type LayoutKey = "stack" | "split" | "compact";

export type PosterTemplate = {
  layout: LayoutKey;
  themeFrom: string; // oklch values
  themeVia: string;
  themeTo: string;
  showEncouragement: boolean;
  showMentor: boolean;
  footer: string;
  sections: Record<SectionKey, SectionConfig>;
};

export const DEFAULT_TEMPLATE: PosterTemplate = {
  layout: "stack",
  themeFrom: "oklch(0.97 0.04 80)",
  themeVia: "oklch(0.94 0.06 50)",
  themeTo: "oklch(0.88 0.12 30)",
  showEncouragement: true,
  showMentor: true,
  footer: "Generated with Kimi · AI for Good 观察导师工具",
  sections: {
    highlight: { enabled: true, tag: "✨ 今日高光", tone: "warm" },
    stuck: { enabled: true, tag: "🧱 今日卡点", tone: "cool" },
    improve: { enabled: true, tag: "💌 给家长的建议", tone: "green" },
  },
};

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
        highlight: { enabled: true, tag: "🌱 亮点", tone: "green" },
        stuck: { enabled: true, tag: "💭 思考点", tone: "cool" },
        improve: { enabled: true, tag: "🎯 下一步", tone: "violet" },
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
        highlight: { enabled: true, tag: "⭐ 闪光点", tone: "violet" },
        stuck: { enabled: true, tag: "🧩 待解锁", tone: "slate" },
        improve: { enabled: true, tag: "🚀 明日行动", tone: "cool" },
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

const STORAGE_KEY = "ai4good.templates.v1";

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
