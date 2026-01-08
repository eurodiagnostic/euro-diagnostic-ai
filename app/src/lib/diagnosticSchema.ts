import { z } from "zod";

/* -------------------- */
/* Shared helpers      */
/* -------------------- */

const BilingualText = z.object({
  en: z.string(),
  es: z.string(),
});

const BilingualTextArray = z.object({
  en: z.array(z.string()),
  es: z.array(z.string()),
});

/* -------------------- */
/* INPUT SCHEMA        */
/* -------------------- */

export const DiagnosticInputSchema = z.object({
  make: z.string(),
  model: z.string(),
  year: z.string(),
  engine: z.string(),
  dtcs: z.array(z.string()),
  symptom: z.string(),
  notes: z.string().optional().default(""),
  language: z.enum(["en", "es"]).default("en"),
  sessionId: z.string().optional().default(""),
  vin: z.string().optional().default(""),
  mileage: z.string().optional().default(""),
});

/* -------------------- */
/* OUTPUT / PLAN       */
/* -------------------- */

export const DiagnosticPlanSchema = z.object({
  version: z.string(),

  language: z.enum(["en", "es"]),

  vehicle: z.object({
    make: z.string(),
    model: z.string(),
    year: z.string(),
    engine: z.string(),
    vin: z.string(),
    mileage: z.string(),
  }),

  concern: z.object({
    dtcs: z.array(z.string()),
    symptom: z.string(),
    notes: z.string(),
  }),

  overview: BilingualText,

  disclaimers: BilingualText,

  safetyNotes: BilingualTextArray,

  specs: z.object({
    labeledAsEstimated: z.boolean(),
    items: z.array(
      z.object({
        name: BilingualText,
        expectedRange: z.string(),
        unit: z.string(),
        note: BilingualText,
        estimated: z.boolean(),
      })
    ),
  }),

  steps: z.array(
    z.object({
      id: z.string(),

      title: BilingualText,

      purpose: BilingualText,

      procedure: BilingualTextArray,

      connectorHints: z.array(
        z.object({
          label: BilingualText,
          test: BilingualText,
          expectedRange: z.string(),
          estimated: z.boolean(),
          notes: BilingualText,
        })
      ),

      passCriteria: BilingualTextArray,

      failCriteria: BilingualTextArray,

      nextOnPass: z.string().nullable(),

      nextOnFail: z.string().nullable(),
    })
  ),

  firstStepId: z.string(),

  sessionId: z.string(),
});

/* -------------------- */
/* TYPES               */
/* -------------------- */

export type DiagnosticInput = z.infer<typeof DiagnosticInputSchema>;
export type DiagnosticPlan = z.infer<typeof DiagnosticPlanSchema>;