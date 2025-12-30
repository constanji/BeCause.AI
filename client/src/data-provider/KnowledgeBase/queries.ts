import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  UseQueryOptions,
  UseMutationResult,
  QueryObserverResult,
  UseMutationOptions,
} from '@tanstack/react-query';
import { QueryKeys, dataService } from '@because/data-provider';

export const useListKnowledgeQuery = (
  params?: dataService.KnowledgeListParams,
  config?: UseQueryOptions<dataService.KnowledgeListResponse>,
): QueryObserverResult<dataService.KnowledgeListResponse> => {
  return useQuery<dataService.KnowledgeListResponse>(
    [QueryKeys.knowledgeBase, params],
    () => dataService.listKnowledge(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      ...config,
    },
  );
};

export const useAddKnowledgeMutation = (
  options?: UseMutationOptions<
    dataService.AddKnowledgeResponse,
    Error,
    dataService.AddKnowledgeRequest
  >,
): UseMutationResult<
  dataService.AddKnowledgeResponse,
  Error,
  dataService.AddKnowledgeRequest
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => dataService.addKnowledge(payload),
    onMutate: (variables) => options?.onMutate?.(variables),
    onError: (error, variables, context) => {
      options?.onError?.(error, variables, context);
    },
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries([QueryKeys.knowledgeBase]);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useDeleteKnowledgeMutation = (
  options?: UseMutationOptions<{ success: boolean; message: string }, Error, string>,
): UseMutationResult<{ success: boolean; message: string }, Error, string> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => dataService.deleteKnowledge(id),
    onMutate: (variables) => options?.onMutate?.(variables),
    onError: (error, variables, context) => {
      options?.onError?.(error, variables, context);
    },
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries([QueryKeys.knowledgeBase]);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

