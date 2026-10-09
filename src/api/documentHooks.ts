import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslatingInvalidator } from './translatingMutation';
import * as documents from './documents';

export const useDocuments = (limit = 40) =>
  useQuery({ queryKey: ['documents', limit], queryFn: () => documents.fetchDocuments(limit) });

/** Özeti hesaplanmamış belge sayısı, kasanın tamamından. */
export const useUndigestedCount = () =>
  useQuery({ queryKey: ['undigestedDocuments'], queryFn: documents.countUndigestedDocuments });

/** Seçiciler için: her belgenin kimliği ve başlığı, kesilmeden. */
export const useDocumentOptions = () =>
  useQuery({ queryKey: ['documentOptions'], queryFn: documents.fetchDocumentOptions });

export const useCurrentVersions = () =>
  useQuery({ queryKey: ['documentVersionsAll'], queryFn: documents.fetchCurrentVersions });

export const useVersions = (documentId: string | null) =>
  useQuery({
    queryKey: ['documentVersions', documentId],
    queryFn: () => documents.fetchVersions(documentId as string),
    enabled: documentId != null,
  });

/**
 * Only fetched when a document is open. Most people cannot read this at all —
 * it is for those who answer for the project, plus your own trail.
 */
export const useAccessLog = (documentId: string | null, limit = 40) =>
  useQuery({
    queryKey: ['documentAccess', documentId, limit],
    queryFn: () => documents.fetchAccessLog(documentId as string, limit),
    enabled: documentId != null,
  });

export const useDocumentLinks = (documentId: string | null) =>
  useQuery({
    queryKey: ['documentLinks', documentId],
    queryFn: () => documents.fetchLinks(documentId as string),
    enabled: documentId != null,
  });

function useInvalidator(keys: string[]) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export const useCreateDocument = () => {
  const onSuccess = useTranslatingInvalidator(['documents'], 'document_vault');
  return useMutation({ mutationFn: documents.createDocument, onSuccess });
};

export const useUploadVersion = () => {
  // A new upload changes which version is in force, so the list changes too.
  const invalidate = useInvalidator(['documents', 'documentVersions', 'documentVersionsAll']);
  return useMutation({ mutationFn: documents.uploadVersion, onSuccess: invalidate });
};

export const useRequestDownload = () => {
  // Asking for a file writes an access row, so the log is stale the moment
  // this returns.
  const invalidate = useInvalidator(['documentAccess']);
  return useMutation({ mutationFn: documents.requestDownload, onSuccess: invalidate });
};

export const useLinkDocument = () => {
  const invalidate = useInvalidator(['documentLinks']);
  return useMutation({ mutationFn: documents.linkDocument, onSuccess: invalidate });
};

export const useUnlinkDocument = () => {
  const invalidate = useInvalidator(['documentLinks']);
  return useMutation({ mutationFn: documents.unlinkDocument, onSuccess: invalidate });
};

// --- comments, and the step from one version to the next (M9-14, M7-17) -----

export const useDocumentComments = (documentId: string | null) =>
  useQuery({
    queryKey: ['documentComments', documentId],
    queryFn: () => documents.fetchDocumentComments(documentId as string),
    enabled: documentId != null,
  });

export const useVersionSteps = (documentId: string | null) =>
  useQuery({
    queryKey: ['versionSteps', documentId],
    queryFn: () => documents.fetchVersionSteps(documentId as string),
    enabled: documentId != null,
  });

export function useAddDocumentComment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: documents.addDocumentComment,
    onSuccess: () => void client.invalidateQueries({ queryKey: ['documentComments'] }),
  });
}

export function useResolveDocumentComment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: documents.resolveDocumentComment,
    onSuccess: () => void client.invalidateQueries({ queryKey: ['documentComments'] }),
  });
}

// ---------------------------------------------------------------------------
// Hukukî muhafaza ve saklama (M9-11, M9-13)
// ---------------------------------------------------------------------------
//
// Muhafaza konulduğunda ya da kaldırıldığında `retentionDue` de
// geçersizleşiyor: görünümün `state` kolonu muhafazaya bakıyor, yani bir
// muhafaza kaydı saklama listesini DEĞİŞTİRİYOR. İkisini ayrı ayrı
// geçersizleştirmek, ekranda muhafazalı bir belgeyi "süresi doldu" diye
// bırakmak olurdu.

export const useHolds = (documentId: string | null) =>
  useQuery({
    queryKey: ['holds', documentId],
    queryFn: () => documents.fetchHolds(documentId as string),
    enabled: documentId != null,
  });

export const useRetentionDue = () =>
  useQuery({ queryKey: ['retentionDue'], queryFn: documents.fetchRetentionDue });

export const useRetentionPolicies = () =>
  useQuery({ queryKey: ['retentionPolicies'], queryFn: documents.fetchRetentionPolicies });

const afterAHold = (client: ReturnType<typeof useQueryClient>) => () => {
  void client.invalidateQueries({ queryKey: ['holds'] });
  void client.invalidateQueries({ queryKey: ['retentionDue'] });
};

export function usePlaceHold() {
  const client = useQueryClient();
  return useMutation({ mutationFn: documents.placeHold, onSuccess: afterAHold(client) });
}

export function useReleaseHold() {
  const client = useQueryClient();
  return useMutation({ mutationFn: documents.releaseHold, onSuccess: afterAHold(client) });
}

export function useSaveRetentionPolicy() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: documents.saveRetentionPolicy,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['retentionPolicies'] });
      void client.invalidateQueries({ queryKey: ['retentionDue'] });
    },
  });
}
