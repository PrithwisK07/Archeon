import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import { LLMResponseSchema } from "@zero-dollar/ir-core";

export const runtime = "edge";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const geminiClient = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY 
});

// ==========================================
// THE MASTER SYSTEM PROMPT
// ==========================================
const SYSTEM_PROMPT = `You are a strict, mathematical Architecture Backend Generation Engine.
Your ONLY purpose is to output JSON patches that modify a system architecture based on user requests.

RULES:
1. You must always output valid JSON matching the exact TypeScript schemas below.
2. Never output markdown formatting (no \`\`\`json).
3. Refer strictly to the provided Global Skeleton and Local Muscle contexts to avoid creating duplicates or targeting missing entities.
4. NEVER inject string comments or conversational text inside the "actions" array. Every element in the array MUST be an action object.
5. CRITICAL INSTRUCTION: You are strictly forbidden from inventing new "action" strings. You must ONLY use the exact action strings provided in the MasterAction union type (e.g., "ADD_ENTITY", "ADD_RELATION"). Do not use "ADD_TABLE" or "CREATE_RELATION".

// ==========================================
// REQUIRED OUTPUT SCHEMA
// ==========================================
export interface LLMResponse {
  reasoning: string; // Brief summary of the requested architecture changes
  actions: MasterAction[];
}

// ==========================================
// THE 16-ACTION DICTIONARY (MasterAction)
// ==========================================
type MasterAction = 
  // GLOBAL
  | { action: "UPDATE_PROJECT_CONFIG", payload: Partial<{ framework: string, database: string, authProviders: string[] }> }
  
  // ENTITY
  | { action: "ADD_ENTITY", payload: { name: string, fields: Field[] } }
  | { action: "REMOVE_ENTITY", targetEntity: string }
  | { action: "UPDATE_ENTITY", targetEntity: string, payload: Partial<{ name: string, fields: Field[] }> }
  
  // FIELD
  | { action: "ADD_FIELD", targetEntity: string, payload: Field }
  | { action: "REMOVE_FIELD", targetEntity: string, targetField: string }
  | { action: "UPDATE_FIELD", targetEntity: string, targetField: string, payload: Partial<Field> }
  
  // ENUM
  | { action: "ADD_ENUM", payload: { name: string, values: string[] } }
  | { action: "REMOVE_ENUM", targetEnum: string }
  | { action: "UPDATE_ENUM", targetEnum: string, payload: Partial<{ name: string, values: string[] }> }
  
  // RELATION
  | { action: "ADD_RELATION", payload: Relation }
  | { action: "REMOVE_RELATION", sourceEntity: string, targetEntity: string, sourceField?: string, targetField?: string }
  | { action: "UPDATE_RELATION", sourceEntity: string, targetEntity: string, sourceField?: string, targetField?: string, payload: Partial<Relation> }
  
  // ENDPOINT
  | { action: "ADD_ENDPOINT", payload: Endpoint }
  | { action: "REMOVE_ENDPOINT", targetPath: string, targetMethod: string }
  | { action: "UPDATE_ENDPOINT", targetPath: string, targetMethod: string, payload: Partial<Endpoint> };

// ==========================================
// DOMAIN TYPES
// ==========================================
interface Field {
  name: string;
  type: "string" | "number" | "boolean" | "uuid" | "datetime" | "json";
  nullable?: boolean;
  unique?: boolean;
  isPrimaryKey?: boolean;
  defaultValue?: string | number | boolean | null;
}

interface IndexConfig {
  fields: string[];
  unique?: boolean;
  type?: "BTree" | "Hash" | "GiST" | "GIN";
}

interface Entity {
  name: string;
  fields: Field[];
  indexes?: IndexConfig[];
  primaryKey?: string[];
}

interface Relation {
  sourceEntity: string;
  targetEntity: string;
  sourceField?: string;
  targetField?: string;
  type: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_MANY";
  onDelete?: "CASCADE" | "RESTRICT" | "SET NULL" | "SET DEFAULT";
  onUpdate?: "CASCADE" | "RESTRICT" | "SET NULL" | "SET DEFAULT";
}

interface Endpoint {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "CRON_JOB" | "WEBHOOK";
  targetEntity?: string;
}`;

// ==========================================
// NATIVE SCHEMA DEFINITIONS
// ==========================================
const baseActionProperties = {
  action: { type: "string" },
  targetEntity: { type: "string" },
  targetField: { type: "string" },
  targetEnum: { type: "string" },
  targetPath: { type: "string" },
  targetMethod: { type: "string" },
  sourceEntity: { type: "string" },
  sourceField: { type: "string" },
  payload: { 
    type: "object",
    properties: {
      name: { type: "string" },
      fields: { type: "array" },
      indexes: { type: "array" },
      primaryKey: { type: "array" },
      sourceEntity: { type: "string" },
      targetEntity: { type: "string" },
      sourceField: { type: "string" },
      targetField: { type: "string" },
      type: { type: "string" },
      onDelete: { type: "string" },
      onUpdate: { type: "string" }
    }
  }
};

