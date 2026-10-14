import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from './index';
import * as legal from './legal';
import * as documents from './documents';
import * as siteApi from './site';
import * as moneyApi from './money';

export const useLegalCases = () =>
  useQuery({ queryKey: ['legalCases'], queryFn: api.fetchLegalCases });
/**
 * The same fetch the site screens use. 0013 replaced the block's typed
 * percentage and its jsonb bag of items with real structures, so a second
 * `select('*')` here would hand its callers a shape that no longer exists.
 */
export const useConstructionBlocks = () =>
  useQuery({ queryKey: ['construction'], queryFn: siteApi.fetchBlocks });
/**
 * The same fetch the vault's own screens use. Two query functions under one
 * key would race, and the one that lost would hand its callers a document
 * with no version count — which is the difference between "nothing has been
 * filed against this" and "we did not ask".
 */
export const useDocumentVault = (limit = 40) =>
  useQuery({ queryKey: ['documents', limit], queryFn: () => documents.fetchDocuments(limit) });
/** The same read the finance screens use; 0015 changed the ledger's shape. */
export const useTransactions = (limit = 40) =>
  useQuery({ queryKey: ['transactions', limit], queryFn: () => moneyApi.fetchTransactions(limit) });
/* useCommunicationThreads, useCreateThread and useAddThreadMessage are gone.
 * They called three functions that could not work: the first selected a
 * `messages` JSONB column 0002 replaced with rows, and the other two read
 * that array, appended in the browser and wrote the whole thing back —
 * losing a message whenever two people replied at once (M11-03) and
 * attributing every one of them to the literal string 'Current User'
 * (M11-02). api/commsHooks.ts replaces all three. */
/** The orders on a case, which used to be a JSON array on the case row. */
export const useCaseOrders = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['caseOrders', caseId ?? 'all'],
    queryFn: () => legal.fetchOrders(caseId),
  });

export const useAddLegalCase = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.addLegalCase,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['legalCases'] }),
  });
};
