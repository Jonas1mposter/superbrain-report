import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  studentName: z.string().min(1),
  day: z.string().min(1),
  date: z.string().min(1),
  project: z.string().optional().default(""),
  observations: z.string().min(1),
  mentor: z.string().optional().default(""),
});

const ReportSchema = z.object({
  highlight: z.object({
    title: z.string(),
    detail: z.string(),
  }),
  stuck: z.object({
    title: z.string(),
    detail: z.string(),
  }),
  improve: z.object({
    title: z.string(),
    steps: z.array(z.string()).min(2).max(5),
  }),
  encouragement: z.string(),
});

export type DailyReport = z.infer<typeof ReportSchema>;

export const generateReport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.MOONSHOT_API_KEY;
    if (!key) {
      throw new Error("缺少 MOONSHOT_API_KEY，请先在 Lovable 中配置 Kimi API Key。");
    }

    const systemPrompt = `你是「AI for Good」7天夏令营的资深观察导师。基于导师提供的原始观察记录，为学员撰写一份温暖、具体、有建设性的每日观察报告。
要求：
- 语气真诚鼓励，避免空话套话。
- "今日高光"要具体到行为/作品/对话片段。
- "卡点"要点出真实困难，不评判人格。
- "如何进步"给出 3 条可立刻执行的、面向明天的小行动。
- 全部用简体中文。
严格只输出 JSON，结构为：
{
  "highlight": {"title": "一句话标题", "detail": "2-3 句具体描述"},
  "stuck": {"title": "一句话标题", "detail": "2-3 句具体描述"},
  "improve": {"title": "一句话标题", "steps": ["行动1", "行动2", "行动3"]},
  "encouragement": "给学员的一句鼓励话（不超过30字）"
}`;

    const userPrompt = `学员姓名：${data.studentName}
营期：第 ${data.day} 天（${data.date}）
项目方向：${data.project || "未填写"}
带教导师：${data.mentor || "未填写"}

今日原始观察记录：
${data.observations}`;

    const res = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "moonshot-v1-8k",
        temperature: 0.6,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Kimi 调用失败 (${res.status}): ${txt.slice(0, 300)}`);
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("Kimi 返回内容不是合法 JSON");
    }
    const report = ReportSchema.parse(parsed);
    return {
      report,
      meta: {
        studentName: data.studentName,
        day: data.day,
        date: data.date,
        project: data.project,
        mentor: data.mentor,
      },
    };
  });
