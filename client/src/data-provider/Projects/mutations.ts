import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from '@because/data-provider';
import type { UseMutationResult, UseMutationOptions } from '@tanstack/react-query';
import type { ProjectResponse } from '@because/data-provider';

/**
 * Hook for updating project data source
 */
export const useUpdateProjectDataSourceMutation = (
  config?: UseMutationOptions<ProjectResponse, Error, { id: string; data_source_id: string | null }>,
): UseMutationResult<ProjectResponse, Error, { id: string; data_source_id: string | null }> => {
  const queryClient = useQueryClient();

  return useMutation<ProjectResponse, Error, { id: string; data_source_id: string | null }>(
    ({ id, data_source_id }) => dataService.updateProjectDataSource({ id, data_source_id }),
    {
      ...config,
      onSuccess: (data, variables, context) => {
        // 刷新项目列表
        queryClient.invalidateQueries([QueryKeys.projects]);
        // 刷新特定项目
        queryClient.invalidateQueries([QueryKeys.projects, variables.id]);
        config?.onSuccess?.(data, variables, context);
      },
    },
  );
};

