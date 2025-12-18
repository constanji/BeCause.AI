import type { AuthType } from '@because/data-provider';

export type ApiKeyFormData = {
  apiKey: string;
  authType?: string | AuthType;
};
