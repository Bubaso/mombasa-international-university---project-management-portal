/**
 * Comments inside a document, and the step from one version to the next
 * (M9-14, M7-17).
 *
 * Both requirements ask for something this portal cannot give. It does not
 * read document content — the vault holds where the bytes are and the digest
 * the server computed over them — so there is no text range to highlight and
 * no drawing geometry to diff. A highlight would be a rectangle at a position
 * that moves with the viewer; a "changed areas" overlay would be invented.
 *
 * What goes in instead is what can be checked:
 *
 *   * a comment anchored to a version and a page, carrying the passage the
 *     commenter transcribed themselves — labelled as their transcription,
 *     because the portal cannot confirm those words are on that page;
 *
 *   * and the standing of that anchor: a newer version means page 12 of the
 *     file the comment was written against may not be page 12 of the file in
 *     force, and only a person re-reading it can say whether it still lands;
 *
 *   * for the versions, the facts: the revision label and the change note
 *     whoever issued it wrote, and a verdict on the bytes that has three
 *     values, because "different" is a claim the portal can only make about
 *     two files it has read.
 */
import React, { useState } from 'react';
import { AlertTriangle, Equal, FileDiff, MessageSquare, Quote } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import * as vault from '../../api/documentHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, TextInput, WriteError } from '../ui/Controls';
import type { BytesVerdict, DocumentComment } from '../../types';

const when = (iso: string): string =>
  new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * The bytes verdict in words. `unread` deliberately does not read as
 * "unchanged" or "changed": the portal has not read one of the two files, so
 * it has no standing to say either.
 */
function bytesWords(verdict: BytesVerdict, tr: boolean): { text: string; grave: boolean } {
  switch (verdict) {
    case 'byte_identical':
      return {
        text: tr
          ? 'bu iki sürüm bayt bayt aynı — aynı dosya iki kez yüklenmiş olabilir'
          : 'these two versions are byte-identical — the same file may have been uploaded twice',
        grave: true,
      };
    case 'different_bytes':
      return {
        text: tr
          ? 'dosyalar farklı (iki digest karşılaştırıldı)'
          : 'the files differ (two digests compared)',
        grave: false,
      };
    case 'unread':
      return {
        text: tr
          ? 'sunucu iki dosyanın ikisini de okumadı — farklı mı aynı mı söylenemez'
          : 'the server has not read both files — whether they differ cannot be said',
        grave: false,
      };
  }
}

function anchorWords(comment: DocumentComment, tr: boolean): string {
  const page =
    comment.pageNo == null
      ? tr
        ? 'belgenin tamamı hakkında'
        : 'about the document as a whole'
      : tr
        ? `sayfa ${comment.pageNo}`
        : `page ${comment.pageNo}`;
  const version = tr
    ? `sürüm ${comment.versionNo}${comment.revisionLabel != null ? ` (${comment.revisionLabel})` : ''}`
    : `version ${comment.versionNo}${comment.revisionLabel != null ? ` (${comment.revisionLabel})` : ''}`;
  return `${version} · ${page}`;
}

