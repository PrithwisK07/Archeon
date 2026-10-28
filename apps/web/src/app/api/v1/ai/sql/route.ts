import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

Your task is to write raw, execution-ready PL/pgSQL code (Triggers, Functions, Procedures, or CTEs) based on the provided JSON schema context.

RULES:
1. ONLY output valid SQL.
2. DO NOT wrap the output in markdown formatting (no \`\`\`sql).
3. DO NOT include conversational text, greetings, or explanations.
4. Use double quotes for exact table and column names (e.g., "User", "createdAt") to match Prisma's case-sensitive compilation.
5. If writing a trigger, always generate the FUNCTION first, followed by the TRIGGER.
6. MODERN SYNTAX ONLY: For procedures, strictly use PostgreSQL 11+ \`CREATE PROCEDURE\` syntax. Do NOT use older \`CREATE FUNCTION ... RETURNS void\` workarounds.
7. EXACT NAMING: You MUST name the function, procedure, or trigger EXACTLY as requested in the user's prompt. Do not invent your own semantic names.

CRITICAL DIRECTIVE FOR CONVERSATIONS & ERRORS:
If the history contains a [SYSTEM ERROR FROM PREVIOUS ACTION], read the error carefully. Ensure your new SQL fixes the syntax or logic error reported from your previous attempt.`;

// ==========================================
// NON-STREAMING LLM CALLS
// ==========================================

async function generateWithGroq(messages: any[]): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: messages,
    // We want raw SQL, not structured JSON
    stream: false,
  });

  return completion.choices[0]?.message?.content || "";
}


async function generateWithGemini(systemPrompt: string, history: any[], userPrompt: string): Promise<string> {
  // Map standard OpenAI roles to Gemini roles
  const contents = history.map((msg: any) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  // Append the latest user prompt
  contents.push({
    role: "user",
    parts: [{ text: userPrompt }],
  });

  const response = await geminiClient.models.generateContent({
    model: "gemini-3.6-flash",
    contents: contents,
    config: {
      systemInstruction: { parts: [{ text: systemPrompt }] },
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return Response.json({ error: 'Missing or invalid authorization token' }, { status: 401 });
    }
    
    // Instantiate supabase client with the user's JWT
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } }
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized. Invalid session.' }, { status: 401 });
    }

    const { prompt, targetEntitySchema, history = [] } = await req.json();

    const internalPrompt = `TARGET ENTITY SCHEMA:
${JSON.stringify(targetEntitySchema, null, 2)}

USER REQUEST:
${prompt}`;

    const groqMessages = [
      { role: "system", content: SQL_SYSTEM_PROMPT },
      ...history,
      { role: "user", content: internalPrompt }
    ];

    let rawSql = "";

    // ==========================================
    // 1. GROQ → GEMINI FALLBACK
    // ==========================================

    try {
      rawSql = await generateWithGroq(groqMessages);
    } catch (err: any) {
      console.warn(
        "Groq failed, falling back to Gemini...",
        err.message
      );

      rawSql = await generateWithGemini(SQL_SYSTEM_PROMPT, history, internalPrompt);
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