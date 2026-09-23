import Dexie, { type Table } from 'dexie';
import type { CanonicalIR } from '@zero-dollar/ir-core';

// Represents a project snapshot stored locally in the browser
export interface ProjectRecord {
  id: string; // UUID of the project
  canonical_ir: CanonicalIR;
  version_hash: string; // SHA-256 for Supabase conflict resolution
  updated_at: number; // Unix timestamp for Last-Write-Wins logic
}

export class ArchitectureDB extends Dexie {
  projects!: Table<ProjectRecord, string>;

  constructor() {
    super('ArchitectureDB');
    // Define IndexedDB schema (only indexed properties need to be declared here)
    this.version(1).stores({
      projects: 'id, updated_at' 
    });
  }
}

export const db = new ArchitectureDB();