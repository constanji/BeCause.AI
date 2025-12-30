import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from '@because/data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type { DataSource, DataSourceListResponse, DataSourceResponse } from '@because/data-provider';

/**
 * Hook for listing all data sources
 */
export const useListDataSourcesQuery = <TData = DataSourceListResponse>(
  config?: UseQueryOptions<DataSourceListResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<DataSourceListResponse, unknown, TData>(
    [QueryKeys.dataSources],
    () => dataService.listDataSources(),
    {
      staleTime: 1000 * 30, // 30 seconds
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

/**
 * Hook for getting a single data source by ID
 */
export const useGetDataSourceByIdQuery = (
  id: string | null | undefined,
  config?: UseQueryOptions<DataSourceResponse>,
): QueryObserverResult<DataSourceResponse> => {
  const queryClient = useQueryClient();
  return useQuery<DataSourceResponse>(
    [QueryKeys.dataSource, id],
    () => dataService.getDataSourceById({ id: id! }),
    {
      enabled: !!id,
      staleTime: 1000 * 30,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

