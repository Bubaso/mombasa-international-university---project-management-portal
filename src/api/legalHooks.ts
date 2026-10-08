import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslatingInvalidator } from './translatingMutation';
import * as legal from './legal';

export const useHearings = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['hearings', caseId],
    queryFn: () => legal.fetchHearings(caseId as string),
    enabled: caseId != null,
  });

export const useFilings = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['filings', caseId],
    queryFn: () => legal.fetchFilings(caseId as string),
    enabled: caseId != null,
  });

export const useExhibits = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['exhibits', caseId],
    queryFn: () => legal.fetchExhibits(caseId as string),
    enabled: caseId != null,
  });

export const useCustody = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['custody', caseId],
    queryFn: () => legal.fetchCustody(caseId as string),
    enabled: caseId != null,
  });

/** Duruşma brifinginin parçaları ve itirazlar (M5-12, M5-13, M5-17). */
export const useAppealGrounds = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['appealGrounds', caseId],
    queryFn: () => legal.fetchAppealGrounds(caseId as string),
    enabled: caseId != null,
  });

export const useLegalAuthorities = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['legalAuthorities', caseId],
    queryFn: () => legal.fetchLegalAuthorities(caseId as string),
    enabled: caseId != null,
  });

export const useBenchQuestions = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['benchQuestions', caseId],
    queryFn: () => legal.fetchBenchQuestions(caseId as string),
    enabled: caseId != null,
  });

export const useDefencePillars = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['defencePillars', caseId],
    queryFn: () => legal.fetchDefencePillars(caseId as string),
    enabled: caseId != null,
  });

export const useCaseParties = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['caseParties', caseId],
    queryFn: () => legal.fetchCaseParties(caseId as string),
    enabled: caseId != null,
  });

export const useCounsel = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['counsel', caseId],
    queryFn: () => legal.fetchCounsel(caseId as string),
    enabled: caseId != null,
  });

export const useOpinions = (caseId?: string) =>
  useQuery({
    queryKey: ['opinions', caseId ?? 'all'],
    queryFn: () => legal.fetchOpinions(caseId),
  });

function useInvalidator(keys: string[]) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export const useCreateHearing = () => {
  // A hearing is a date, so the unified calendar changes with it.
  const onSuccess = useTranslatingInvalidator(['hearings', 'projectCalendar'], 'hearings');
  return useMutation({ mutationFn: legal.createHearing, onSuccess });
};

export const useSetHearingPreparation = () => {
  const invalidate = useInvalidator(['hearings', 'projectCalendar']);
  return useMutation({ mutationFn: legal.setHearingPreparation, onSuccess: invalidate });
};

export const useCreateFiling = () => {
  const invalidate = useInvalidator(['filings', 'projectCalendar']);
  return useMutation({ mutationFn: legal.createFiling, onSuccess: invalidate });
};

export const useUpdateFiling = () => {
  const invalidate = useInvalidator(['filings', 'projectCalendar']);
  return useMutation({ mutationFn: legal.updateFiling, onSuccess: invalidate });
};

export const useCreateOrder = () => {
  const onSuccess = useTranslatingInvalidator(['caseOrders'], 'legal_orders');
  return useMutation({ mutationFn: legal.createOrder, onSuccess });
};

export const useSetOrderState = () => {
  const invalidate = useInvalidator(['caseOrders', 'obligations']);
  return useMutation({ mutationFn: legal.setOrderState, onSuccess: invalidate });
};

export const useCreateExhibit = () => {
  const invalidate = useInvalidator(['exhibits']);
  return useMutation({ mutationFn: legal.createExhibit, onSuccess: invalidate });
};

export const useRecordHandover = () => {
  const invalidate = useInvalidator(['custody']);
  return useMutation({ mutationFn: legal.recordHandover, onSuccess: invalidate });
};

export const useAssignCounsel = () => {
  const invalidate = useInvalidator(['counsel']);
  return useMutation({ mutationFn: legal.assignCounsel, onSuccess: invalidate });
};

export const useUpdateCounsel = () => {
  const invalidate = useInvalidator(['counsel']);
  return useMutation({ mutationFn: legal.updateCounsel, onSuccess: invalidate });
};

export const useRecordOpinion = () => {
  const invalidate = useInvalidator(['opinions']);
  return useMutation({ mutationFn: legal.recordOpinion, onSuccess: invalidate });
};

export const useCaseSpend = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['caseSpend', caseId],
    queryFn: () => legal.fetchCaseSpend(caseId as string),
    enabled: caseId != null,
  });
