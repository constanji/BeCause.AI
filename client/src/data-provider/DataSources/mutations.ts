import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from '@because/data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  DataSource,
  DataSourceCreateParams,
  DataSourceUpdateParams,
  DataSourceResponse,
  DataSourceTestResponse,
} from '@because/data-provider';

/**
 * Create a new data source
 */
export const useCreateDataSourceMutation = (): UseMutationResult<
  DataSourceResponse,
  Error,
  DataSourceCreateParams
> => {
  const queryClient = useQueryClient();
  return useMutation((data: DataSourceCreateParams) => dataService.createDataSource(data), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.dataSources]);
    },
  });
};

/**
 * Update a data source
 */
export const useUpdateDataSourceMutation = (): UseMutationResult<
  DataSourceResponse,
  Error,
  { id: string; data: DataSourceUpdateParams }
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ id, data }: { id: string; data: DataSourceUpdateParams }) =>
      dataService.updateDataSource({ id, data }),
    {
      onSuccess: (response, variables) => {
        queryClient.invalidateQueries([QueryKeys.dataSources]);
        queryClient.invalidateQueries([QueryKeys.dataSource, variables.id]);
      },
    },
  );
};

/**
 * Delete a data source
 */
export const useDeleteDataSourceMutation = (): UseMutationResult<
  { success: boolean; message?: string },
  Error,
  { id: string }
> => {
  const queryClient = useQueryClient();
  return useMutation(({ id }: { id: string }) => dataService.deleteDataSource({ id }), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.dataSources]);
    },
  });
};

/**
 * Test data source connection
 */
export const useTestDataSourceConnectionMutation = (): UseMutationResult<
  DataSourceTestResponse,
  Error,
  { id: string }
> => {
  const queryClient = useQueryClient();
  return useMutation(({ id }: { id: string }) => dataService.testDataSourceConnection({ id }), {
    onSuccess: (response, variables) => {
      // 刷新数据源列表和详情，以更新测试结果
      queryClient.invalidateQueries([QueryKeys.dataSources]);
      queryClient.invalidateQueries([QueryKeys.dataSource, variables.id]);
    },
  });
};

/**
 * Test connection with provided config (without saving)
 */
export const useTestConnectionMutation = (): UseMutationResult<
  DataSourceTestResponse,
  Error,
  DataSourceCreateParams
> => {
  return useMutation((data: DataSourceCreateParams) => dataService.testConnection(data));
};

