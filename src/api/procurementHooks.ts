/** Query hooks for the procurement and contract registers (M14). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAutoTranslate } from './translateHooks';
import * as api from './procurement';

export const useRequests = () =>
  useQuery({ queryKey: ['procurementRequests'], queryFn: api.fetchRequests });

export const useCandidates = (requestId: string | null) =>
  useQuery({
    queryKey: ['procurementCandidates', requestId],
    queryFn: () => api.fetchCandidates(requestId as string),
    enabled: requestId != null,
  });

export const useContractAlerts = () =>
  useQuery({ queryKey: ['contractAlerts'], queryFn: api.fetchContractAlerts });

export const useContractTerms = (contractId: string | null) =>
  useQuery({
    queryKey: ['contractTerms', contractId],
    queryFn: () => api.fetchContractTerms(contractId as string),
    enabled: contractId != null,
  });

export const useMilestones = (contractId: string | null) =>
  useQuery({
    queryKey: ['contractMilestones', contractId],
    queryFn: () => api.fetchMilestones(contractId as string),
    enabled: contractId != null,
  });

export const useSettlement = () =>
  useQuery({ queryKey: ['contractSettlement'], queryFn: api.fetchSettlement });

export const useReviews = () =>
  useQuery({ queryKey: ['supplierReviews'], queryFn: api.fetchReviews });

// --- mutations -------------------------------------------------------------

export function useAddRequest() {
  const client = useQueryClient();
  const translate = useAutoTranslate();
  return useMutation({
    mutationFn: api.addRequest,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['procurementRequests'] });
      void translate('procurement_requests');
    },
  });
}

export function useApproveRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; note?: string | null }) =>
      api.approveRequest(input.id, input.note),
    onSuccess: () => client.invalidateQueries({ queryKey: ['procurementRequests'] }),
  });
}

export function useAddCandidate() {
  const client = useQueryClient();
  const translate = useAutoTranslate();
  return useMutation({
    mutationFn: api.addCandidate,
    onSuccess: (_data, input) => {
      client.invalidateQueries({ queryKey: ['procurementCandidates', input.requestId] });
      client.invalidateQueries({ queryKey: ['procurementRequests'] });
      void translate('procurement_candidates');
    },
  });
}

export function useAwardTo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { candidateId: string; reasonEn: string }) =>
      api.awardTo(input.candidateId, input.reasonEn),
    onSuccess: () => {
      // The award closes the request, so both lists move.
      client.invalidateQueries({ queryKey: ['procurementCandidates'] });
      client.invalidateQueries({ queryKey: ['procurementRequests'] });
    },
  });
}

export function useRejectCandidate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reasonEn: string }) =>
      api.rejectCandidate(input.id, input.reasonEn),
    onSuccess: () => client.invalidateQueries({ queryKey: ['procurementCandidates'] }),
  });
}

export function useAddReview() {
  const client = useQueryClient();
  const translate = useAutoTranslate();
  return useMutation({
    mutationFn: api.addReview,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['supplierReviews'] });
      void translate('supplier_reviews');
    },
  });
}
