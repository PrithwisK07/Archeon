import type { CanonicalIR, Entity, Endpoint } from "@zero-dollar/ir-core";

export class OpenApiGenerator {
  public static generateSpec(ir: CanonicalIR) {
    const spec: any = {
      openapi: "3.0.0",
      info: {
        title: "Zero-Dollar Generated API",
        version: "1.0.0",
        description: "Auto-generated OpenAPI specification based on visual topology."
      },
      paths: {},
      components: { schemas: {} }
    };

    // 1. Generate Component Schemas
    ir.entities.forEach(entity => {
      spec.components.schemas[entity.name] = this.buildEntitySchema(entity);
    });

    // 2. Generate Base CRUD Paths
    ir.entities.forEach(entity => {
      const routeBase = `/${entity.name.toLowerCase()}`;
      
      spec.paths[routeBase] = {
        get: {
          summary: `Get all ${entity.name}s`,
          tags: [entity.name],
          responses: { "200": { description: "Success", content: { "application/json": { schema: { type: "array", items: { $ref: `#/components/schemas/${entity.name}` } } } } } }
        },
        post: {
          summary: `Create a ${entity.name}`,
          tags: [entity.name],
          requestBody: { content: { "application/json": { schema: { $ref: `#/components/schemas/${entity.name}` } } } },
          responses: { "201": { description: "Created" } }
        }
      };

      spec.paths[`${routeBase}/{id}`] = {
        get: {
          summary: `Get ${entity.name} by ID`,
          tags: [entity.name],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Success", content: { "application/json": { schema: { $ref: `#/components/schemas/${entity.name}` } } } } }
        },
        put: {
          summary: `Update ${entity.name}`,
          tags: [entity.name],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { content: { "application/json": { schema: { $ref: `#/components/schemas/${entity.name}` } } } },
          responses: { "200": { description: "Updated" } }
        },
        delete: {
          summary: `Delete ${entity.name}`,
          tags: [entity.name],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "204": { description: "Deleted" } }
        }
      };
    });

    // 3. Inject Custom Endpoints (if any exist in CanonicalIR)
    ir.endpoints.forEach(endpoint => {
      if (!spec.paths[endpoint.path]) spec.paths[endpoint.path] = {};
      const method = endpoint.method.toLowerCase();
      
      // Skip CRON_JOB and WEBHOOK as they aren't standard REST paths
      if (method === 'cron_job' || method === 'webhook') return;
      
      spec.paths[endpoint.path][method] = {
        summary: `Custom ${endpoint.method} Route`,
        tags: [endpoint.targetEntity || "Custom"],
        responses: { "200": { description: "Success" } }
      };
    });

    return spec;
  }

  private static buildEntitySchema(entity: Entity) {
    const schema: any = { type: "object", properties: {}, required: [] };
    
    entity.fields.forEach(field => {
      let swaggerType = "string";
      if (field.type === "number") swaggerType = "number";
      if (field.type === "boolean") swaggerType = "boolean";
      if (field.type === "json") swaggerType = "object";
      
      schema.properties[field.name] = { type: swaggerType };
      if (!field.nullable && field.defaultValue === undefined) {
        schema.required.push(field.name);
      }
    });

    if (schema.required.length === 0) delete schema.required;
    return schema;
  }
}