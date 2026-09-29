import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from './index';

export const useLegalCases = () =>
  useQuery({ queryKey: ['legalCases'], queryFn: api.fetchLegalCases });
export const useConstructionBlocks = () =>
  useQuery({ queryKey: ['construction'], queryFn: api.fetchConstructionBlocks });
export const useDocumentVault = () =>
  useQuery({ queryKey: ['documents'], queryFn: api.fetchDocumentVault });
export const useTransactions = () =>
  useQuery({ queryKey: ['transactions'], queryFn: api.fetchTransactions });
export const useCommunicationThreads = () =>
  useQuery({ queryKey: ['communications'], queryFn: api.fetchCommunicationThreads });
export const useTrustees = () => useQuery({ queryKey: ['trustees'], queryFn: api.fetchTrustees });
export const useDeadlines = () =>
  useQuery({ queryKey: ['deadlines'], queryFn: api.fetchDeadlines });

export const useAddLegalCase = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.addLegalCase,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['legalCases'] }),
  });
};

export const useUpdateConstructionBlock = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateConstructionBlock,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['construction'] }),
  });
};

export const useAddDocument = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.addDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });
};

export const useAddTransaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.addTransaction,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  });
};

export const useCreateThread = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createThread,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communications'] }),
  });
};

export const useAddThreadMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.addThreadMessage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communications'] }),
  });
};

export const useDismissDeadline = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.dismissDeadline,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deadlines'] }),
  });
};
