import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from './index';
import * as legal from './legal';
import * as documents from './documents';

export const useLegalCases = () =>
  useQuery({ queryKey: ['legalCases'], queryFn: api.fetchLegalCases });
export const useConstructionBlocks = () =>
  useQuery({ queryKey: ['construction'], queryFn: api.fetchConstructionBlocks });
/**
 * The same fetch the vault's own screens use. Two query functions under one
 * key would race, and the one that lost would hand its callers a document
 * with no version count — which is the difference between "nothing has been
 * filed against this" and "we did not ask".
 */
export const useDocumentVault = () =>
  useQuery({ queryKey: ['documents'], queryFn: documents.fetchDocuments });
export const useTransactions = () =>
  useQuery({ queryKey: ['transactions'], queryFn: api.fetchTransactions });
export const useCommunicationThreads = () =>
  useQuery({ queryKey: ['communications'], queryFn: api.fetchCommunicationThreads });
export const useTrustees = () => useQuery({ queryKey: ['trustees'], queryFn: api.fetchTrustees });
/** The orders on a case, which used to be a JSON array on the case row. */
export const useCaseOrders = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['caseOrders', caseId ?? 'all'],
    queryFn: () => legal.fetchOrders(caseId),
  });

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
