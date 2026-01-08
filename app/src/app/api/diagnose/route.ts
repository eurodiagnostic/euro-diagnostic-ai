// app/src/app/api/diagnose/route.ts
import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { DiagnosticInputSchema, DiagnosticPlanSchema } from "@/lib/diagnosticSchema";

export const runtime = "nodejs";

/** Removes ```json ... ``` fences (and trims). */
function stripJsonFences(s: string) {
  return s
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
}

/** Tries to grab the first {...} block from a messy response. */
function extractFirstJsonObject(s: string) {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return s.slice(start, end + 1);
}

function zodErrToShortString(err: unknown) {
  try {
    // ZodError has .issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issues = (err as any)?.issues as Array<any> | undefined;
    if (!issues?.length) return String(err);
    return issues
      .slice(0, 8)
      .map((i) => `${(i.path || []).join(".") || "(root)"}: ${i.message}`)
      .join("; ");
  } catch {
    return String(err);
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing OPENAI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const body = await req.json();

    // ✅ Validate incoming request
    const input = DiagnosticInputSchema.parse(body);

    // We’ll guide the model to output a STRICT JSON object (no markdown).
    // This avoids using `response_format` / zod helpers that caused your TS overload errors.
    const lang = (input as any).language === "es" ? "es" : "en";

    const prompt = `
You are generating a structured automotive diagnostic plan.

Return ONLY valid JSON. No markdown. No backticks. No commentary.
The JSON MUST match this structure and include ALL required keys:

{
  "version": "1.0",
  "language": "en" | "es",
  "vehicle": { "make": string, "model": string, "year": string, "engine": string, "vin": string, "mileage": string },
  "concern": { "dtcs": string[], "symptom": string, "notes": string },
  "overview": { "en": string, "es": string },
  "disclaimers": { "en": string, "es": string },
  "safetyNotes": { "en": string[], "es": string[] },
  "specs": {
    "labeledAsEstimated": boolean,
    "items": [
      { "name": { "en": string, "es": string }, "expectedRange": string, "unit": string, "note": { "en": string, "es": string }, "estimated": boolean }
    ]
  },
  "steps": [
    {
      "id": string,
      "title": { "en": string, "es": string },
      "purpose": { "en": string, "es": string },
      "procedure": { "en": string[], "es": string[] },
      "connectorHints": [
        {
          "label": { "en": string, "es": string },
          "test": { "en": string, "es": string },
          "expectedRange": string,
          "estimated": boolean,
          "notes": { "en": string, "es": string }
        }
      ],
      "passCriteria": { "en": string[], "es": string[] },
      "failCriteria": { "en": string[], "es": string[] },
      "nextOnPass": string | null,
      "nextOnFail": string | null
    }
  ],
  "firstStepId": string,
  "sessionId": string
}

Rules:
- If VIN or mileage are unknown, set them to "" (empty string). Do NOT omit.
- Use estimated specs/ranges only; mark estimated=true and include "estimated" label in notes.
- NO OEM wiring diagrams. You may reference: "Refer to OEM wiring diagram (OEM/Alldata/Mitchell) if available."
- Include bilingual text in both en and es ALWAYS, even if language is "en" or "es".
- Keep steps practical and safe. Include at least 5 steps.
- Use stable step ids like "step-1", "step-2", etc.
- Set firstStepId to "step-1".
- sessionId must echo the provided sessionId (or "" if none).

Here is the case input:
${JSON.stringify(
  {
    make: (input as any).make,
    model: (input as any).model,
    year: (input as any).year,
    engine: (input as any).engine,
    dtcs: (input as any).dtcs,
    symptom: (input as any).symptom,
    notes: (input as any).notes,
    language: lang,
    sessionId: (input as any).sessionId ?? "",
    vin: (input as any).vin ?? "",
    mileage: (input as any).mileage ?? "",
  },
  null,
  2
)}
`.trim();

    // Try twice: initial + one “repair” attempt if JSON fails schema validation.
    let rawText = "";
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        input:
          attempt === 1
            ? prompt
            : `${prompt}

Your previous JSON failed validation with these issues:
${zodErrToShortString(lastErr)}

Return ONLY corrected JSON that satisfies the structure exactly. Do not omit required keys.`,
        temperature: 0.2,
      });

      rawText = (response as any).output_text ?? "";

      const cleaned = stripJsonFences(rawText);
      const jsonBlock = extractFirstJsonObject(cleaned) ?? cleaned;

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonBlock);
      } catch (e) {
        lastErr = e;
        continue;
      }

      const validated = DiagnosticPlanSchema.safeParse(parsed);
      if (validated.success) {
        return NextResponse.json({ ok: true, plan: validated.data });
      }

      lastErr = validated.error;
    }

    // If we get here, it failed after retries.
    return NextResponse.json(
      {
        ok: false,
        error: "Model did not return valid JSON matching schema",
        detail: zodErrToShortString(lastErr),
        raw: rawText,
      },
      { status: 500 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "Diagnose failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }
}