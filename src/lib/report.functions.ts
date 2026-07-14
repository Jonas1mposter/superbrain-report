import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildBatchReports, buildSingleReport } from "./report-ai.server";

export const MODEL_OPTIONS = [
  { id: "kimi", label: "Kimi 32k" },
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

export type DailyReport = {
  facts: { title: string; points: string[] };
  thoughts: { title: string; points: string[] };
  plans: { title: string; steps: string[] };
  encouragement: string;
};

export const generateReport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    return buildSingleReport(data);
  });

export const generateBatchReports = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => BatchInputSchema.parse(d))
  .handler(async ({ data }) => {
    return buildBatchReports(data);
  });
