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
    points: z.array(z.string()).min(2).max(3),
  }),
  stuck: z.object({
    title: z.string(),
    points: z.array(z.string()).min(1).max(2),
  }),
  improve: z.object({
    title: z.string(),
    steps: z.array(z.string()).min(1).max(1),
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

    const systemPrompt = `你是「AI for Good」7天夏令营的资深观察导师，正在为**学员家长**整理当日观察报告。这份报告本身就是观察记录，请直接陈述事实，不要使用"在观察记录中""根据记录""老师注意到""据观察"等指向资料来源的元语言。直接写"今天他……"即可。

【最高优先级：忠实于真实发生的事，不要编造】
- 只能使用"今日原始观察记录"里**明确写出**的事实、行为、对话、情绪。
- 严禁脑补：不要编造角色（如"小组组长""队长"）、未提到的情绪状态（如"疲劳""焦虑"）、未发生的对话或事件、原文没有依据的心理分析。
- 如果原文信息很少，就**只写少量内容**；宁可简短，也不要补全。
- 不使用夸大副词（"非常""极其""完全"）；用平实、克制的措辞。

【三个板块的写法】
- "今日高光"：直接描述今天孩子做得好的具体行为或瞬间，用 2-3 个短点呈现，每点一句话，只写事实，不概括评价。不要写"在观察中我们发现……"，直接写"今天他……"。
- "今日卡点"：直接描述今天遇到的困难或情绪信号，用 1-2 个短点呈现，每点一句话；若原文确实没有任何卡点信号，就只写一句："今天没有明显卡点。"
- "给家长的建议"：这是写给**家长在家里**做的事，不是给孩子的待办清单。
   - 紧扣"今日卡点/情绪信号"，告诉家长在家里如何配合：用什么语气沟通、避免问什么、给孩子留什么空间、如何回应他可能带回家的情绪。
   - 如果今天没有明显卡点，就给 1 条温和的陪伴建议（如：今晚可以请孩子讲讲今天最有意思的一件事）。
   - **不要**写成"鼓励孩子……""让孩子……""引导他……"这种把孩子当任务对象的句式；用"您可以……""不妨……""今晚可以……"这种直接对家长说话的句式。
   - 只给 1 条，一句话，具体、可执行、温和。

全部用简体中文。严格只输出 JSON：
{
  "highlight": {"title": "一句话标题", "points": ["今天他……", "今天他……"]},
  "stuck": {"title": "一句话标题", "points": ["……", "……"]},
  "improve": {"title": "一句话标题，如：今晚在家可以这样陪伴", "steps": ["对家长说的唯一建议"]},
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
      // Kimi 偶尔返回带 ```json 包裹或前后多余文字的内容，尝试抽取 JSON 主体。
      const cleaned = content
        .replace(/```json\s*/gi, "")
        .replace(/```/g, "")
        .trim();
      const start = cleaned.search(/[\{\[]/);
      const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
      if (start === -1 || end === -1 || end <= start) {
        throw new Error("Kimi 返回内容不是合法 JSON：" + content.slice(0, 200));
      }
      let body = cleaned.slice(start, end + 1);
      try {
        parsed = JSON.parse(body);
      } catch {
        body = body
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]")
          .replace(/[\x00-\x1F\x7F]/g, " ");
        parsed = JSON.parse(body);
      }
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
