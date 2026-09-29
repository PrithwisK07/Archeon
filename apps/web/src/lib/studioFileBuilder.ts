import type { CanonicalIR } from '@zero-dollar/ir-core';

export interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
}

/**
 * Builds a clean, realistic file map immediately from CanonicalIR
 * and merges any custom/compiled files from the Web Worker.
 */
export function buildStudioFileMap(
  ir: CanonicalIR,
  compiledFiles: Record<string, string> | null
): Record<string, string> {
  const files: Record<string, string> = {};

  // 1. Prisma Schema (supports single @id, composite @@id, @@unique, and @@index)
  let prismaCode = `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\n`;
  for (const entity of ir.entities) {
    prismaCode += `model ${entity.name} {\n`;

    const pkFieldNames = entity.fields
      .filter((f) => f.isPrimaryKey ?? f.name === 'id')
      .map((f) => f.name);
    const isCompositePk = pkFieldNames.length > 1;

    for (const f of entity.fields) {
      const pType =
        f.type === 'number'
          ? 'Int'
          : f.type === 'boolean'
          ? 'Boolean'
          : f.type === 'datetime'
          ? 'DateTime'
          : f.type === 'json'
          ? 'Json'
          : 'String';

      const isPkField = f.isPrimaryKey ?? f.name === 'id';
      const pk =
        !isCompositePk && isPkField
          ? f.type === 'uuid'
            ? ' @id @default(uuid())'
            : ' @id'
          : '';
      const uq = f.unique && !pk ? ' @unique' : '';
      const opt = f.nullable && !isPkField ? '?' : '';
      prismaCode += `  ${f.name} ${pType}${opt}${pk}${uq}\n`;
    }

    if (isCompositePk) {
      prismaCode += `\n  @@id([${pkFieldNames.join(', ')}])\n`;
    }

    if (entity.indexes && entity.indexes.length > 0) {
      for (const idx of entity.indexes) {
        if (!idx.fields || idx.fields.length === 0) continue;
        const directive = idx.unique ? '@@unique' : '@@index';
        prismaCode += `  ${directive}([${idx.fields.join(', ')}])\n`;
      }
    }

    prismaCode += `}\n\n`;
  }
  files['prisma/schema.prisma'] =
    compiledFiles?.['prisma/schema.prisma'] || prismaCode.trimEnd();

  if (compiledFiles?.['prisma/migrations/0_custom_behavior_injections/migration.sql']) {
    files['prisma/migrations/migration.sql'] =
      compiledFiles['prisma/migrations/0_custom_behavior_injections/migration.sql'];
  }

// 2. Server Entry & Prisma Client Lib
  const entityImports = ir.entities
    .map(
      (e) =>
        `import { ${e.name.toLowerCase()}Router } from "./routes/${e.name.toLowerCase()}.routes";`
    )
    .join('\n');
  const entityMounts = ir.entities
    .map(
      (e) => `app.use("/v1/${e.name.toLowerCase()}", ${e.name.toLowerCase()}Router);`
    )
    .join('\n');

  // CHANGE HERE: Removed compiledFiles?.['src/server.ts'] so it always auto-syncs
  files['src/server.ts'] = `import express from "express";\n${entityImports}\n\nconst app = express();\napp.use(express.json());\n\n${entityMounts}\n\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, () => {\n  console.log(\`Archeon API running on port \${PORT}\`);\n});\n`;

  files['src/lib/prisma.ts'] = `import { PrismaClient } from "@prisma/client";\n\nexport const prisma = new PrismaClient();\n`;

  // 3. Routes, Controllers & Services per Entity
  for (const entity of ir.entities) {
    const slug = entity.name.toLowerCase();
    const pascal = entity.name.charAt(0).toUpperCase() + entity.name.slice(1);

    // 3A. Auto-Generated Base Router (Overwritten on compilation)
    files[`src/routes/base/_Base${pascal}Routes.ts`] = `// AUTO-GENERATED BASE ROUTER - DO NOT EDIT DIRECTLY
import { Router } from "express";
import * as ${slug}Service from "../../services/${slug}.service";

export const _base${pascal}Router = Router();

_base${pascal}Router.get("/", async (_req, res) => {
  const items = await ${slug}Service.list${pascal}();
  res.json(items);
});

_base${pascal}Router.get("/:id", async (req, res) => {
  const item = await ${slug}Service.get${pascal}(req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

_base${pascal}Router.post("/", async (req, res) => {
  const created = await ${slug}Service.create${pascal}(req.body);
  res.status(201).json(created);
});

_base${pascal}Router.put("/:id", async (req, res) => {
  const updated = await ${slug}Service.update${pascal}(req.params.id, req.body);
  res.json(updated);
});

_base${pascal}Router.delete("/:id", async (req, res) => {
  await ${slug}Service.delete${pascal}(req.params.id);
  res.status(204).send();
});
`;

    // 3B. Extension Router (Preserved if user modifies it)
    const extRouteKey = `src/routes/${slug}.routes.ts`;
    files[extRouteKey] =
      compiledFiles?.[extRouteKey] ||
      `import { Router } from "express";
import { _base${pascal}Router } from "./base/_Base${pascal}Routes";

export const ${slug}Router = Router();

// EXTENSION ROUTER
// Add custom middleware, overrides, or new endpoints here.
// e.g., ${slug}Router.get('/custom/search', (req, res) => { ... });

// Mount the auto-generated CRUD routes
${slug}Router.use('/', _base${pascal}Router);
`;

    files[`src/controllers/${slug}.controller.ts`] = `// Controller layer for ${entity.name}
import { Request, Response } from "express";
import * as ${slug}Service from "../services/${slug}.service";

export async function handleList(_req: Request, res: Response) {
  const data = await ${slug}Service.list${pascal}();
  return res.json(data);
}
`;

    files[`src/services/${slug}.service.ts`] = `// Auto-generated CRUD service for ${entity.name}
import { prisma } from "../lib/prisma";

export async function list${pascal}() {
  return prisma.${slug}.findMany();
}

export async function get${pascal}(id: string) {
  return prisma.${slug}.findUnique({ where: { id } });
}

export async function create${pascal}(data: any) {
  return prisma.${slug}.create({ data });
}

export async function update${pascal}(id: string, data: any) {
  return prisma.${slug}.update({ where: { id }, data });
}

export async function delete${pascal}(id: string) {
  return prisma.${slug}.delete({ where: { id } });
}
`;
  }

  // 4. Preserve any in-memory edits the user made directly in EditorPanel
  if (compiledFiles) {
    Object.entries(compiledFiles).forEach(([k, v]) => {
      // Do not overwrite base routes from cache to ensure schema changes always sync
      if (files[k] !== undefined && !k.includes('/base/_Base')) {
        files[k] = v;
      }
    });
  }

  // 5. Root Config Files
  files['package.json'] =
    compiledFiles?.['package.json'] ||
    JSON.stringify(
      {
        name: 'nexus-generated-api',
        version: '1.0.0',
        private: true,
        scripts: {
          dev: 'ts-node src/server.ts',
          build: 'tsc',
          'db:generate': 'prisma generate',
          'db:push': 'prisma db push',
        },
        dependencies: {
          '@prisma/client': '^5.0.0',
          express: '^4.18.2',
        },
      },
      null,
      2
    );

  files['.env'] =
    compiledFiles?.['.env'] ||
    compiledFiles?.['.env.example'] ||
    `DATABASE_URL="postgresql://postgres:password@localhost:5432/mydb?schema=public"\nPORT=3000\n`;

  return files;
}

