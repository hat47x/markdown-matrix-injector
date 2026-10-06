/**
 * Descriptive two-renderer comparison for issue-0198.
 *
 * No quality score or pass/fail threshold is produced. The report records the
 * same selection rendered by the dependency-free native SVG path and, when
 * available, LibreOffice+Poppler. Artifacts remain separate because their
 * content identities and media types are intentionally different.
 */
import path from 'node:path';

import {
  RegionSnapshotError,
  renderLibreOfficeRegionSnapshot,
  type RegionSnapshotOptions,
  type RegionSnapshotResult,
} from './libreOfficeRegionSnapshot.js';
import {
  renderNativeSvgRegionSnapshot,
  type NativeSvgRegionSnapshotOptions,
  type NativeSvgRegionSnapshotResult,
} from './nativeSvgRegionSnapshot.js';

export const REGION_SNAPSHOT_COMPARISON_SCHEMA =
  'mmi.region-snapshot-comparison/v1' as const;

export interface RegionSnapshotComparisonOptions {
  sourcePath: string;
  sourceLabel?: string;
  sheet: string;
  range: string;
  outDir: string;
  dpi?: number;
}

export interface RegionSnapshotComparisonRuntime {
  native?: (
    options: NativeSvgRegionSnapshotOptions,
  ) => NativeSvgRegionSnapshotResult;
  libreOffice?: (
    options: RegionSnapshotOptions,
  ) => Promise<RegionSnapshotResult>;
}

export interface RegionSnapshotComparisonReport {
  schema: typeof REGION_SNAPSHOT_COMPARISON_SCHEMA;
  source: {
    label: string;
    digest: string;
  };
  selection: {
    sheet: string;
    range: string;
  };
  native: {
    status: 'rendered';
    renderer: string;
    artifact: string;
    mediaType: 'image/svg+xml';
    digest: string;
    bytes: number;
    widthPx: number;
    heightPx: number;
    aspectRatio: number;
    limitations: string[];
  };
  libreOffice:
    | {
        status: 'rendered';
        renderer: string;
        artifact: string;
        mediaType: 'image/png';
        digest: string;
        bytes: number;
        widthPx: number;
        heightPx: number;
        aspectRatio: number;
        libreOfficeVersion: string;
        pdftoppmVersion: string;
        fontSetDigest: string;
        dpi: number;
      }
    | {
        status: 'unavailable' | 'failed';
        diagnosticCode: string;
      };
  observations: {
    bothRendered: boolean;
    aspectRatioDifference?: number;
  };
  interpretationBoundary: {
    noQualityScore: true;
    noPassFailThreshold: true;
    noRendererEquivalenceClaim: true;
  };
}

const UNAVAILABLE = new Set([
  'MMI_SNAPSHOT_LIBREOFFICE_UNAVAILABLE',
  'MMI_SNAPSHOT_PDFTOPPM_UNAVAILABLE',
  'MMI_SNAPSHOT_PDFINFO_UNAVAILABLE',
  'MMI_SNAPSHOT_PYUNO_UNAVAILABLE',
]);