export const CommentsAndVersions: React.FC<{ documentId: string }> = ({ documentId }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const { user } = useAuth();

  const comments = vault.useDocumentComments(documentId);
  const steps = vault.useVersionSteps(documentId);
  const versions = vault.useVersions(documentId);
  const add = vault.useAddDocumentComment();

  const [versionId, setVersionId] = useState('');
  const [page, setPage] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');

  const commentRows = comments.data ?? [];
  const stepRows = steps.data ?? [];
  const versionRows = versions.data ?? [];

  return (
    <div className="space-y-3">
      <QueryStatus queries={[comments, steps]} />

      {/* M7-17: the step from one version to the next, as recorded. */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <header className="mb-1.5 flex items-start gap-2">
          <FileDiff className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-slate-900">
              {tr ? 'Sürümler arasındaki adım' : 'The step from one version to the next'}
            </h4>
            <p className="text-xs leading-relaxed text-slate-500">
              {tr
                ? 'Portal çizimin içini okumuyor, bu yüzden "değişen alanlar" diye bir katman yok — olsa uydurma olurdu. Burada duran şey kayıtlı olan: revizyonu çıkaranın yazdığı değişiklik notu, ve sunucunun kendi hesapladığı iki digest.'
                : 'The portal does not read inside a drawing, so there is no "changed areas" overlay — it would be invented. What is here is what was recorded: the change note whoever issued the revision wrote, and the two digests the server computed itself.'}
            </p>
          </div>
        </header>
        {stepRows.length === 0 ? (
          <p className="text-xs text-slate-500">
            {tr
              ? 'Karşılaştırılacak ikinci bir sürüm yok.'
              : 'There is no second version to compare against.'}
          </p>
        ) : (
          <ul className="space-y-1.5" aria-label={tr ? 'Sürüm adımları' : 'Version steps'}>
            {stepRows.map((step) => {
              const bytes = bytesWords(step.bytesVerdict, tr);
              return (
                <li
                  key={step.laterVersionId}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-mono text-slate-700">
                      v{step.earlierVersionNo}
                      {step.earlierRevisionLabel != null && ` ${step.earlierRevisionLabel}`} → v
                      {step.laterVersionNo}
                      {step.laterRevisionLabel != null && ` ${step.laterRevisionLabel}`}
                    </span>
                    <span className="text-slate-500">{when(step.laterUploadedAt)}</span>
                    {step.bytesVerdict === 'byte_identical' && (
                      <Equal className="h-3 w-3 shrink-0 text-amber-700" aria-hidden="true" />
                    )}
                  </div>
                  <p
                    className={`text-xs ${bytes.grave ? 'font-medium text-amber-800' : 'text-slate-500'}`}
                  >
                    {bytes.text}
                  </p>
                  <p className="text-xs text-slate-700">
                    {step.changeNotDescribed ? (
                      <span className="text-amber-800">
                        {tr ? 'Neyin değiştiği kayıtlı değil' : 'Nobody wrote down what changed'}
                      </span>
                    ) : (
                      ((tr ? step.changeSummaryTr : step.changeSummaryEn) ??
                      step.changeSummaryEn ??
                      '')
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* M9-14: the comments. */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <header className="mb-1.5 flex items-start gap-2">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-slate-900">
              {tr ? 'Belge üzerine yorumlar' : 'Comments on the document'}
            </h4>
            <p className="text-xs leading-relaxed text-slate-500">
              {tr
                ? 'Yorum bir sürüme ve bir sayfaya bağlanır; metin içinde vurgulama yok, çünkü portal metnin nerede olduğunu bilmiyor ve çizilecek dikdörtgen görüntüleyici değişince yerinden kayar. Alıntı, yorumu yazanın kendi aktardığı metindir — portal bunu belgede doğrulamıyor.'
                : 'A comment is anchored to a version and a page. There is no highlight inside the text, because the portal does not know where the text is and a rectangle would move with the viewer. The excerpt is the commenter’s own transcription — the portal does not verify it against the document.'}
            </p>
          </div>
        </header>

        {user != null && versionRows.length > 0 && (
          <form
            className="mb-2 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-4"
            aria-label={tr ? 'Yorum ekle' : 'Add a comment'}
            onSubmit={(event) => {
              event.preventDefault();
              const chosen = versionId === '' ? (versionRows[0]?.id ?? '') : versionId;
              if (body.trim() === '' || chosen === '') return;
              add.mutate(
                {
                  documentId,
                  documentVersionId: chosen,
                  pageNo: page === '' ? null : Number(page),
                  quotedExcerpt: excerpt.trim() === '' ? null : excerpt.trim(),
                  bodyEn: body.trim(),
                  profileId: user.id,
                },
                {
                  onSuccess: () => {
                    setPage('');
                    setExcerpt('');
                    setBody('');
                  },
                },
              );
            }}
          >
            <Field label={tr ? 'Sürüm' : 'Version'}>
              <select
                value={versionId === '' ? (versionRows[0]?.id ?? '') : versionId}
                onChange={(event) => setVersionId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
              >
                {versionRows.map((version) => (
                  <option key={version.id} value={version.id}>
                    v{version.versionNo} · {version.fileName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={tr ? 'Sayfa (varsa)' : 'Page (if any)'}>
              <TextInput
                type="number"
                min={1}
                value={page}
                onChange={(event) => setPage(event.target.value)}
              />
            </Field>
            <Field label={tr ? 'Aktardığınız metin' : 'The passage you transcribe'}>
              <TextInput value={excerpt} onChange={(event) => setExcerpt(event.target.value)} />
            </Field>
            <Field label={tr ? 'Yorum' : 'Comment'}>
              <TextInput value={body} onChange={(event) => setBody(event.target.value)} required />
            </Field>
            <div className="sm:col-span-4">
              <ActionButton type="submit" disabled={add.isPending}>
                {tr ? 'Yorumu ekle' : 'Add the comment'}
              </ActionButton>
              <WriteError error={add.error} />
            </div>
          </form>
        )}

        {commentRows.length === 0 ? (
          <p className="text-xs text-slate-500">
            {tr ? 'Bu belgeye yorum yazılmamış.' : 'No comment has been written on this document.'}
          </p>
        ) : (
          <ul className="space-y-1.5" aria-label={tr ? 'Belge yorumları' : 'Document comments'}>
            {commentRows.map((comment) => (
              <li
                key={comment.commentId}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
              >
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-mono text-slate-600">{anchorWords(comment, tr)}</span>
                  <span className="text-slate-500">{when(comment.createdAt)}</span>
                  {comment.resolvedAt != null && (
                    <Pill className="border-emerald-200 bg-emerald-50 text-emerald-800">
                      {tr ? 'kapatıldı' : 'closed'}
                    </Pill>
                  )}
                </div>

                {comment.quotedExcerpt != null && (
                  <p className="mt-1 flex items-start gap-1.5 border-l-2 border-slate-300 pl-2 text-xs text-slate-700">
                    <Quote className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" aria-hidden="true" />
                    <span>
                      {comment.quotedExcerpt}
                      <span className="ml-1 text-slate-500">
                        {tr
                          ? '— yorumu yazanın aktardığı metin; portal bunu belgede doğrulamadı'
                          : "— the commenter's transcription; the portal has not verified it against the document"}
                      </span>
                    </span>
                  </p>
                )}

                <p className="mt-0.5 text-sm text-slate-800">
                  {(tr ? comment.bodyTr : comment.bodyEn) ?? comment.bodyEn ?? ''}
                </p>

                {comment.writtenAgainstASupersededVersion && (
                  <p className="mt-0.5 flex items-start gap-1.5 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>
                      {tr
                        ? `Bu yorum sürüm ${comment.versionNo}'e yazıldı; yürürlükteki sürüm ${comment.currentVersionNo}. ${comment.pageNo != null ? `Sayfa ${comment.pageNo} artık aynı sayfa olmayabilir.` : ''}`
                        : `Written against version ${comment.versionNo}; version ${comment.currentVersionNo} is in force. ${comment.pageNo != null ? `Page ${comment.pageNo} may not be the same page any more.` : ''}`}
                    </span>
                  </p>
                )}

                {comment.portalHasNotReadTheFile && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {tr
                      ? 'Sunucu bu sürümün dosyasını hiç okumadı, bu yüzden yorumun hangi baytlar hakkında olduğu teyit edilemiyor.'
                      : 'The server has never read this version’s file, so which bytes the comment is about cannot be confirmed.'}
                  </p>
                )}

                {comment.resolutionNote != null && (
                  <p className="mt-0.5 text-xs text-slate-600">
                    {tr ? 'Kapatma gerekçesi: ' : 'Closed because: '}
                    {comment.resolutionNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
