import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from '@because/data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type { Project, ProjectListResponse, ProjectResponse } from '@because/data-provider';

/**
 * Hook for listing all projects
 */
export const useListProjectsQuery = <TData = ProjectListResponse>(
  config?: UseQueryOptions<ProjectListResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<ProjectListResponse, unknown, TData>(
    [QueryKeys.projects],
    () => dataService.listProjects(),
    {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true, // 挂载时刷新
      retry: false,
      ...config,
    },
  );
};

/**
 * Hook for getting a single project by ID
 */
export const useGetProjectByIdQuery = (
  id: string | null | undefined,
  config?: UseQueryOptions<ProjectResponse>,
): QueryObserverResult<ProjectResponse> => {
  return useQuery<ProjectResponse>(
    [QueryKeys.projects, id],
    () => dataService.getProjectById({ id: id! }),
    {
      enabled: !!id,
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

