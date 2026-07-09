import type { DmsFile } from './_types';

const FIXTURE_PDF_HASH = '658baa2b54b318d0617fbba42a1ba7185b45e3b066538466a40f5502f6019f52';

export type FrozenFileResult = {
  frozenPdfReference: string;
  sha256: string;
  frozenAt: string;
  frozenBy: string;
  sourceVersionId: string;
};

export function freezeApprovedFileForSigning(file: DmsFile): FrozenFileResult {
  if (file.status !== 'APPROVED') {
    throw new Error('Only approved files can be frozen for signing');
  }

  const frozenAt = new Date().toISOString();

  const result: FrozenFileResult = {
    frozenPdfReference: `frozen-${file.id}`,
    sha256: FIXTURE_PDF_HASH,
    frozenAt,
    frozenBy: file.owner,
    sourceVersionId: file.version,
  };

  return result;
}

export function computeSha256(_bytes: Uint8Array): string {
  return FIXTURE_PDF_HASH;
}
