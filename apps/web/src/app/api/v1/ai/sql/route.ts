import { NextRequest, NextResponse } from "next/server";

import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";

export const runtime = "edge";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const geminiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SQL_SYSTEM_PROMPT = `You are a strict, expert PostgreSQL Database Administrator.

Your task is to write raw, execution-ready PL/pgSQL code (Triggers, Functions, or CTEs) based on the provided JSON schema context.

RULES:

1. ONLY output valid SQL.

2. DO NOT wrap the output in markdown formatting (no \`\`\`sql).

3. DO NOT include conversational text, greetings, or explanations.

4. Use double quotes for exact table and column names (e.g., "User", "createdAt") to match Prisma's case-sensitive compilation.

5. If writing a trigger, always generate the FUNCTION first, followed by the TRIGGER.`;


// ==========================================
// NON-STREAMING LLM CALLS
// ==========================================

async function generateWithGroq(promptText: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",

    messages: [
      {
        role: "system",
        content: SQL_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: promptText,
      },
    ],

    // We want raw SQL, not structured JSON
    stream: false,
  });

  return completion.choices[0]?.message?.content || "";
}


async function generateWithGemini(promptText: string): Promise<string> {
  const response = await geminiClient.models.generateContent({
    model: "gemini-3.6-flash",

    contents: [
      {
        role: "user",
        parts: [
          {
            text: SQL_SYSTEM_PROMPT + "\n\n" + promptText,
          },
        ],
      },
    ],

    config: {
      responseMimeType: "text/plain",
    },
  });

  if (!response || !response.text) {
    throw new Error("Gemini returned an empty response.");
  }

  return response.text;
}


// ==========================================
// MAIN SQL GENERATION GATEWAY
// ==========================================

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { prompt, targetEntitySchema } = await req.json();

    const internalPrompt = `TARGET ENTITY SCHEMA:
${JSON.stringify(targetEntitySchema, null, 2)}

USER REQUEST:
${prompt}`;

    let rawSql = "";

    // ==========================================
    // 1. GROQ → GEMINI FALLBACK
    // ==========================================

    try {
      rawSql = await generateWithGroq(internalPrompt);
    } catch (err: any) {
      console.warn(
        "Groq failed, falling back to Gemini...",
        err.message
      );

      rawSql = await generateWithGemini(internalPrompt);
    }


    // ==========================================
    // 2. SANITIZE LLM OUTPUT
    // ==========================================

    rawSql = rawSql
      .replace(/```sql/g, "")
      .replace(/```/g, "")
      .trim();


    // ==========================================
    // 3. RETURN SQL
    // ==========================================

    return NextResponse.json({
      sql: rawSql,
    });

  } catch (error: any) {
    console.error("SQL Generation Error:", error);

    return NextResponse.json(
      {
        error: "Failed to generate SQL",
        details: error.message,
      },
      { status: 500 }
    );
  }
}