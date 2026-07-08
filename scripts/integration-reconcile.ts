import { reconcileIntegrationApiV1SigningRequests } from '@documenso/api/v1/integration/evidence';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

const main = async () => {
  const results = await reconcileIntegrationApiV1SigningRequests({
    dryRun,
  });

  const changed = results.filter((result) => result.changed).length;

  console.log(
    JSON.stringify(
      {
        dryRun,
        scanned: results.length,
        changed,
        requests: results.map((result) => ({
          requestId: result.requestId,
          changed: result.changed,
          queuedDeliveryIds: result.queuedDeliveryIds,
        })),
      },
      null,
      2,
    ),
  );
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
