import { createApiToken } from '@documenso/lib/server-only/public-api/create-api-token';

const main = async () => {
  const userId = Number(process.env.MJN_SETUP_USER_ID ?? '3');
  const teamId = Number(process.env.MJN_SETUP_TEAM_ID ?? '3');

  const result = await createApiToken({
    userId,
    teamId,
    tokenName: 'mjn-dms-demo-token',
    expiresIn: null,
  });

  console.log(`API_TOKEN=${result.token}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
