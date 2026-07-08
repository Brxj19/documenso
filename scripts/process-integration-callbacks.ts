import { processDueIntegrationApiV1CallbackDeliveries } from '@documenso/api/v1/integration/evidence';

const main = async () => {
  const results = await processDueIntegrationApiV1CallbackDeliveries();

  console.log(
    JSON.stringify(
      {
        processed: results.length,
        deliveries: results,
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
