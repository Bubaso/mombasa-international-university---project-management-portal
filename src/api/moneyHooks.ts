import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as money from './money';

export const useBudgetCategories = () =>
  useQuery({ queryKey: ['budgetCategories'], queryFn: money.fetchCategories });

export const useBudgetLines = () =>
  useQuery({ queryKey: ['budgetLines'], queryFn: money.fetchBudgetLines });

export const useBudgetPositions = () =>
  useQuery({ queryKey: ['budgetPositions'], queryFn: money.fetchBudgetPositions });

export const useCategorySpend = () =>
  useQuery({ queryKey: ['categorySpend'], queryFn: money.fetchCategorySpend });

export const useVouchers = () => useQuery({ queryKey: ['vouchers'], queryFn: money.fetchVouchers });

export const useThresholds = () =>
  useQuery({ queryKey: ['approvalThresholds'], queryFn: money.fetchThresholds });

export const useApprovals = (voucherId: string | null) =>
  useQuery({
    queryKey: ['voucherApprovals', voucherId],
    queryFn: () => money.fetchApprovals(voucherId as string),
    enabled: voucherId != null,
  });

export const useLedger = () => useQuery({ queryKey: ['ledger'], queryFn: money.fetchTransactions });

export const useDonations = () =>
  useQuery({ queryKey: ['donations'], queryFn: money.fetchDonations });

export const useTranches = (donationId: string | null) =>
  useQuery({
    queryKey: ['donationTranches', donationId],
    queryFn: () => money.fetchTranches(donationId as string),
    enabled: donationId != null,
  });

function useInvalidator(keys: string[]) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

/** Anything that moves money moves all four figures, so they go together. */
const POSITION_KEYS = ['budgetPositions', 'categorySpend', 'budgetLines'];

export const useCreateCategory = () => {
  const invalidate = useInvalidator(['budgetCategories', 'categorySpend']);
  return useMutation({ mutationFn: money.createCategory, onSuccess: invalidate });
};

export const useCreateBudgetLine = () => {
  const invalidate = useInvalidator(POSITION_KEYS);
  return useMutation({ mutationFn: money.createBudgetLine, onSuccess: invalidate });
};

export const useRequestVoucher = () => {
  const invalidate = useInvalidator(['vouchers']);
  return useMutation({ mutationFn: money.requestVoucher, onSuccess: invalidate });
};

export const useSetVoucherState = () => {
  // A ruling changes what is committed and what is left, and writes a row to
  // the approval register, so all three go stale at once.
  const invalidate = useInvalidator([...POSITION_KEYS, 'vouchers', 'voucherApprovals']);
  return useMutation({ mutationFn: money.setVoucherState, onSuccess: invalidate });
};

export const useRecordTransaction = () => {
  const invalidate = useInvalidator(['ledger', ...POSITION_KEYS]);
  return useMutation({ mutationFn: money.recordTransaction, onSuccess: invalidate });
};

export const useAttachDocument = () => {
  const invalidate = useInvalidator(['ledger']);
  return useMutation({ mutationFn: money.attachDocument, onSuccess: invalidate });
};

export const useMarkAudited = () => {
  const invalidate = useInvalidator(['ledger']);
  return useMutation({ mutationFn: money.markAudited, onSuccess: invalidate });
};

export const usePledgeDonation = () => {
  const invalidate = useInvalidator(['donations']);
  return useMutation({ mutationFn: money.pledgeDonation, onSuccess: invalidate });
};

export const useRecordTranche = () => {
  const invalidate = useInvalidator(['donations', 'donationTranches']);
  return useMutation({ mutationFn: money.recordTranche, onSuccess: invalidate });
};
