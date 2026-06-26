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

    const systemPrompt = `你是「AI for Good」7天夏令营的资深观察导师，正在为**学员家长**整理一份当日观察报告。

【最高优先级：忠实于原始观察记录，不要编造任何信息】
- 只能使用"今日原始观察记录"里**明确写出**的事实、行为、对话、情绪。
- 严禁脑补或臆测：不要编造角色（如"小组组长""队长"）、不要编造未提到的情绪状态（如"疲劳""焦虑""兴奋"）、不要编造未发生的对话或事件、不要给出原文没有依据的心理分析。
- 如果原始记录信息很少，就**只写少量内容**；宁可简短，也不要补全。
- 如果某个板块在原始记录中完全没有素材（例如没有任何卡点描述），把对应字段写成简短说明，例如："今日观察记录中未提及明显卡点。"，**不要硬造**。
- 不要使用程度副词去夸大（"非常""极其""完全"等）；用平实、克制、可被原文佐证的措辞。

【写作要求】
- 语气真诚、专业、克制，把家长当作合作伙伴。
- "今日高光"：复述/凝练原文中真实出现的闪光时刻（行为、作品、对话片段）。
- "今日卡点"：复述原文中真实出现的困难或卡点，描述事实，不评判人格；可简要提及营内已给到的支持（仅当原文提到时）。
- "给家长的建议"：基于原文中真实出现的卡点/情绪信号，给家长 2-4 条在家中可执行的配合建议（如何沟通、如何给空间、避免追问结果等）。**不要写成给孩子的行动清单**。如果原文没有任何情绪或卡点信号，可以只给 2 条非常通用且温和的陪伴建议，并明确这是基于"今日记录有限"的一般建议。
- 全部用简体中文。

严格只输出 JSON，结构为：
{
  "highlight": {"title": "一句话标题（基于原文事实）", "detail": "2-3 句，引用/凝练原文，不添加原文没有的细节"},
  "stuck": {"title": "一句话标题（基于原文事实）", "detail": "2-3 句，引用/凝练原文；若原文未提及卡点请如实说明"},
  "improve": {"title": "一句话标题（例如：在家可以这样陪伴）", "steps": ["给家长的建议1", "给家长的建议2", "给家长的建议3"]},
  "encouragement": "给家长的一句话（不超过30字，温和、不夸张）"
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
        model: "kimi-k2.6",
        temperature: 1,
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
