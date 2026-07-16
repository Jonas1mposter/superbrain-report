import { z } from "zod";

type ModelId = "kimi" | "deepseek";
type ReportStyle = "observation" | "highlight";

type SingleReportInput = {
  studentName: string;
  day: string;
  date: string;
  project?: string;
  observations: string;
  mentor?: string;
  model: ModelId;
  reportStyle?: ReportStyle;
};

type BatchReportInput = {
  day: string;
  date: string;
  project?: string;
  mentor?: string;
  narrative: string;
  studentHints: string[];
  model: ModelId;
  reportStyle?: ReportStyle;
};

type ProviderConfig = {
  url: string;
  model: string;
  key: string | undefined;
  keyName: string;
};

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

const BatchExtractionSchema = z.object({
  students: z
    .array(
      z.object({
        studentName: z.string().min(1),
        observations: z.array(z.string()).min(1),
      }),
    )
    .min(1),
});

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

const SYSTEM_PROMPT_EXTRACT_BATCH = `你是「AI for Good」7天夏令营的观察记录整理助手。老师会给你一大段按时间顺序写下的流水账，里面可能穿插多个学员。

你的任务只做第一步：按学员拆分事实材料，不写评价、不写观点、不写报告。

规则：
1. 识别流水账中被观察到的所有学员，使用原文出现的名字/昵称作为 studentName。
2. 每位学员只保留属于 ta 的事实、对话、动作、情绪信号；绝不跨学员移植。
3. 如果老师提供了学员名单提示，优先用这些名字拆分；未在流水账中出现的名字跳过。
4. observations 按时间顺序写，每条一句，尽量保留原始细节；每位学员最多 8 条，优先保留最具体、最能支持后续观察的事实。
5. 只输出 JSON，不要解释。

JSON 格式：
{
  "students": [
    {"studentName": "……", "observations": ["……", "……"]}
  ]
}`;

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
    model: "moonshot-v1-32k",
    key: process.env.MOONSHOT_API_KEY,
    keyName: "MOONSHOT_API_KEY",
  };
}

function providerDisplayName(provider: ProviderConfig) {
  return provider.keyName.replace("_API_KEY", "");
}

async function callProvider(
  provider: ProviderConfig,
  system: string,
  user: string,
  options: { maxTokens: number; retryMaxTokens?: number; temperature?: number },
): Promise<unknown> {
  const first = await callProviderOnce(provider, system, user, options.maxTokens, options.temperature ?? 0.35);
  if (!first.needsRetry) return first.parsed;

  const retryMaxTokens = options.retryMaxTokens ?? options.maxTokens;
  if (retryMaxTokens <= options.maxTokens) {
    throw new Error(`${providerDisplayName(provider)} 输出被截断，请减少输入长度或分批生成。`);
  }

  const second = await callProviderOnce(provider, system, user, retryMaxTokens, options.temperature ?? 0.25);
  if (second.needsRetry) {
    throw new Error(`${providerDisplayName(provider)} 输出仍被截断，请减少输入长度或分批生成。`);
  }
  return second.parsed;
}

async function callProviderOnce(
  provider: ProviderConfig,
  system: string,
  user: string,
  maxTokens: number,
  temperature: number,
): Promise<{ parsed: unknown; needsRetry: boolean }> {
  const res = await fetch(provider.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${provider.keyName} 调用失败（${res.status}）：${formatProviderError(txt)}`);
  }

  const json = await res.json();
  const choice = json?.choices?.[0];
  const finishReason = String(choice?.finish_reason ?? "").toLowerCase();
  const content: string = choice?.message?.content ?? "";
  const truncated = finishReason === "length" || finishReason === "max_tokens" || finishReason === "max_output_tokens";

  try {
    return { parsed: parseJsonLoose(content), needsRetry: truncated };
  } catch (err) {
    if (truncated) return { parsed: null, needsRetry: true };
    throw err;
  }
}

function formatProviderError(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message || raw.slice(0, 220);
  } catch {
    return raw.slice(0, 220);
  }
}

function parseJsonLoose(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const cleaned = content
      .replace(/^\uFEFF/, "")
      .replace(/```json\s*/gi, "")
      .replace(/```/g, "")
      .trim();
    const start = cleaned.search(/[\{\[]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("模型返回内容不是合法 JSON，请重试一次或缩短输入。" + content.slice(0, 120));
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

function buildSingleUserPrompt(data: SingleReportInput) {
  return `学员姓名：${data.studentName}
营期：第 ${data.day} 天（${data.date}）
项目方向：${data.project || "未填写"}
带教导师：${data.mentor || "未填写"}

今日原始观察记录：
${data.observations}`;
}

export async function buildSingleReport(data: SingleReportInput) {
  const provider = getProvider(data.model);
  if (!provider.key) {
    throw new Error(`缺少 ${provider.keyName}，请先在 Lovable 中配置对应的 API Key。`);
  }

  const parsed = await callProvider(provider, SYSTEM_PROMPT_SINGLE, buildSingleUserPrompt(data), {
    maxTokens: 2048,
    retryMaxTokens: 4096,
    temperature: 0.35,
  });
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
}

export async function buildBatchReports(data: BatchReportInput) {
  const provider = getProvider(data.model);
  if (!provider.key) {
    throw new Error(`缺少 ${provider.keyName}，请先在 Lovable 中配置对应的 API Key。`);
  }

  const hints = data.studentHints.filter((s) => s.trim()).join("、");
  const extractionPrompt = `营期：第 ${data.day} 天（${data.date}）
项目方向：${data.project || "未填写"}
带教导师：${data.mentor || "未填写"}
${hints ? `学员名单提示（优先使用）：${hints}` : "学员名单提示：无（请从流水账中自行识别所有被观察到的学员）"}

今日流水账式观察记录（多学员混合，按时间顺序）：
${data.narrative}`;

  const extracted = BatchExtractionSchema.parse(
    await callProvider(provider, SYSTEM_PROMPT_EXTRACT_BATCH, extractionPrompt, {
      maxTokens: 4096,
      retryMaxTokens: 8192,
      temperature: 0.2,
    }),
  );

  const results = [];
  for (const student of extracted.students) {
    const observations = student.observations.map((item) => `- ${item}`).join("\n");
    const single = await buildSingleReport({
      studentName: student.studentName,
      day: data.day,
      date: data.date,
      project: data.project,
      mentor: data.mentor,
      observations,
      model: data.model,
    });
    results.push(single);
  }

  return { results };
}