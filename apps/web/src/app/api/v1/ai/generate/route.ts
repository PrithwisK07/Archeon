import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import { LLMResponseSchema } from "@zero-dollar/ir-core";
import { createClient } from '@supabase/supabase-js';

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
5. CRITICAL INSTRUCTION: You are strictly forbidden from inventing new "action" strings. You must ONLY use the exact action strings provided in the MasterAction union type.

CRITICAL DIRECTIVE FOR CONVERSATIONS & ERRORS:
1. If the user asks a question, requests an explanation, or asks for advice, provide your detailed response in the "reasoning" field and return an EMPTY "actions" array ([]).
2. If the user prompt or the history contains a [SYSTEM ERROR FROM PREVIOUS ACTION], read the error carefully. Use the "reasoning" field to explain why your last patch violated the database constraints, and then emit the corrected JSON patch in the "actions" array. If it cannot be fixed, return an empty actions array and explain why.

MARKDOWN FORMATTING FOR REASONING:
1. The "reasoning" field must use concise Markdown when it improves readability.
2. Use Markdown headings, bullet lists, numbered lists, bold text, and inline code where appropriate.
3. Do not use Markdown code fences for the overall response. The outer response must remain valid JSON.
4. Keep the "actions" field as structured JSON objects only. Never place Markdown or conversational text inside the "actions" array.

Do not attempt to execute actions if you are merely answering a question.

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
          sourceField: { type: "STRING" },
          payload: { type: "OBJECT", nullable: true } // CRITICAL FIX: Payload defined here
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

async function generateWithGroq(messages: any[]): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b", 
    messages,
    response_format: { 
      type: "json_schema",
      json_schema: groqJsonSchema
    },
    stream: false
  });

  return completion.choices[0]?.message?.content || "";
}

async function generateWithGemini(messages: any[]): Promise<string> {
  // Format standard history messages to Gemini format
  let systemContent = "";
  const formattedContents = [];
  
  for (const msg of messages) {
    if (msg.role === "system") {
      systemContent += msg.content + "\n\n";
    } else {
      formattedContents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      });
    }
  }

  // Prepend the system prompt to the first user message if available
  if (systemContent && formattedContents.length > 0) {
    formattedContents[0].parts[0].text = systemContent + formattedContents[0].parts[0].text;
  } else if (systemContent) {
    formattedContents.push({ role: "user", parts: [{ text: systemContent }] });
  }

  const response = await geminiClient.models.generateContent({
    model: "gemini-3.6-flash",
    contents: formattedContents,
    config: {
      responseMimeType: "application/json",
      // @ts-ignore
      responseSchema: geminiResponseSchema
    }
  });

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
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return Response.json({ error: 'Missing or invalid authorization token' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } }
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized. Invalid session.' }, { status: 401 });
    }

    // Capture history from the payload
    const { prompt, contextMap, history = [], isVisionTask } = await req.json();

    let attempt = 0;
    const maxAttempts = 3;
    let lastError = "";

    // Build the core message chain
    const baseMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { 
        role: "user", 
        content: `CONTEXT:\n${JSON.stringify(contextMap)}\n\nUSER PROMPT:\n${prompt}` 
      }
    ];

    while (attempt < maxAttempts) {
      attempt++;
      try {
        let rawResponse = "";
        const currentMessages = [...baseMessages];
        
        // Inject feedback from Zod failures into the next LLM attempt
        if (attempt > 1 && lastError) {
          currentMessages.push({
            role: "user",
            content: `SYSTEM WARNING: Your previous output failed validation: ${lastError}. You MUST return strictly valid JSON matching the exact schema.`
          });
        }

        if (isVisionTask) {
          rawResponse = await generateWithGemini(currentMessages);
        } else {
          try {
            rawResponse = await generateWithGroq(currentMessages);
          } catch (err: any) {
            console.warn(`Groq failed (Attempt ${attempt}), falling back to Gemini...`, err.message);
            rawResponse = await generateWithGemini(currentMessages);
          }
        }

        const cleanText = rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();
        const repairedJSON = jsonrepair(cleanText);
        let parsedData = JSON.parse(repairedJSON);

        if (Array.isArray(parsedData)) {
          parsedData = { reasoning: "Applied complex structural changes based on prompt.", actions: parsedData };
        }

        const validatedLLMResponse = LLMResponseSchema.parse(parsedData);
        return NextResponse.json(validatedLLMResponse);
      } catch (error: any) {
        console.warn(`[Backend Retry ${attempt}/${maxAttempts}]:`, error.message);
        lastError = error.message;

        if (attempt >= maxAttempts) {
          return NextResponse.json(
            { error: "Failed to generate a valid architecture after multiple attempts.", details: error.message },
            { status: 422 }
          );
        }

        if (error.message.includes("429") || error.message.includes("fetch") || error.message.includes("Network")) {
          const backoffTime = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
        }
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