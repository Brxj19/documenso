import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MJNFile, MJNFreezeResult } from './types';

export class PdfFreezeService {
  freezeApprovedFile(mjnFile: MJNFile, pdfFixturePath?: string): MJNFreezeResult {
    this.assertFileIsApproved(mjnFile);

    const pdfPath = pdfFixturePath ?? this.resolveFixturePath(mjnFile);
    const pdfBytes = fs.readFileSync(pdfPath);
    const sha256Hex = crypto.createHash('sha256').update(pdfBytes).digest('hex');

    return {
      frozenPdfBytes: pdfBytes,
      sha256Hex,
      frozenAt: new Date().toISOString(),
      sourceFileVersionId: mjnFile.fileVersionId,
    };
  }

  private assertFileIsApproved(file: MJNFile): void {
    if (file.approvalStatus !== 'APPROVED') {
      throw new Error(
        `File ${file.fileId} version ${file.fileVersionId} is not approved (status: ${file.approvalStatus}). ` +
          `Signing requires APPROVED status.`,
      );
    }

    if (!file.approvedAt) {
      throw new Error(`File ${file.fileId} version ${file.fileVersionId} has no approval timestamp.`);
    }

    if (!this.isPdfFileName(file.fileName)) {
      console.warn(
        `[MJN-PDF-FREEZE] File "${file.fileName}" is not a PDF. ` +
          `In production, this would be converted via LibreOffice/Gotenberg. ` +
          `For this POC, a PDF fixture will be used.`,
      );
    }
  }

  private isPdfFileName(name: string): boolean {
    return /\.pdf$/i.test(name);
  }

  private resolveFixturePath(file: MJNFile): string {
    const fixturePath = path.resolve(__dirname, '..', '..', '..', 'assets', 'example.pdf');

    if (!fs.existsSync(fixturePath)) {
      throw new Error(
        `Fixture PDF not found at ${fixturePath}. ` +
          `In production, the approved file would be converted from ${file.fileName}.`,
      );
    }

    return fixturePath;
  }
}
