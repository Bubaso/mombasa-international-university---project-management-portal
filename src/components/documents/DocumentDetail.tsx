import React, { useState } from 'react';
import { X, Download, Eye, History, FileCheck2, FileX2, Upload, Copy, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as vault from '../../api/documentHooks';
import { CommentsAndVersions } from './CommentsAndVersions';
import { useAuthority } from '../../api/adminHooks';
import { AUDIT_READERS, actsAs, clearanceLabel, clearanceStyle } from '../../lib/authority';
import { categoryLabel, fileSize, shortDigest } from '../../lib/documents';
import { ActionButton, Field, Pill, TextInput, WriteError } from '../ui/Controls';
import type { DocumentItem } from '../../types';

/**
 * One document: every version of it, who has read it, and what it is attached
 * to.
 *
 * The digest is presented as what it is — a number the server computed from
 * the stored bytes — rather than as a badge saying the file is safe. Somebody
 * who downloads it gets the same number back and can compare, which is the
 * only thing a digest is actually good for.
 */
export const DocumentDetail: React.FC<{
  document: DocumentItem;
  canWrite: boolean;
  onClose: () => void;
}> = ({ document: doc, canWrite, onClose }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  const versions = vault.useVersions(doc.id);
  const authority = useAuthority();
  const canReadLog = actsAs(authority.data, ...AUDIT_READERS);
  const access = vault.useAccessLog(canReadLog ? doc.id : null);
  const download = vault.useRequestDownload();

  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const rows = versions.data ?? [];

  const open = (versionId: string, action: 'viewed' | 'downloaded') =>
    download.mutate(
      { versionId, action },
      {
        onSuccess: (link) => {
          window.open(link.url, '_blank', 'noopener,noreferrer');
        },
      },
    );

  return (
    <aside className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-slate-900">{doc.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Pill>{categoryLabel(doc.category, language)}</Pill>
            <Pill className={clearanceStyle(doc.confidentiality)}>
              {clearanceLabel(doc.confidentiality, language)}
            </Pill>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr ? 'Kapat' : 'Close'}
          className="shrink-0 cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-4 p-4">
        {(doc.descriptionEn ?? doc.descriptionTr) && (
          <p className="text-sm leading-relaxed text-slate-700">
            {(tr ? doc.descriptionTr : doc.descriptionEn) ?? doc.descriptionEn ?? doc.descriptionTr}
          </p>
        )}

        {canWrite &&
          (uploading ? (
            <UploadForm documentId={doc.id} onDone={() => setUploading(false)} />
          ) : (
            <ActionButton onClick={() => setUploading(true)}>
              <Upload className="h-3 w-3" aria-hidden="true" />
              <span>{tr ? 'Yeni sürüm yükle' : 'Upload a new version'}</span>
            </ActionButton>
          ))}

        {/* ---- versions -------------------------------------------------- */}
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <History className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            {tr ? 'Sürümler' : 'Versions'}
            <span className="font-normal text-slate-500">
              {tr ? '— eskiler silinmez' : '— older ones are never removed'}
            </span>
          </h3>

          {rows.length === 0 ? (
            <p className="text-xs text-slate-500">
              {tr ? 'Henüz dosya yüklenmemiş.' : 'No file uploaded yet.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {rows.map((version) => {
                const current = version.id === doc.currentVersionId;
                return (
                  <li
                    key={version.id}
                    className={`rounded-lg border px-2.5 py-2 ${
                      current ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold text-slate-900">
                            v{version.versionNo}
                          </span>
                          {current && (
                            <Pill className="border-amber-400 bg-amber-100 text-amber-900">
                              {tr ? 'geçerli sürüm' : 'in force'}
                            </Pill>
                          )}
                          <span className="truncate text-xs text-slate-700">
                            {version.fileName}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
                          <span>{fileSize(version.byteSize)}</span>
                          <span className="font-mono">{version.uploadedAt.slice(0, 10)}</span>
                          {version.uploadedByName && <span>{version.uploadedByName}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <ActionButton onClick={() => open(version.id, 'viewed')}>
                          <Eye className="h-3 w-3" aria-hidden="true" />
                        </ActionButton>
                        <ActionButton onClick={() => open(version.id, 'downloaded')}>
                          <Download className="h-3 w-3" aria-hidden="true" />
                        </ActionButton>
                      </div>
                    </div>

                    {/* The digest, as a number to compare rather than a badge. */}
                    {version.sha256 ? (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(version.sha256 as string);
                          setCopied(version.id);
                        }}
                        className="mt-1 flex w-full cursor-pointer items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-1 text-left text-xs text-emerald-900 hover:bg-emerald-100"
                      >
                        <FileCheck2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="font-mono">{shortDigest(version.sha256)}</span>
                        <Copy className="ml-auto h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                        {copied === version.id && <span>{tr ? 'kopyalandı' : 'copied'}</span>}
                      </button>
                    ) : (
                      <p className="mt-1 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-1.5 py-1 text-xs leading-relaxed text-amber-900">
                        <FileX2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>
                          {tr
                            ? 'Sunucu bu sürümün baytlarını henüz okumadı; özet kaydedilmedi.'
                            : 'The server has not read this version’s bytes; no digest is recorded.'}
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <WriteError error={download.error} />
        </section>

        {/* ---- who read it ----------------------------------------------- */}
        {canReadLog && (
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Users className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              {tr ? 'Kim okudu' : 'Who has read it'}
            </h3>
            {(access.data ?? []).length === 0 ? (
              <p className="text-xs text-slate-500">
                {tr ? 'Henüz kimse açmamış.' : 'Nobody has opened it yet.'}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {(access.data ?? []).map((entry) => (
                  <li key={entry.id} className="flex items-baseline gap-2 text-xs">
                    <span className="shrink-0 font-mono text-slate-500">
                      {entry.at.slice(0, 16).replace('T', ' ')}
                    </span>
                    <span className="min-w-0 truncate text-slate-700">
                      {entry.readerName ?? entry.profileId}
                      <span className="ml-1.5 text-slate-500">
                        {entry.action === 'downloaded'
                          ? tr
                            ? 'indirdi'
                            : 'downloaded'
                          : tr
                            ? 'görüntüledi'
                            : 'viewed'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Comments and the version steps. Both are about what the portal has
            and has not read, so they belong with the versions rather than on
            a screen of their own (M9-14, M7-17). */}
        <CommentsAndVersions documentId={doc.id} />
      </div>
    </aside>
  );
};

const UploadForm: React.FC<{ documentId: string; onDone: () => void }> = ({
  documentId,
  onDone,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const upload = vault.useUploadVersion();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <form
      className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) return;
        setNotice(null);
        upload.mutate(
          { documentId, file, note: note.trim() || null },
          {
            onSuccess: (outcome) => {
              if (outcome.verificationError) return setNotice(outcome.verificationError);
              onDone();
            },
          },
        );
      }}
    >
      <Field label={tr ? 'Dosya' : 'File'}>
        <input
          type="file"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-slate-100 file:px-2.5 file:py-1 file:text-sm file:font-medium file:text-slate-700"
        />
      </Field>
      <Field label={tr ? 'Bu sürümde ne değişti' : 'What changed in this version'}>
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <p className="text-xs leading-relaxed text-slate-500">
        {tr
          ? 'Yeni sürüm geçerli hâle gelir; öncekiler kalır ve silinemez.'
          : 'The new version becomes the one in force. The earlier ones stay and cannot be removed.'}
      </p>

      <WriteError error={upload.error} />
      {notice && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
          {tr
            ? `Yüklendi ama özeti hesaplanamadı: ${notice}`
            : `Stored, but the digest could not be computed: ${notice}`}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <ActionButton type="button" onClick={onDone} disabled={upload.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={upload.isPending || !file}>
          {upload.isPending ? (tr ? 'Yükleniyor…' : 'Uploading…') : tr ? 'Yükle' : 'Upload'}
        </ActionButton>
      </div>
    </form>
  );
};
