import React, { useCallback, useMemo, useState } from 'react';
import { FolderGit2, Search, Plus, FileCheck2, FileX2, History, Eye, Link2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import * as vault from '../api/documentHooks';
import { useAuthority } from '../api/adminHooks';
import { QueryStatus } from '../components/QueryStatus';
import { EmptyState } from '../components/EmptyState';
import { clearanceLabel, clearanceStyle } from '../lib/authority';
import { DOCUMENT_CATEGORIES, categoryLabel, fileSize, shortDigest } from '../lib/documents';
import {
  ActionButton,
  Field,
  Pill,
  Select,
  TextInput,
  WriteError,
} from '../components/ui/Controls';
import { DocumentDetail } from '../components/documents/DocumentDetail';
import type { Confidentiality, DocumentCategory, DocumentItem, DocumentVersion } from '../types';
import { MoreRows } from '../components/ui/MoreRows';

/**
 * The document vault (M9).
 *
 * What this screen used to be is worth stating, because it is what the design
 * is a reaction to: it displayed "encrypted", "SHA-256 verified" and "securely
 * stored" on a page where no file could be uploaded at all. Faz 0 removed the
 * words. This holds the documents.
 *
 * Two things are therefore shown exactly as they are. A version is verified
 * when the server has read the stored bytes and recorded their digest, and
 * not before — so a freshly uploaded file reads as unverified for as long as
 * that takes, and says why. And nothing on this page claims encryption: what
 * the storage provider does at rest is not something this application is in a
 * position to attest to.
 */
export const DocumentVaultView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';

  const PAGE = 40;

  const [limit, setLimit] = React.useState(40);

  const documents = vault.useDocuments(limit);
  const versions = vault.useCurrentVersions();
  const undigested = vault.useUndigestedCount();
  const authority = useAuthority();

  const canWrite =
    authority.data != null &&
    ['admin', 'project_director', 'field_team', 'board_director'].some((role) =>
      authority.data?.roles.includes(role as never),
    );

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<DocumentCategory | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = documents.data?.rows ?? [];

  const versionById = useMemo(() => {
    const byId = new Map<string, DocumentVersion>();
    for (const version of versions.data ?? []) byId.set(version.id, version);
    return byId;
  }, [versions.data]);

  const currentVersion = useCallback(
    (doc: DocumentItem): DocumentVersion | null =>
      doc.currentVersionId ? (versionById.get(doc.currentVersionId) ?? null) : null,
    [versionById],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((doc) => {
      if (category && doc.category !== category) return false;
      if (!needle) return true;
      const version = currentVersion(doc);
      return [doc.title, doc.descriptionEn, doc.descriptionTr, version?.fileName, version?.sha256]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(needle));
    });
  }, [rows, query, category, currentVersion]);

  const selected = rows.find((d) => d.id === selectedId) ?? null;
  // Kasanın tamamından: dilimin içinden saymak bir bütünlük rakamını az
  // gösterirdi, ki bu rozeti hiç koymamaktan kötü.
  const unverified = undigested.data ?? 0;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <FolderGit2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {tr ? 'Belge Kasası' : 'Document Vault'}
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">
              {tr
                ? 'Mahkemeye sunulacak evrak, tasdikli suretler, senet, sözleşmeler ve çizimler.'
                : 'Court filings, certified copies, the deed, contracts and drawings.'}
            </p>
          </div>
        </div>
        {canWrite && !adding && (
          <ActionButton tone="primary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr ? 'Belge ekle' : 'Add a document'}</span>
          </ActionButton>
        )}
      </header>

      <QueryStatus queries={[documents]} />

      {unverified > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5">
          <FileX2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-amber-900">
            <span className="font-semibold">
              {tr
                ? `${unverified} belgenin geçerli sürümü doğrulanmamış.`
                : `${unverified} documents have an unverified current version.`}
            </span>{' '}
            {tr
              ? 'Doğrulanmış demek, sunucunun depodaki baytları okuyup özetini kaydetmiş olması demek — başka bir şey değil. Yükleme yeni bittiyse birkaç saniye sürebilir; sürmüşse dosya depoya ulaşmamış olabilir.'
              : 'Verified here means the server read the stored bytes and recorded their digest, and nothing else. Just after an upload this takes a moment; if it persists, the file may not have reached storage.'}
          </p>
        </div>
      )}

      {adding && <NewDocumentForm onDone={() => setAdding(false)} />}

      <div className="flex flex-wrap items-end gap-2">
        <Field label={tr ? 'Ara' : 'Search'} className="min-w-[180px] flex-1">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr ? 'Başlık, dosya adı, özet…' : 'Title, file name, digest…'}
              className="pl-8"
            />
          </div>
        </Field>
        <Field label={tr ? 'Kategori' : 'Category'}>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as DocumentCategory | '')}
          >
            <option value="">{tr ? 'Hepsi' : 'All'}</option>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c, language)}
              </option>
            ))}
          </Select>
        </Field>
        <span className="pb-1.5 text-xs text-slate-500">
          {tr ? `${shown.length} belge` : `${shown.length} documents`}
        </span>
      </div>

      <div className={selected ? 'grid grid-cols-1 gap-4 xl:grid-cols-[1fr_400px]' : ''}>
        <div className="min-w-0">
          {shown.length === 0 ? (
            <EmptyState
              icon={FolderGit2}
              title={tr ? 'Kasa boş' : 'The vault is empty'}
              description={
                rows.length === 0
                  ? tr
                    ? 'Henüz belge yüklenmemiş. Her yükleme yeni bir sürümdür; eski sürümler silinmez ve hangisinin geçerli olduğu her zaman işaretlidir.'
                    : 'Nothing uploaded yet. Every upload is a new version, older ones are never removed, and which one is in force is always marked.'
                  : tr
                    ? 'Bu filtrelerle eşleşen belge yok.'
                    : 'Nothing matches those filters.'
              }
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
              <ul className="divide-y divide-slate-100">
                {shown.map((doc) => {
                  const version = currentVersion(doc);
                  return (
                    <li key={doc.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(doc.id)}
                        className={`flex w-full cursor-pointer flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50 ${
                          doc.id === selectedId ? 'bg-amber-50' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium text-slate-900">{doc.title}</span>
                            <Pill>{categoryLabel(doc.category, language)}</Pill>
                            {doc.confidentiality !== 'internal' && (
                              <Pill className={clearanceStyle(doc.confidentiality)}>
                                {clearanceLabel(doc.confidentiality, language)}
                              </Pill>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                            {version ? (
                              <>
                                <span className="font-mono">{version.fileName}</span>
                                <span>{fileSize(version.byteSize)}</span>
                                <span className="flex items-center gap-1">
                                  <History className="h-3 w-3" aria-hidden="true" />
                                  {tr
                                    ? `sürüm ${version.versionNo}`
                                    : `version ${version.versionNo}`}
                                  {doc.versionCount > 1 && (
                                    <span className="text-slate-500">
                                      {tr
                                        ? ` · ${doc.versionCount} sürüm`
                                        : ` · ${doc.versionCount} in all`}
                                    </span>
                                  )}
                                </span>
                              </>
                            ) : (
                              <span className="text-amber-700">
                                {tr ? 'dosya yüklenmemiş' : 'no file uploaded'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {version &&
                            (version.sha256 ? (
                              <span
                                className="flex items-center gap-1 text-xs text-emerald-700"
                                title={version.sha256}
                              >
                                <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="hidden font-mono sm:inline">
                                  {shortDigest(version.sha256)}
                                </span>
                              </span>
                            ) : (
                              <span
                                className="flex items-center gap-1 text-xs text-amber-700"
                                title={
                                  tr
                                    ? 'Sunucu henüz baytları okuyup özetini kaydetmedi'
                                    : 'The server has not yet read the bytes and recorded their digest'
                                }
                              >
                                <FileX2 className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="hidden sm:inline">
                                  {tr ? 'doğrulanmadı' : 'unverified'}
                                </span>
                              </span>
                            ))}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <MoreRows
                shown={(documents.data?.rows ?? []).length}
                total={documents.data?.total ?? 0}
                onMore={() => setLimit(limit + PAGE)}
                busy={documents.isFetching}
              />
            </div>
          )}
        </div>

        {selected && (
          <DocumentDetail
            document={selected}
            canWrite={canWrite}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
        <Eye className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        <span>
          {tr
            ? 'Bir belgeyi açmanın ya da indirmenin tek yolu sunucudan geçiyor ve her seferinde kimin ne zaman okuduğu kaydediliyor. Bu kaydı hiçbir istemci yazamaz, değiştiremez ve silemez.'
            : 'The only route to a file is through the server, and every route through it records who read what and when. No client can write, edit or delete that record.'}
        </span>
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------

const NewDocumentForm: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = vault.useCreateDocument();
  const upload = vault.useUploadVersion();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('other');
  const [description, setDescription] = useState('');
  const [confidentiality, setConfidentiality] = useState<Confidentiality>('internal');
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pending = create.isPending || upload.isPending;

  return (
    <form
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !file) return;
        setNotice(null);
        create.mutate(
          {
            title: title.trim(),
            category,
            descriptionEn: description.trim() || null,
            confidentiality,
          },
          {
            onSuccess: (created) =>
              upload.mutate(
                { documentId: created.id, file, note: null },
                {
                  onSuccess: (outcome) => {
                    if (outcome.verificationError) {
                      // The file is stored and the record exists; only the
                      // digest is missing, and the list will say so.
                      setNotice(outcome.verificationError);
                      return;
                    }
                    onDone();
                  },
                },
              ),
          },
        );
      }}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Field label={tr ? 'Başlık' : 'Title'} className="sm:col-span-2">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label={tr ? 'Kategori' : 'Category'}>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as DocumentCategory)}
          >
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Açıklama' : 'Description'} className="sm:col-span-2">
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={tr ? 'Gizlilik' : 'Tier'}>
          <Select
            value={confidentiality}
            onChange={(e) => setConfidentiality(e.target.value as Confidentiality)}
          >
            <option value="public">{tr ? 'Açık' : 'Public'}</option>
            <option value="internal">{tr ? 'Kuruma özel' : 'Internal'}</option>
            <option value="confidential">{tr ? 'Gizli' : 'Confidential'}</option>
            <option value="restricted">{tr ? 'Kısıtlı' : 'Restricted'}</option>
          </Select>
        </Field>
        <Field label={tr ? 'Dosya' : 'File'} className="sm:col-span-3">
          <input
            type="file"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-slate-100 file:px-2.5 file:py-1 file:text-sm file:font-medium file:text-slate-700"
          />
        </Field>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        {tr
          ? 'Dosya yüklendikten sonra sunucu depodaki baytları okuyup SHA-256 özetini kaydeder. Bu kaydedilene kadar belge "doğrulanmadı" görünür — ve bu işaret hiçbir kullanıcı tarafından konulamaz ya da kaldırılamaz.'
          : 'After the upload the server reads the stored bytes and records their SHA-256. Until it has, the document reads as unverified — and that mark is not something any user can set or clear.'}
      </p>

      <WriteError error={create.error ?? upload.error} />
      {notice && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
          {tr
            ? `Dosya yüklendi ama özeti hesaplanamadı: ${notice}`
            : `The file was stored but its digest could not be computed: ${notice}`}
        </p>
      )}

      <div className="mt-2.5 flex justify-end gap-2">
        <ActionButton type="button" onClick={onDone} disabled={pending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={pending || !file}>
          <Link2 className="h-3 w-3" aria-hidden="true" />
          <span>{pending ? (tr ? 'Yükleniyor…' : 'Uploading…') : tr ? 'Yükle' : 'Upload'}</span>
        </ActionButton>
      </div>
    </form>
  );
};
