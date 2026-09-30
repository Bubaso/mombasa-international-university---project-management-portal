import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as documents from './documents';

export const useDocuments = () =>
  useQuery({ queryKey: ['documents'], queryFn: documents.fetchDocuments });

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
export const useAccessLog = (documentId: string | null) =>
  useQuery({
    queryKey: ['documentAccess', documentId],
    queryFn: () => documents.fetchAccessLog(documentId as string),
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
  const invalidate = useInvalidator(['documents']);
  return useMutation({ mutationFn: documents.createDocument, onSuccess: invalidate });
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
