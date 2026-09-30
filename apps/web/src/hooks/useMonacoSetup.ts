import { useEffect } from 'react';
import { useMonaco } from '@monaco-editor/react';

export function useMonacoSetup() {
  const monaco = useMonaco();

  useEffect(() => {
    if (monaco) {
      const monacoTs = (monaco.languages as any).typescript;

      // Force instant background analysis
      monacoTs.typescriptDefaults.setEagerModelSync(true);

      // Setup compiler options
      monacoTs.typescriptDefaults.setCompilerOptions({
        target: monacoTs.ScriptTarget.ES2020,
        allowNonTsExtensions: true,
        moduleResolution: monacoTs.ModuleResolutionKind.NodeJs,
        module: monacoTs.ModuleKind.CommonJS,
        baseUrl: '.',
      });

      // Inject Node.js, Express, and Prisma types
      monacoTs.typescriptDefaults.addExtraLib(
        `
        declare var process: { env: { PORT?: string; DATABASE_URL?: string; [key: string]: string | undefined; } };
        declare module 'express' {
          export interface Request { body: any; params: any; query: any; }
          export interface Response { json: (data: any) => void; status: (code: number) => Response; send: (data?: any) => void; }
          export interface Router { get: any; post: any; put: any; delete: any; use: any; }
          export function Router(): Router;
          const express: () => any;
          export default express;
        }
        declare module '@prisma/client' {
          export class PrismaClient { [key: string]: any; }
        }
        `,
        'file:///node_modules_mock.d.ts'
      );

      // Define syntax theme
      monaco.editor.defineTheme('nexus-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '565766', fontStyle: 'italic' },
          { token: 'keyword', foreground: '8b7ff0' },
          { token: 'string', foreground: '8fbf6b' },
          { token: 'number', foreground: 'e08a3c' },
          { token: 'type', foreground: '3fc6d8' },
        ],
        colors: {
          'editor.background': '#0b0c10',
          'editor.foreground': '#e8e8ee',
          'editorLineNumber.foreground': '#565766',
          'editorLineNumber.activeForeground': '#8a8b9a',
          'editor.lineHighlightBackground': '#14161d80',
          'editor.selectionBackground': '#8b7ff033',
          'editorGutter.background': '#0b0c10',
        },
      });
    }
  }, [monaco]);

  return monaco;
}