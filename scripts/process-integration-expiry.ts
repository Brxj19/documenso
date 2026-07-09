import { processIntegrationExpiry } from '@documenso/api/v1/integration/expiry';

const main = async () => {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');

  try {
    const report = await processIntegrationExpiry({ dryRun });

    console.log(JSON.stringify(report, null, 2));

    if (report.errors > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Fatal error during integration expiry processing:', error);
    process.exitCode = 1;
  }
};

void main();