const groqJsonSchema = {
  name: "architecture_patch",
  strict: false, 
  schema: {
    type: "object",
    properties: {
      reasoning: { type: "string" },
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: baseActionProperties,
          required: ["action"]
        }
      }
    },
    required: ["reasoning", "actions"]
  }
};

const geminiResponseSchema = {
  type: "OBJECT",
  properties: {
    reasoning: { type: "STRING" },
    actions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          action: { type: "STRING" },
          targetEntity: { type: "STRING" },
          targetField: { type: "STRING" },
          targetEnum: { type: "STRING" },
          targetPath: { type: "STRING" },
          targetMethod: { type: "STRING" },
          sourceEntity: { type: "STRING" },
          sourceField: { type: "STRING" }
        },
        required: ["action"]
      }
    }
  },
  required: ["reasoning", "actions"]
};

// ==========================================
// NON-STREAMING LLM CALLS
// ==========================================

async function generateWithGroq(promptText: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b", 
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: promptText },
    ],
    response_format: { 
      type: "json_schema",
      json_schema: groqJsonSchema
    },
    stream: false
  });

  return completion.choices[0]?.message?.content || "";
}

async function generateWithGemini(promptText: string): Promise<string> {
  const response = await geminiClient.models.generateContent({
    model: "gemini-3.6-flash",
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + promptText }] }
    ],
    config: {
      responseMimeType: "application/json",
      // @ts-ignore - The SDK types might lag behind the API capabilities for responseSchema
      responseSchema: geminiResponseSchema
    }
  });

  // Ensure we safely handle the text output
  if (!response || !response.text) {
    throw new Error("Gemini returned an empty response.");
  }
  
  return response.text;
}

// ==========================================
// MAIN GATEWAY LOGIC (The Autonomous Loop)
// ==========================================
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { prompt, contextMap, isVisionTask } = await req.json();

    let attempt = 0;
    const maxAttempts = 3;

    // Initial combined prompt
    let internalPrompt = `CONTEXT:\n${JSON.stringify(contextMap)}\n\nUSER PROMPT:\n${prompt}`;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        let rawResponse = "";

        // 1. Fetch raw output with built-in provider fallback
        if (isVisionTask) {
          rawResponse = await generateWithGemini(internalPrompt);
        } else {
          try {
            rawResponse = await generateWithGroq(internalPrompt);
          } catch (err: any) {
            console.warn(
              `Groq failed (Attempt ${attempt}), falling back to Gemini...`,
              err.message
            );
            rawResponse = await generateWithGemini(internalPrompt);
          }
        }

        // 2. Clean and Repair JSON
        const cleanText = rawResponse
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();

        const repairedJSON = jsonrepair(cleanText);
        let parsedData = JSON.parse(repairedJSON);

        // 3. Auto-correct root array hallucinations structurally
        if (Array.isArray(parsedData)) {
          parsedData = {
            reasoning: "Applied complex structural changes based on prompt.",
            actions: parsedData,
          };
        }

        // 4. The Zod Gauntlet
        const validatedLLMResponse = LLMResponseSchema.parse(parsedData);

        // 5. Success! Return perfectly validated JSON back to the client
        return NextResponse.json(validatedLLMResponse);
      } catch (error: any) {
        console.warn(
          `[Backend Retry ${attempt}/${maxAttempts}]:`,
          error.message
        );

        // If we've exhausted retries, throw the final error to the client boundary
        if (attempt >= maxAttempts) {
          return NextResponse.json(
            {
              error: "Failed to generate a valid architecture after multiple attempts.",
              details: error.message,
            },
            { status: 422 }
          );
        }

        // Engage exponential backoff if the error was network/rate-limit related
        if (
          error.message.includes("429") ||
          error.message.includes("fetch") ||
          error.message.includes("Network")
        ) {
          const backoffTime = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
        }

        // Modify the prompt for the next attempt by injecting the Zod validation failure
        internalPrompt += `\n\nSYSTEM WARNING: Your previous output failed validation: ${error.message}. You MUST return strictly valid JSON matching the exact schema.`;
      }
    }
  } catch (error: any) {
    console.error("Gateway Error:", error);
    return NextResponse.json(
      { error: "Internal Gateway Error", details: error.message },
      { status: 500 }
    );
  }
}