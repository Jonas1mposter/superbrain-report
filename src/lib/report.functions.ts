import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const MODEL_OPTIONS = [
  { id: "kimi", label: "Kimi K2.6" },
  { id: "deepseek", label: "Deepseek V4 Pro" },
] as const;

export type ModelId = (typeof MODEL_OPTIONS)[number]["id"];

const InputSchema = z.object({
  studentName: z.string().min(1),
  day: z.string().min(1),
  date: z.string().min(1),
  project: z.string().optional().default(""),
  observations: z.string().min(1),
  mentor: z.string().optional().default(""),
  model: z.enum(["kimi", "deepseek"]).optional().default("kimi"),
});

const BatchInputSchema = z.object({
  day: z.string().min(1),
  date: z.string().min(1),
  project: z.string().optional().default(""),
  mentor: z.string().optional().default(""),
  narrative: z.string().min(1),
  studentHints: z.array(z.string()).optional().default([]),
  model: z.enum(["kimi", "deepseek"]).optional().default("kimi"),
});

const ReportSchema = z.object({
  facts: z.object({
    title: z.string(),
    points: z.array(z.string()).min(1),
  }),
  thoughts: z.object({
    title: z.string(),
    points: z.array(z.string()).min(1),
  }),
  plans: z.object({
    title: z.string(),
    steps: z.array(z.string()).min(1),
  }),
  encouragement: z.string(),
});

export type DailyReport = z.infer<typeof ReportSchema>;

type ProviderConfig = {
  url: string;
  model: string;
  key: string | undefined;
  keyName: string;
};

function getProvider(model: ModelId): ProviderConfig {
  if (model === "deepseek") {
    return {
      url: "https://api.deepseek.com/chat/completions",
      model: "deepseek-chat",
      key: process.env.DEEPSEEK_API_KEY,
      keyName: "DEEPSEEK_API_KEY",
    };
  }
  return {
    url: "https://api.moonshot.cn/v1/chat/completions",
    model: "moonshot-v1-8k",
    key: process.env.MOONSHOT_API_KEY,
    keyName: "MOONSHOT_API_KEY",
  };
}

const SYSTEM_PROMPT_SINGLE = `你是「AI for Good」7天夏令营的资深观察导师，正在为**学员家长**整理当日观察报告。这份报告采用专业观察者的三段式结构：**事实（我看到）→ 观点（我想到）→ 后续观察（我计划）**。请直接陈述，不要使用"在观察记录中""根据记录""老师注意到"等指向资料来源的元语言。

【最高优先级：分清事实与观点】
- "事实"部分只能写"今日原始观察记录"里**明确写出**的行为、对话、动作、可观察的情绪信号，不写解读、不写评价。
- "观点"部分才是导师的分析和推断，但必须紧扣事实、有明确依据；不脑补角色、不虚构对话、不做过度心理分析。
- "后续观察"是导师下一步准备关注/验证的事，不是布置给孩子的任务。
- 不使用夸大副词（"非常""极其""完全"）；措辞平实、克制。

【三个板块的写法】
- "事实 / 我看到"：用 2-4 个短点客观陈述今天发生了什么。每点一句话，以动词或事实开头（"今天他……""在小组讨论中……"），不带评价词。
- "观点 / 我想到"：用 1-3 个短点写导师基于事实的判断或推断。可以是能力观察、情绪解读、成长信号，但每点应能追溯到"事实"里的具体依据。
- "后续观察 / 我计划"：用 1-3 条写导师明天/后续会重点关注、追问、或验证的方向。用"计划观察……""接下来留意……""明天可以邀请他……"这类导师视角的句式。这一段是**给家长看的、说明老师会持续陪伴的方向**，不是给家长的任务。

全部用简体中文。严格只输出 JSON：
{
  "facts": {"title": "一句话概述今天的观察主线", "points": ["……", "……"]},
  "thoughts": {"title": "一句话概述今天的核心解读", "points": ["……"]},
  "plans": {"title": "一句话概述后续观察方向", "steps": ["……"]},
  "encouragement": "给家长的一句话（不超过30字，温和、不夸张）"
}`;

