import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';

import type { TIntegrationApiV1StatusSchema } from './schema';

const TERMINAL_STATUSES = new Set<TIntegrationApiV1StatusSchema>([
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
]);

export const isIntegrationRequestTerminal = (status: TIntegrationApiV1StatusSchema | string) => {
  return TERMINAL_STATUSES.has(status as TIntegrationApiV1StatusSchema);
};

export const assertIntegrationRequestNotTerminal = (status: TIntegrationApiV1StatusSchema | string) => {
  if (isIntegrationRequestTerminal(status)) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: `Action not allowed on terminal signing request with status ${status}.`,
    });
  }
};
