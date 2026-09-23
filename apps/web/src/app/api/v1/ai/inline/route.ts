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

const INLINE_SYSTEM_PROMPT = `You are an elite TypeScript backend engineer. 

Your task is to generate EXACTLY the code requested to be inserted into the user's current file.

RULES:

1. Output ONLY the raw code snippet. 

2. Do NOT wrap the code in markdown blocks (e.g., no \`\`\`typescript).

3. Do NOT include greetings, explanations, or conversational filler.

4. Use the provided CanonicalIR schema context to ensure exact table and column names.

5. Assume the context is a Node.js/Express environment using Prisma.`;

async function generateWithGroq(promptText: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      {
        role: "system",
        content: INLINE_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: promptText,
      },
    ],
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
            text: INLINE_SYSTEM_PROMPT + "\n\n" + promptText,
          },
        ],
      },
    ],
  });

  if (!response || !response.text) {
    throw new Error("Gemini returned an empty response.");
  }

  return response.text;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { prompt, currentFileContent, schemaContext } = await req.json();

    let attempt = 0;
    const maxAttempts = 3;

    let internalPrompt = `SCHEMA CONTEXT:
${JSON.stringify(schemaContext, null, 2)}

CURRENT FILE CONTENT:
${currentFileContent}

USER REQUEST (Generate the code to insert here):
${prompt}`;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        let generatedCode = "";

        // 1. Try Groq first, then gracefully fall back to Gemini
        try {
          generatedCode = await generateWithGroq(internalPrompt);
        } catch (err: any) {
          console.warn(
            `Groq failed (Attempt ${attempt}), falling back to Gemini...`,
            err.message
          );

          generatedCode = await generateWithGemini(internalPrompt);
        }

        // 2. Strip markdown formatting if the LLM disobeys the prompt
        generatedCode = generatedCode
          .replace(/^```[\w]*\n/m, "")
          .replace(/```$/m, "")
          .trim();

        // 3. Make sure we actually received generated code
        if (!generatedCode) {
          throw new Error("AI returned an empty code response.");
        }

        return NextResponse.json({
          code: generatedCode,
        });
      } catch (error: any) {
        console.warn(
          `[Inline AI Retry ${attempt}/${maxAttempts}]:`,
          error.message
        );

        // If we've exhausted retries, return the final error
        if (attempt >= maxAttempts) {
          return NextResponse.json(
            {
              error: "Failed to generate code after multiple attempts.",
              details: error.message,
            },
            { status: 422 }
          );
        }

        // Exponential backoff for network/rate-limit failures
        if (
          error.message?.includes("429") ||
          error.message?.includes("fetch") ||
          error.message?.includes("Network")
        ) {
          const backoffTime = Math.pow(2, attempt) * 1000;

          await new Promise((resolve) =>
            setTimeout(resolve, backoffTime)
          );
        }

        // Give the next attempt additional context about the failure
        internalPrompt += `

SYSTEM WARNING: Your previous generation attempt failed with the following error:
${error.message}

You MUST return only the raw TypeScript/JavaScript code requested by the user.`;
      }
    }
  } catch (error: any) {
    console.error("Inline AI Gateway Error:", error);

    return NextResponse.json(
      {
        error: "Internal AI Gateway Error",
        details: error.message,
      },
      { status: 500 }
    );
  }
}