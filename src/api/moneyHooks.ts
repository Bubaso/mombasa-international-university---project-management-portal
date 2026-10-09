import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslatingInvalidator } from './translatingMutation';
import * as money from './money';

/** Denetim kuyruğunun sayıları, kütüğün tamamından. */
export const useLedgerGaps = () =>
  useQuery({ queryKey: ['ledgerGaps'], queryFn: money.fetchLedgerGaps });

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

/** Seçiciler için: kesilmeden, üç sütun. */
export const useTransactionOptions = () =>
  useQuery({ queryKey: ['transactionOptions'], queryFn: money.fetchTransactionOptions });

export const useLedger = (limit = 40) =>
  useQuery({ queryKey: ['ledger', limit], queryFn: () => money.fetchTransactions(limit) });

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
  const onSuccess = useTranslatingInvalidator(
    ['budgetCategories', 'categorySpend'],
    'budget_categories',
  );
  return useMutation({ mutationFn: money.createCategory, onSuccess });
};

export const useCreateBudgetLine = () => {
  const onSuccess = useTranslatingInvalidator(POSITION_KEYS, 'budget_lines');
  return useMutation({ mutationFn: money.createBudgetLine, onSuccess });
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
  const onSuccess = useTranslatingInvalidator(['donations'], 'donations');
  return useMutation({ mutationFn: money.pledgeDonation, onSuccess });
};

export const useRecordTranche = () => {
  const invalidate = useInvalidator(['donations', 'donationTranches']);
  return useMutation({ mutationFn: money.recordTranche, onSuccess: invalidate });
};

// --- periodic financial close (M8-16) ---------------------------------------

export const usePeriods = () =>
  useQuery({ queryKey: ['financialPeriods'], queryFn: money.fetchPeriods });

export const useOpenPeriod = () => {
  const invalidate = useInvalidator(['financialPeriods']);
  return useMutation({ mutationFn: money.openPeriod, onSuccess: invalidate });
};

export const useClosePeriod = () => {
  // The ledger goes stale with the close because every row dated inside the
  // period is now frozen, and a row entered afterwards will be stamped.
  const invalidate = useInvalidator(['financialPeriods', 'ledger']);
  return useMutation({ mutationFn: money.closePeriod, onSuccess: invalidate });
};
