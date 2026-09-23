import { expose } from 'comlink';
import { Project, ScriptKind, StructureKind } from 'ts-morph';
import type { CanonicalIR, Entity, Relation } from '@zero-dollar/ir-core';

export class CompilerWorker {
  /**
   * @param ir The pure architectural state
   * @param existingFiles The current virtual file system (developer files) to be preserved
   */
  public async compileIRToCode(ir: CanonicalIR, existingFiles: Record<string, string> = {}): Promise<Record<string, string>> {
    const project = new Project({ useInMemoryFileSystem: true });
    
    // 0. Pre-load existing developer files to preserve the Generation Gap
    for (const [filePath, content] of Object.entries(existingFiles)) {
      project.createSourceFile(filePath, content);
    }

    // 1. Generate Infrastructure
    this.generateProjectConfig(project);
    
    // 2. Generate Prisma ORM Schema
    this.generatePrismaSchema(project, ir);

    // NEW: Inject Custom SQL Migrations (Triggers, Procedures, Behavioral SQL)
    this.generateCustomSqlMigrations(project, ir);
    
    // 3. Implement the Generation Gap Pattern for Entities and Routes
    for (const entity of ir.entities) {
      // Data Layer
      this.generateBaseEntity(project, entity, ir.relations);
      this.generateExtensionEntity(project, entity);
      
      // Transport Layer (REST APIs)
      this.generateBaseRoutes(project, entity);
      this.generateExtensionRoutes(project, entity);
    }

    // 4. Generate the Express Server entry point
    this.generateExpressServer(project, ir);

    // 5. Extract generated code
    const outputFiles: Record<string, string> = {};
    const fs = project.getFileSystem();
    
    let virtualRoot: string = fs.getCurrentDirectory(); 
    if (!virtualRoot.endsWith("/")) {
      virtualRoot += "/";
    }

    for (const sourceFile of project.getSourceFiles()) {
      let filePath: string = sourceFile.getFilePath();
      filePath = filePath.replace(/\\/g, "/");
      
      if (filePath.startsWith(virtualRoot)) {
        filePath = filePath.substring(virtualRoot.length);
      }
      outputFiles[filePath] = sourceFile.getFullText();
      
      // OOM Protection
      project.removeSourceFile(sourceFile);
    }

    return outputFiles;
  }

  private generateProjectConfig(project: Project) {
    const packageJson = {
      name: "zero-dollar-backend",
      version: "1.0.0",
      private: true,
      scripts: {
        "dev": "ts-node src/index.ts",
        "build": "tsc",
        "db:generate": "prisma generate",
        "db:push": "prisma db push"
      },
      dependencies: {
        "@prisma/client": "^5.0.0",
        "express": "^4.18.2"
      },
      devDependencies: {
        "prisma": "^5.0.0",
        "typescript": "^5.0.0",
        "@types/express": "^4.17.17",
        "ts-node": "^10.9.1"
      }
    };

    project.createSourceFile("package.json", JSON.stringify(packageJson, null, 2), { overwrite: true, scriptKind: ScriptKind.JSON });
    // Generate .env.example to avoid destroying the developer's actual local configuration
    project.createSourceFile(".env.example", `DATABASE_URL="postgresql://postgres:password@localhost:5432/mydb?schema=public"\nPORT=3000`, { overwrite: true, scriptKind: ScriptKind.Unknown });
  }