export async function compareRegionSnapshotRenderers(
  options: RegionSnapshotComparisonOptions,
  runtime: RegionSnapshotComparisonRuntime = {},
): Promise<RegionSnapshotComparisonReport> {
  const outDir = path.resolve(options.outDir);
  const nativeRenderer = runtime.native ?? renderNativeSvgRegionSnapshot;
  const libreOfficeRenderer =
    runtime.libreOffice ?? renderLibreOfficeRegionSnapshot;

  const native = nativeRenderer({
    sourcePath: options.sourcePath,
    ...(options.sourceLabel ? { sourceLabel: options.sourceLabel } : {}),
    sheet: options.sheet,
    range: options.range,
    outDir: path.join(outDir, 'native-svg'),
  });

  let libreOffice:
    | Awaited<ReturnType<typeof renderLibreOfficeRegionSnapshot>>
    | RegionSnapshotError;
  try {
    libreOffice = await libreOfficeRenderer({
      sourcePath: options.sourcePath,
      ...(options.sourceLabel ? { sourceLabel: options.sourceLabel } : {}),
      sheet: options.sheet,
      range: options.range,
      outDir: path.join(outDir, 'libreoffice'),
      ...(options.dpi ? { dpi: options.dpi } : {}),
    });
  } catch (error) {
    if (!(error instanceof RegionSnapshotError)) throw error;
    libreOffice = error;
  }

  const nativeReport = {
    status: 'rendered' as const,
    renderer: native.manifest.renderer.id,
    artifact: portableArtifact(outDir, native.svgFile),
    mediaType: 'image/svg+xml' as const,
    digest: native.manifest.artifact.digest,
    bytes: native.manifest.artifact.bytes,
    widthPx: native.manifest.artifact.widthPx,
    heightPx: native.manifest.artifact.heightPx,
    aspectRatio: aspectRatio(
      native.manifest.artifact.widthPx,
      native.manifest.artifact.heightPx,
    ),
    limitations: [...native.manifest.limitations],
  };

  if (libreOffice instanceof RegionSnapshotError) {
    return {
      schema: REGION_SNAPSHOT_COMPARISON_SCHEMA,
      source: {
        label: native.manifest.source.label,
        digest: native.manifest.source.digest,
      },
      selection: { ...native.manifest.selection },
      native: nativeReport,
      libreOffice: {
        status: UNAVAILABLE.has(libreOffice.code) ? 'unavailable' : 'failed',
        diagnosticCode: libreOffice.code,
      },
      observations: { bothRendered: false },
      interpretationBoundary: {
        noQualityScore: true,
        noPassFailThreshold: true,
        noRendererEquivalenceClaim: true,
      },
    };
  }

  assertSameInput(native, libreOffice);
  const loRatio = aspectRatio(
    libreOffice.manifest.artifact.widthPx,
    libreOffice.manifest.artifact.heightPx,
  );
  return {
    schema: REGION_SNAPSHOT_COMPARISON_SCHEMA,
    source: {
      label: native.manifest.source.label,
      digest: native.manifest.source.digest,
    },
    selection: { ...native.manifest.selection },
    native: nativeReport,
    libreOffice: {
      status: 'rendered',
      renderer: libreOffice.manifest.renderer.id,
      artifact: portableArtifact(outDir, libreOffice.pngFile),
      mediaType: 'image/png',
      digest: libreOffice.manifest.artifact.digest,
      bytes: libreOffice.manifest.artifact.bytes,
      widthPx: libreOffice.manifest.artifact.widthPx,
      heightPx: libreOffice.manifest.artifact.heightPx,
      aspectRatio: loRatio,
      libreOfficeVersion: libreOffice.manifest.renderer.libreOfficeVersion,
      pdftoppmVersion: libreOffice.manifest.renderer.pdftoppmVersion,
      fontSetDigest: libreOffice.manifest.renderer.fontSetDigest,
      dpi: libreOffice.manifest.renderer.dpi,
    },
    observations: {
      bothRendered: true,
      aspectRatioDifference: round(
        Math.abs(nativeReport.aspectRatio - loRatio),
      ),
    },
    interpretationBoundary: {
      noQualityScore: true,
      noPassFailThreshold: true,
      noRendererEquivalenceClaim: true,
    },
  };
}

function assertSameInput(
  native: NativeSvgRegionSnapshotResult,
  libreOffice: RegionSnapshotResult,
): void {
  if (
    native.manifest.source.digest !== libreOffice.manifest.source.digest
    || native.manifest.source.label !== libreOffice.manifest.source.label
    || native.manifest.selection.sheet !== libreOffice.manifest.selection.sheet
    || native.manifest.selection.range !== libreOffice.manifest.selection.range
  ) {
    throw new Error(
      'snapshot comparison renderers did not evaluate the same source selection',
    );
  }
}

function portableArtifact(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

function aspectRatio(width: number, height: number): number {
  return round(width / height);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
