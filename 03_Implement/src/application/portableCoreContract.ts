import type { Candidate } from '../core/candidate.js';

export const PORTABLE_CORE_REQUEST_SCHEMA =
  'mmi.portable-core-request/v1' as const;
export const PORTABLE_CORE_RESPONSE_SCHEMA =
  'mmi.portable-core-response/v1' as const;

export type PortableCoreSourceFormat =
  | 'csv'
  | 'xlsx'
  | 'xlsm'
  | 'xml-spreadsheet'
  | 'xml'
  | 'json';

export interface PortableCoreInspectRequestV1 {
  schema: typeof PORTABLE_CORE_REQUEST_SCHEMA;
  operation: 'inspect';
  /**
   * Hosts read source bytes. Core receives no filesystem capability.
   * name is format-dispatch metadata; label is preserved in locators.
   */
  source: {
    name: string;
    label: string;
    bytesBase64: string;
  };
  options?: {
    maxScanCells?: number;
  };
  executionPolicy?: {
    /** Portable Core v1 supports deterministic adapters only. */
    allowProviderDependent?: false;
  };
}

export interface PortableCoreDiagnosticV1 {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface PortableCoreInspectResponseV1 {
  schema: typeof PORTABLE_CORE_RESPONSE_SCHEMA;
  operation: 'inspect';
  execution: 'deterministic';
  source: {
    name: string;
    label: string;
    format: PortableCoreSourceFormat;
    digest: string;
    byteLength: number;
  };
  candidates: Candidate[];
  diagnostics: PortableCoreDiagnosticV1[];
}

export type PortableCoreRequestV1 = PortableCoreInspectRequestV1;
export type PortableCoreResponseV1 = PortableCoreInspectResponseV1;