  private generatePrismaSchema(project: Project, ir: CanonicalIR) {
    let schema = `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\n`;

    for (const entity of ir.entities) {
      schema += `model ${entity.name} {\n`;
      
      let hasId = false;
      
      // 1. Generate standard fields
      for (const field of entity.fields) {
        // Respect the explicit isPrimaryKey boolean
        const isPk = field.name === 'id' || field.isPrimaryKey;
        if (isPk) hasId = true;
        
        let typeStr = "String";
        if (field.type === "number") typeStr = "Int";
        else if (field.type === "boolean") typeStr = "Boolean";
        else if (field.type === "datetime") typeStr = "DateTime";
        else if (field.type === "json") typeStr = "Json";
        
        const pkAttr = isPk ? (field.type === 'uuid' ? ' @id @default(uuid())' : ' @id') : '';
        
        // SMART RESOLUTION 1: Force @unique if this field is acting as a 1:1 Foreign Key
        const isOneToOneFk = ir.relations.some(r => 
          r.targetEntity === entity.name && 
          r.type === 'ONE_TO_ONE' && 
          (r.targetField === field.name || (!r.targetField && field.name === `${r.sourceEntity.toLowerCase()}Id`))
        );
        const uniqueAttr = (field.unique || isOneToOneFk) && !isPk ? ' @unique' : '';
        
        const isNullable = field.nullable ? '?' : '';
        
        // Implement Default Values
        let defaultAttr = '';
        if (field.defaultValue !== undefined && field.defaultValue !== null) {
          if (field.type === 'string' || field.type === 'uuid') {
            defaultAttr = ` @default("${field.defaultValue}")`;
          } else {
            defaultAttr = ` @default(${field.defaultValue})`;
          }
        }
        
        schema += `  ${field.name} ${typeStr}${isNullable}${pkAttr}${uniqueAttr}${defaultAttr}\n`;
      }
      
      if (!hasId) {
        schema += `  id String @id @default(uuid())\n`;
      }

      // 2. Outgoing Relations (Source side)
      const outgoingRels = ir.relations
        .map((r, i) => ({ ...r, index: i }))
        .filter(r => r.sourceEntity === entity.name);
      
      for (const rel of outgoingRels) {
        const relName = `Rel_${rel.sourceEntity}_${rel.targetEntity}_${rel.index}`;
        const propBase = `${rel.targetEntity.toLowerCase()}`;
        
        if (rel.type === "ONE_TO_MANY" || rel.type === "MANY_TO_MANY") {
          schema += `  ${propBase}s_${rel.index} ${rel.targetEntity}[] @relation("${relName}")\n`;
        } else if (rel.type === "ONE_TO_ONE") {
          schema += `  ${propBase}_${rel.index} ${rel.targetEntity}? @relation("${relName}")\n`;
        }
      }

      // 3. Incoming Relations (Target side holding the Foreign Key)
      const incomingRels = ir.relations
        .map((r, i) => ({ ...r, index: i }))
        .filter(r => r.targetEntity === entity.name);

      for (const rel of incomingRels) {
        const relName = `Rel_${rel.sourceEntity}_${rel.targetEntity}_${rel.index}`;
        
        // M:N Implicit Relation: The target simply gets an array back to the source. No scalar FK needed.
        if (rel.type === "MANY_TO_MANY") {
          const propBase = `${rel.sourceEntity.toLowerCase()}`;
          schema += `  ${propBase}s_${rel.index} ${rel.sourceEntity}[] @relation("${relName}")\n`;
          continue;
        }

        const propBase = `${rel.sourceEntity.toLowerCase()}_${rel.index}`;
        
        // SMART RESOLUTION 2: Auto-infer conventional FKs (e.g. storeId) if LLM forgot targetField
        let fkProp = rel.targetField;
        if (!fkProp) {
          const conventionalFk = `${rel.sourceEntity.toLowerCase()}Id`;
          if (entity.fields.some(f => f.name === conventionalFk)) {
            fkProp = conventionalFk;
          } else {
            fkProp = `${propBase}Id`;
          }
        }
        const refProp = rel.sourceField || 'id';

        // Avoid double-generating the scalar FK field if it was already generated in the field loop above
        const fieldAlreadyExists = entity.fields.some(f => f.name === fkProp);

        if (!fieldAlreadyExists) {
          if (rel.type === "ONE_TO_MANY") {
            schema += `  ${fkProp} String\n`;
          } else if (rel.type === "ONE_TO_ONE") {
            schema += `  ${fkProp} String @unique\n`;
          }
        }

        schema += `  ${propBase} ${rel.sourceEntity} @relation("${relName}", fields: [${fkProp}], references: [${refProp}])\n`;
      }

      schema += `}\n\n`;
    }

    project.createSourceFile("prisma/schema.prisma", schema, { overwrite: true, scriptKind: ScriptKind.Unknown });
  }