const SYSTEM_PROMPT_BATCH = `你是「AI for Good」7天夏令营的资深观察导师。老师会给你**一大段今日流水账式的观察记录**，里面夹杂了多个学员的片段（按时间顺序，可能穿插）。你需要：

1. 从流水账中**识别出所有被观察到的学员**（用出现的名字/昵称作为 studentName）。
2. 为**每个学员**分别抽取只属于 ta 的事实片段，按"事实（我看到）→ 观点（我想到）→ 后续观察（我计划）"三段式生成一份观察报告。
3. **绝不跨学员移植事实**：属于 A 的行为不能写进 B 的报告；如果某位学员的记录信息很少，就只写少量内容，宁可简短。
4. **绝不脑补**：只能使用流水账里明确出现的事实、对话、情绪信号；不要编造角色、心理分析或未发生的事件。
5. 不使用夸大副词（"非常""极其""完全"），措辞平实、克制。

【三个板块】
- "事实 / 我看到"（2-4 点）：客观陈述行为，每点一句，动词开头，不带评价。
- "观点 / 我想到"（1-3 点）：基于该学员事实的判断/推断，可追溯到事实。
- "后续观察 / 我计划"（1-3 条）：导师下一步会关注/追问/验证的方向（"计划观察……""接下来留意……"），不是给家长的任务。

全部用简体中文。严格只输出 JSON：
{
  "students": [
    {
      "studentName": "……",
      "facts": {"title": "……", "points": ["……"]},
      "thoughts": {"title": "……", "points": ["……"]},
      "plans": {"title": "……", "steps": ["……"]},
      "encouragement": "给家长的一句话（≤30字，温和）"
    }
  ]
}

如果老师额外提供了"学员名单提示"，优先使用这些名字作为拆分依据（未在流水账中出现的名字请跳过，不要编造内容）。`;

async function callProvider(provider: ProviderConfig, system: string, user: string) {
  const res = await fetch(provider.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${provider.keyName} 调用失败 (${res.status}): ${txt.slice(0, 300)}`);
  }

  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  return parseJsonLoose(content);
}

function parseJsonLoose(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const cleaned = content
      .replace(/```json\s*/gi, "")
      .replace(/```/g, "")
      .trim();
    const start = cleaned.search(/[\{\[]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("模型返回内容不是合法 JSON：" + content.slice(0, 200));
    }
    let body = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(body);
    } catch {
      body = body
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/[\x00-\x1F\x7F]/g, " ");
      return JSON.parse(body);
    }
  }
}

export const generateReport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const provider = getProvider(data.model);
    if (!provider.key) {
      throw new Error(`缺少 ${provider.keyName}，请先在 Lovable 中配置对应的 API Key。`);
    }

    const userPrompt = `学员姓名：${data.studentName}
营期：第 ${data.day} 天（${data.date}）
项目方向：${data.project || "未填写"}
带教导师：${data.mentor || "未填写"}

今日原始观察记录：
${data.observations}`;

    const parsed = await callProvider(provider, SYSTEM_PROMPT_SINGLE, userPrompt);
    const report = ReportSchema.parse(parsed);
    return {
      report,
      meta: {
        studentName: data.studentName,
        day: data.day,
        date: data.date,
        project: data.project,
        mentor: data.mentor,
        model: data.model,
      },
    };
  });

const BatchOutputSchema = z.object({
  students: z
    .array(
      ReportSchema.extend({
        studentName: z.string().min(1),
      }),
    )
    .min(1),
});

export const generateBatchReports = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => BatchInputSchema.parse(d))
  .handler(async ({ data }) => {
    const provider = getProvider(data.model);
    if (!provider.key) {
      throw new Error(`缺少 ${provider.keyName}，请先在 Lovable 中配置对应的 API Key。`);
    }

    const hints = data.studentHints.filter((s) => s.trim()).join("、");
    const userPrompt = `营期：第 ${data.day} 天（${data.date}）
项目方向：${data.project || "未填写"}
带教导师：${data.mentor || "未填写"}
${hints ? `学员名单提示（优先使用）：${hints}` : "学员名单提示：无（请从流水账中自行识别所有被观察到的学员）"}

今日流水账式观察记录（多学员混合，按时间顺序）：
${data.narrative}`;

    const parsed = await callProvider(provider, SYSTEM_PROMPT_BATCH, userPrompt);
    const out = BatchOutputSchema.parse(parsed);

    return {
      results: out.students.map((s) => ({
        report: {
          facts: s.facts,
          thoughts: s.thoughts,
          plans: s.plans,
          encouragement: s.encouragement,
        },
        meta: {
          studentName: s.studentName,
          day: data.day,
          date: data.date,
          project: data.project,
          mentor: data.mentor,
          model: data.model,
        },
      })),
    };
  });
