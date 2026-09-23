import { z } from "zod";

// ==========================================
// PART 1: THE CANONICAL IR (System State)
// ==========================================

// Strict regex to prevent XSS / Prompt Injection in variable names
const IdentifierSchema = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
  message: "Identifiers must be alphanumeric and start with a letter or underscore.",
});

export const FieldSchema = z.object({
  name: IdentifierSchema,
  type: z.enum(["string", "number", "boolean", "uuid", "datetime", "json"]),
  nullable: z.boolean().default(false),
  unique: z.boolean().default(false),
  isPrimaryKey: z.boolean().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  permissions: z.record(z.array(z.string())).optional(),
});

export const EntitySchema = z.object({
  id: z.string().uuid().optional(), // Optional for AI generation, assigned by UI
  name: IdentifierSchema,
  fields: z.array(FieldSchema).default([]),
  seedData: z.array(z.record(z.any())).optional(),
});

export const RelationSchema = z.object({
  sourceEntity: IdentifierSchema,
  targetEntity: IdentifierSchema,
  sourceField: z.string().optional(),
  targetField: z.string().optional(),
  type: z.enum(["ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_MANY"]),
  cascadingDelete: z.boolean().default(false),
});

export const EnumSchema = z.object({
  name: IdentifierSchema,
  values: z.array(IdentifierSchema),
});

export const EndpointSchema = z.object({
  path: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "CRON_JOB", "WEBHOOK"]),
  targetEntity: IdentifierSchema.optional(),
  middlewares: z.array(z.string()).default([]),
});

export const ProjectConfigSchema = z.object({
  framework: z.enum(["nestjs", "express", "fastify"]),
  database: z.enum(["postgresql", "mysql"]),
  authProviders: z.array(z.enum(["jwt", "oauth_github", "oauth_google"])).default([]),
});

// NEW: Schema for raw SQL behavioral injections (Triggers, Functions, Procedures)
export const CustomSqlSnippetSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  targetEntity: IdentifierSchema.optional(),
  type: z.enum(["TRIGGER", "FUNCTION", "STORED_PROCEDURE", "RAW_MIGRATION"]),
  sql: z.string(),
  prompt: z.string(),
});

export const CanonicalIRSchema = z.object({
  config: ProjectConfigSchema,
  entities: z.array(EntitySchema),
  relations: z.array(RelationSchema),
  enums: z.array(EnumSchema),
  endpoints: z.array(EndpointSchema),
  customSql: z.array(CustomSqlSnippetSchema).optional(), // Added customSql bucket
});

// Export inferred types for the UI and Compiler
export type CanonicalIR = z.infer<typeof CanonicalIRSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Field = z.infer<typeof FieldSchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type Enum = z.infer<typeof EnumSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;
export type CustomSqlSnippet = z.infer<typeof CustomSqlSnippetSchema>; // Export the new type

// ==========================================
// PART 2: THE 16-ACTION DICTIONARY (LLM Sandbox)
// ==========================================

// Domain 1: Global
const UpdateProjectConfigAction = z.object({
  action: z.literal("UPDATE_PROJECT_CONFIG"),
  payload: ProjectConfigSchema.partial(),
});

// Domain 2: Entity
const AddEntityAction = z.object({
  action: z.literal("ADD_ENTITY"),
  payload: EntitySchema,
});
const RemoveEntityAction = z.object({
  action: z.literal("REMOVE_ENTITY"),
  targetEntity: IdentifierSchema,
});
const UpdateEntityAction = z.object({
  action: z.literal("UPDATE_ENTITY"),
  targetEntity: IdentifierSchema,
  payload: EntitySchema.partial(),
});

// Domain 3: Field
const AddFieldAction = z.object({
  action: z.literal("ADD_FIELD"),
  targetEntity: IdentifierSchema,
  payload: FieldSchema,
});
const RemoveFieldAction = z.object({
  action: z.literal("REMOVE_FIELD"),
  targetEntity: IdentifierSchema,
  targetField: IdentifierSchema,
});
const UpdateFieldAction = z.object({
  action: z.literal("UPDATE_FIELD"),
  targetEntity: IdentifierSchema,
  targetField: IdentifierSchema,
  payload: FieldSchema.partial(),
});

// Domain 4: Enums
const AddEnumAction = z.object({
  action: z.literal("ADD_ENUM"),
  payload: EnumSchema,
});
const RemoveEnumAction = z.object({
  action: z.literal("REMOVE_ENUM"),
  targetEnum: IdentifierSchema,
});
const UpdateEnumAction = z.object({
  action: z.literal("UPDATE_ENUM"),
  targetEnum: IdentifierSchema,
  payload: EnumSchema.partial(),
});

// Domain 5: Relations
const AddRelationAction = z.object({
  action: z.literal("ADD_RELATION"),
  payload: RelationSchema,
});
const RemoveRelationAction = z.object({
  action: z.literal("REMOVE_RELATION"),
  sourceEntity: IdentifierSchema,
  targetEntity: IdentifierSchema,
  sourceField: z.string().optional(),
  targetField: z.string().optional(),
});
const UpdateRelationAction = z.object({
  action: z.literal("UPDATE_RELATION"),
  sourceEntity: IdentifierSchema,
  targetEntity: IdentifierSchema,
  sourceField: z.string().optional(),
  targetField: z.string().optional(),
  payload: RelationSchema.partial(),
});

// Domain 6: Endpoints
const AddEndpointAction = z.object({
  action: z.literal("ADD_ENDPOINT"),
  payload: EndpointSchema,
});
const RemoveEndpointAction = z.object({
  action: z.literal("REMOVE_ENDPOINT"),
  targetPath: z.string(),
  targetMethod: z.string(),
});
const UpdateEndpointAction = z.object({
  action: z.literal("UPDATE_ENDPOINT"),
  targetPath: z.string(),
  targetMethod: z.string(),
  payload: EndpointSchema.partial(),
});

// ==========================================
// PART 3: THE AI PAYLOAD VALIDATOR
// ==========================================

export const MasterActionSchema = z.discriminatedUnion("action", [
  UpdateProjectConfigAction,
  AddEntityAction, RemoveEntityAction, UpdateEntityAction,
  AddFieldAction, RemoveFieldAction, UpdateFieldAction,
  AddEnumAction, RemoveEnumAction, UpdateEnumAction,
  AddRelationAction, RemoveRelationAction, UpdateRelationAction,
  AddEndpointAction, RemoveEndpointAction, UpdateEndpointAction,
]);

export const LLMResponseSchema = z.object({
  reasoning: z.string().describe("The AI must explain its logic before executing actions to prevent hallucinations."),
  actions: z.array(MasterActionSchema),
});

export type MasterAction = z.infer<typeof MasterActionSchema>;
export type LLMResponse = z.infer<typeof LLMResponseSchema>;