  private generateCustomSqlMigrations(project: Project, ir: CanonicalIR) {
    // If there is no custom SQL, skip generation
    if (!ir.customSql || ir.customSql.length === 0) return;

    let sqlContent = `-- Custom SQL Behavioral Logic Generated by Zero-Dollar IDE\n\n`;

    for (const snippet of ir.customSql) {
      sqlContent += `-- ==========================================\n`;
      sqlContent += `-- [${snippet.type}] ${snippet.name}\n`;
      if (snippet.targetEntity) {
        sqlContent += `-- Target: "${snippet.targetEntity}"\n`;
      }
      sqlContent += `-- ==========================================\n\n`;
      sqlContent += `${snippet.sql}\n\n`;
    }

    // Prisma natively runs migration.sql files in this directory structure when executing `prisma migrate dev` or deploy
    project.createSourceFile(
      `prisma/migrations/0_custom_behavior_injections/migration.sql`, 
      sqlContent, 
      { overwrite: true }
    );
  }

  private generateBaseEntity(project: Project, entity: Entity, relations: Relation[]) {
    const properties: any[] = [];
    const referencedEntities = new Set<string>(); // Tracks entities to import
    
    let hasId = false;
    for (const field of entity.fields) {
      if (field.name === 'id' || field.isPrimaryKey) hasId = true;
      properties.push({
        name: field.name,
        type: field.type === 'datetime' ? 'Date' : (field.type === 'uuid' ? 'string' : (field.type === 'json' ? 'any' : field.type)),
        hasQuestionToken: field.nullable,
        kind: StructureKind.Property
      });
    }
    
    if (!hasId) {
      properties.unshift({
        name: 'id',
        type: 'string',
        hasQuestionToken: false,
        kind: StructureKind.Property
      });
    }

    const outgoingRels = relations.map((r, i) => ({ ...r, index: i })).filter(r => r.sourceEntity === entity.name);
    const incomingRels = relations.map((r, i) => ({ ...r, index: i })).filter(r => r.targetEntity === entity.name);

    for (const rel of outgoingRels) {
      referencedEntities.add(rel.targetEntity);
      
      const propBase = `${rel.targetEntity.toLowerCase()}`;
      if (rel.type === "ONE_TO_MANY" || rel.type === "MANY_TO_MANY") {
        properties.push({
          name: `${propBase}s_${rel.index}`,
          type: `${rel.targetEntity}[]`,
          hasQuestionToken: false,
          initializer: '[]',
          kind: StructureKind.Property
        });
      } else if (rel.type === "ONE_TO_ONE") {
        properties.push({
          name: `${propBase}_${rel.index}`,
          type: rel.targetEntity,
          hasQuestionToken: true,
          kind: StructureKind.Property
        });
      }
    }

    for (const rel of incomingRels) {
      referencedEntities.add(rel.sourceEntity);
      
      if (rel.type === "MANY_TO_MANY") {
        const propBase = `${rel.sourceEntity.toLowerCase()}`;
        properties.push({
          name: `${propBase}s_${rel.index}`,
          type: `${rel.sourceEntity}[]`,
          hasQuestionToken: false,
          initializer: '[]',
          kind: StructureKind.Property
        });
        continue;
      }
      
      const propBase = `${rel.sourceEntity.toLowerCase()}_${rel.index}`;
      
      let fkProp = rel.targetField;
      if (!fkProp) {
        const conventionalFk = `${rel.sourceEntity.toLowerCase()}Id`;
        if (entity.fields.some(f => f.name === conventionalFk)) {
          fkProp = conventionalFk;
        } else {
          fkProp = `${propBase}Id`;
        }
      }

      const fieldAlreadyExists = entity.fields.some(f => f.name === fkProp);
      if (!fieldAlreadyExists) {
        properties.push({
          name: fkProp,
          type: 'string',
          hasQuestionToken: false,
          kind: StructureKind.Property
        });
      }

      properties.push({
        name: propBase,
        type: rel.sourceEntity,
        hasQuestionToken: rel.type === "ONE_TO_ONE", 
        kind: StructureKind.Property
      });
    }

    // AST Import Resolver: Generate imports for all referenced extension classes
    referencedEntities.delete(entity.name); // Prevent self-imports
    const imports = Array.from(referencedEntities).map(ref => ({
      kind: StructureKind.ImportDeclaration as const,
      namedImports: [ref],
      moduleSpecifier: `../${ref}`
    }));

    project.createSourceFile(`src/entities/base/_Base${entity.name}.ts`, {
      statements: [
        ...imports,
        {
          kind: StructureKind.Class,
          isExported: true,
          isAbstract: true,
          name: `_Base${entity.name}`,
          properties,
          docs: ["// AUTO-GENERATED BASE CLASS. DO NOT MODIFY DIRECTLY.\n// Use the extension class to add custom domain logic."]
        }
      ]
    }, { overwrite: true }); 
  }

