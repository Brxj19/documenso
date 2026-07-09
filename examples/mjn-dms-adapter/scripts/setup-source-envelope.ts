import fs from 'node:fs';
import { createEnvelope } from '@documenso/lib/server-only/envelope/create-envelope';
import { sha256 } from '@documenso/lib/universal/crypto';
import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import { putPdfFileServerSide } from '@documenso/lib/universal/upload/put-file.server';
import { DocumentDistributionMethod, EnvelopeType } from '@prisma/client';

const examplePdfBuffer = fs.readFileSync(new URL('../../../assets/example.pdf', import.meta.url));

const toArrayBuffer = (data: Uint8Array): ArrayBuffer =>
  data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

const main = async () => {
  const userId = Number(process.env.MJN_SETUP_USER_ID ?? '3');
  const teamId = Number(process.env.MJN_SETUP_TEAM_ID ?? '3');

  const { documentData } = await putPdfFileServerSide({
    name: 'mjn-source.pdf',
    type: 'application/pdf',
    arrayBuffer: async () => toArrayBuffer(examplePdfBuffer),
  });

  const envelope = await createEnvelope({
    userId,
    teamId,
    internalVersion: 1,
    bypassDefaultRecipients: true,
    data: {
      type: EnvelopeType.DOCUMENT,
      title: 'MJN-DMS Source Document',
      envelopeItems: [
        {
          title: 'mjn-source-doc',
          documentDataId: documentData.id,
          order: 1,
        },
      ],
    },
    meta: {
      distributionMethod: DocumentDistributionMethod.NONE,
    },
    requestMetadata: {
      requestMetadata: { ipAddress: '127.0.0.1', userAgent: 'mjn-setup' },
      source: 'apiV1',
      auth: 'api',
      auditUser: { id: userId, email: 'setup@localhost', name: 'Setup' },
    },
  });

  const sourceBytes = await getFileServerSide(envelope.envelopeItems[0].documentData);
  const hash = Buffer.from(sha256(sourceBytes)).toString('hex');

  console.log(`ENVELOPE_ID=${envelope.id}`);
  console.log(`SOURCE_HASH=${hash}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
