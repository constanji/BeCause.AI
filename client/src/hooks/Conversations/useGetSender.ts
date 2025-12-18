import { useCallback } from 'react';
import { getResponseSender } from '@because/data-provider';
import type { TEndpointOption, TEndpointsConfig } from '@because/data-provider';
import { useGetEndpointsQuery } from '~/data-provider';

export default function useGetSender() {
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  return useCallback(
    (endpointOption: TEndpointOption) => {
      const { modelDisplayLabel } = endpointsConfig?.[endpointOption.endpoint ?? ''] ?? {};
      return getResponseSender({ ...endpointOption, modelDisplayLabel });
    },
    [endpointsConfig],
  );
}
