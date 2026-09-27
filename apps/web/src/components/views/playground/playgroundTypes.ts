import type { Field } from '@zero-dollar/ir-core';

export type EndpointMethod = 'GET_LIST' | 'GET_ID' | 'POST' | 'PUT' | 'DELETE';
export type BodyMode = 'table' | 'json';
export type ActiveReqTab = 'params' | 'body';

export interface EndpointSelection {
  entityName: string;
  methodType: EndpointMethod;
}

export interface KeyValueField {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
  type: Field['type'];
  fkInfo?: {
    parentEntity: string;
    parentPkField: string;
    options: string[];
  };
}

export interface QueryParamRow {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

export interface PlaygroundResponseState {
  status: number;
  statusText: string;
  summaryMessage: string;
  sizeLabel: string;
  body: string;
}

export const VERB_PILL_STYLES: Record<string, string> = {
  GET: 'text-[#8fbf6b] bg-[#8fbf6b]/14 border-[#8fbf6b]/30',
  POST: 'text-[#e08a3c] bg-[#e08a3c]/14 border-[#e08a3c]/30',
  PUT: 'text-[#3fc6d8] bg-[#3fc6d8]/14 border-[#3fc6d8]/30',
  DELETE: 'text-[#e0708f] bg-[#e0708f]/14 border-[#e0708f]/30',
};

export const METHODS_ORDER: EndpointMethod[] = [
  'GET_LIST',
  'GET_ID',
  'POST',
  'PUT',
  'DELETE',
];

export function formatByteSize(str: string): string {
  const bytes = new Blob([str]).size;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function getEndpointMeta(entityName: string, methodType: EndpointMethod) {
  const base = `/v1/${entityName.toLowerCase()}`;
  switch (methodType) {
    case 'GET_LIST':
      return { verb: 'GET', path: base, desc: `List and filter records in ${entityName}` };
    case 'GET_ID':
      return {
        verb: 'GET',
        path: `${base}/{id}`,
        desc: `Fetch a single ${entityName} record by primary key`,
      };
    case 'POST':
      return { verb: 'POST', path: base, desc: `Insert a new record into ${entityName}` };
    case 'PUT':
      return {
        verb: 'PUT',
        path: `${base}/{id}`,
        desc: `Update an existing ${entityName} record by primary key`,
      };
    case 'DELETE':
      return {
        verb: 'DELETE',
        path: `${base}/{id}`,
        desc: `Delete a ${entityName} record (enforces FK RESTRICT / CASCADE)`,
      };
  }
}