/**
 * Converts flat file paths into a nested folder/file tree.
 */
export function buildFileTree(filePaths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const fullPath of filePaths) {
    const parts = fullPath.split('/');
    let currentLevel = root;
    let currentPath = '';

    parts.forEach((part, idx) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFolder = idx < parts.length - 1;

      let existing = currentLevel.find(
        (n) => n.name === part && n.isFolder === isFolder
      );
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          isFolder,
          children: [],
        };
        currentLevel.push(existing);
      }
      currentLevel = existing.children;
    });
  }

  const folderPriority: Record<string, number> = {
    prisma: 1,
    src: 2,
    'server.ts': 1,
    lib: 2,
    routes: 3,
    base: 3.5,
    controllers: 4,
    services: 5,
    'package.json': 90,
    '.env': 91,
  };

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      const pA = folderPriority[a.name] ?? (a.isFolder ? 10 : 50);
      const pB = folderPriority[b.name] ?? (b.isFolder ? 10 : 50);
      if (pA !== pB) return pA - pB;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => {
      if (n.isFolder) sortNodes(n.children);
    });
  };

  sortNodes(root);
  return root;
}

export function getFileLanguageLabel(path: string): {
  monacoLang: string;
  statusLabel: string;
} {
  if (path.endsWith('.prisma'))
    return { monacoLang: 'graphql', statusLabel: 'Prisma' };
  if (path.endsWith('.json')) return { monacoLang: 'json', statusLabel: 'JSON' };
  if (path.endsWith('.sql'))
    return { monacoLang: 'sql', statusLabel: 'PostgreSQL' };
  if (path.endsWith('.env') || path.endsWith('.env.example'))
    return { monacoLang: 'ini', statusLabel: 'ENV' };
  return { monacoLang: 'typescript', statusLabel: 'TypeScript' };
}