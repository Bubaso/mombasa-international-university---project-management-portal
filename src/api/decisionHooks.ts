import { useQuery } from '@tanstack/react-query';
import * as decisions from './decisions';

export const usePendingDecisions = () =>
  useQuery({ queryKey: ['pendingDecisions'], queryFn: decisions.fetchPendingDecisions });