  private generateExtensionEntity(project: Project, entity: Entity) {
    const extPath = `src/entities/${entity.name}.ts`;
    
    if (!project.getSourceFile(extPath)) {
      project.createSourceFile(extPath, {
        statements: [
          {
            kind: StructureKind.ImportDeclaration,
            namedImports: [`_Base${entity.name}`],
            moduleSpecifier: `./base/_Base${entity.name}`
          },
          {
            kind: StructureKind.Class,
            isExported: true,
            name: entity.name,
            extends: `_Base${entity.name}`,
            docs: ["// EXTENSION CLASS\n// You may safely add custom business logic and methods here.\n// This file will not be overwritten by the compiler if it already exists."]
          }
        ]
      }, { overwrite: false });
    }
  }

  private generateBaseRoutes(project: Project, entity: Entity) {
    const lowerName = entity.name.toLowerCase();
    const code = `import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const _base${entity.name}Router = Router();

// AUTO-GENERATED CRUD ROUTES. DO NOT MODIFY.
_base${entity.name}Router.get('/', async (req, res) => {
  try {
    const records = await prisma.${lowerName}.findMany();
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

_base${entity.name}Router.get('/:id', async (req, res) => {
  try {
    const record = await prisma.${lowerName}.findUnique({ where: { id: req.params.id } });
    if (!record) return res.status(404).json({ error: 'Not Found' });
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

_base${entity.name}Router.post('/', async (req, res) => {
  try {
    const record = await prisma.${lowerName}.create({ data: req.body });
    res.status(201).json(record);
  } catch (error) {
    res.status(400).json({ error: 'Bad Request' });
  }
});

_base${entity.name}Router.delete('/:id', async (req, res) => {
  try {
    await prisma.${lowerName}.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: 'Bad Request' });
  }
});
`;
    project.createSourceFile(`src/routes/base/_Base${entity.name}Routes.ts`, code, { overwrite: true });
  }

  private generateExtensionRoutes(project: Project, entity: Entity) {
    const extPath = `src/routes/${entity.name}Routes.ts`;
    
    if (!project.getSourceFile(extPath)) {
      const code = `import { Router } from 'express';
import { _base${entity.name}Router } from './base/_Base${entity.name}Routes';

export const ${entity.name.toLowerCase()}Router = Router();

// EXTENSION ROUTER
// Add custom middleware, overrides, or new endpoints here.
// e.g., ${entity.name.toLowerCase()}Router.get('/custom/search', (req, res) => { ... });

// Mount the auto-generated CRUD routes
${entity.name.toLowerCase()}Router.use('/', _base${entity.name}Router);
`;
      project.createSourceFile(extPath, code, { overwrite: false });
    }
  }

  private generateExpressServer(project: Project, ir: CanonicalIR) {
    let imports = `import express from 'express';\n`;
    let mounts = `\n`;

    for (const entity of ir.entities) {
      const routeName = `${entity.name.toLowerCase()}Router`;
      imports += `import { ${routeName} } from './routes/${entity.name}Routes';\n`;
      mounts += `app.use('/api/v1/${entity.name.toLowerCase()}s', ${routeName});\n`;
    }

    const serverCode = `${imports}
const app = express();
app.use(express.json());

${mounts}
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(\`Server is running on http://localhost:\${PORT}\`);
});
`;
    project.createSourceFile(`src/index.ts`, serverCode, { overwrite: true });
  }
}

expose(new CompilerWorker());