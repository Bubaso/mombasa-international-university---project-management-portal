import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import * as access from '../api/adminHooks';
import { QueryStatus } from '../components/QueryStatus';
import { AccessSummary } from '../components/admin/AccessSummary';
import { PeopleSection } from '../components/admin/PeopleSection';
import { ScopeSection } from '../components/admin/ScopeSection';
import { SharingSection } from '../components/admin/SharingSection';
import { DelegationSection } from '../components/admin/DelegationSection';
import { AuditSection } from '../components/admin/AuditSection';
import { AccessReviewSection } from '../components/admin/AccessReviewSection';
import { IntakeScopeSection } from '../components/admin/IntakeScopeSection';
import { ACCESS_MANAGERS, ACCESS_REVIEWERS, AUDIT_READERS, actsAs } from '../lib/authority';

/**
 * Access and administration.
 *
 * Six parts, each shown to the people the policies actually let use it. The
 * rule this follows throughout: never offer a control the database will
 * refuse. A button that fails leaves a person unsure whether the system is
 * broken or they are not allowed, and in a portal where trustees, advocates
 * and contractors share one login screen that ambiguity is the thing to
 * avoid.
 *
 * Nothing here is the boundary. Every query and every write is checked again
 * by a policy in supabase/migrations/0003 and 0005, so a person who edits
 * their way past this view reaches exactly nothing new.
 */
export const AdminConsoleView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';

  const authorityQuery = access.useAuthority();
  const authority = authorityQuery.data;

  const isInternal = authority?.isInternal ?? false;
  const canAdminister = actsAs(authority, 'admin');
  const canManageAccess = actsAs(authority, ...ACCESS_MANAGERS);
  const canReadAudit = actsAs(authority, ...AUDIT_READERS);
  const canReview = actsAs(authority, ...ACCESS_REVIEWERS);

  /**
   * Sekmeler, ve hangisinin kime görüneceği.
   *
   * `shown` burada bir yetki uygulaması değil: her sorgu ve her yazma yine
   * politikalar tarafından denetleniyor. Burada yapılan tek şey veritabanının
   * reddedeceği bir sekmeyi hiç sunmamak — reddedilen bir düğme, insanı
   * "sistem mi bozuk, ben mi yetkisizim" arasında bırakır.
   */
  const TABS = [
    { id: 'people' as const, tr: 'Kişiler', en: 'People', shown: true },
    { id: 'scope' as const, tr: 'Kapsam', en: 'Scope', shown: isInternal },
    { id: 'sharing' as const, tr: 'Paylaşım', en: 'Sharing', shown: isInternal },
    { id: 'delegation' as const, tr: 'Yetki devri', en: 'Delegation', shown: isInternal },
    { id: 'review' as const, tr: 'Gözden geçirme', en: 'Review', shown: canReadAudit },
    { id: 'audit' as const, tr: 'Denetim kaydı', en: 'Audit trail', shown: canReadAudit },
    // M13-17: kapsam bir kayıt, ve kaydın görünmediği yerde değiştirilmesi
    // bir SQL güncellemesi demek. Bu sekme o boşluğu kapatıyor.
    { id: 'intake' as const, tr: 'Asistanın kapsamı', en: "Assistant's scope", shown: isInternal },
  ];

  // Açılışta en hafif ve her role görünen sekme. Ölçülen: Kişiler 517px,
  // Kapsam 2.285 — açılışı ağır olanla yapmak, sekmenin kazancını geri verir.
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('people');

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {tr ? 'Erişim ve Yönetim' : 'Access & Administration'}
          </h1>
          <p className="text-sm text-slate-500">
            {tr
              ? 'Kişiler, yetkileri ve denetim kaydı.'
              : 'People, their access, and the audit record.'}
          </p>
        </div>
      </header>

      <QueryStatus queries={[authorityQuery]} />

      <AccessSummary authority={authority} />

      {/* SEKMELER, T14-04'ün kalıbı — ve bu tur ölçülerek geldi.
          8 Ekim 2026: `/admin` telefonda 10.743px, kurgusu 8.931px, kriter
          2.532. Bölüm bölüm ölçüldü ve yedi bölümün yedisi birden
          çiziliyordu: Kapsam 2.285px, Gözden geçirme 2.579, Paylaşım 1.783,
          Devir 1.563, Sizin erişiminiz 601, Denetim 880, Kişiler 517.
          Hiçbirini silmek doğru değil — hepsi birinin işi.
          Sekme, `/governance` ve `/project_info`'da zaten kurulmuş kalıp:
          aynı anda bir bölüm çiziliyor, hiçbir işlev kaybolmuyor, yeri
          değişiyor. Telefona özel ikinci bir düzen yazmak aynı ekranı iki
          yere yazmak olurdu (CLAUDE.md §4).
          "Sizin erişiminiz" sekmelerin DIŞINDA: okuyanın kendi yetkisi, ve
          bir sekmenin arkasına koymak "ben ne yapabiliyorum" sorusunu
          tıklamaya bağlamak olurdu. */}
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.filter((t) => t.shown).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-11 min-w-11 cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors md:min-h-8 ${
              tab === t.id
                ? 'border-amber-400 bg-amber-50 text-amber-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tr ? t.tr : t.en}
          </button>
        ))}
      </div>

      {tab === 'people' && <PeopleSection canAdminister={canAdminister} />}

      {/* Scope, sharing and delegation are readable by the internal team. An
          external party's own scope and grants are in "Your access" above,
          which is all their policies let them read anyway. */}
      {isInternal && tab === 'scope' && <ScopeSection canManage={canManageAccess} />}
      {isInternal && tab === 'sharing' && <SharingSection canManage={canManageAccess} />}
      {isInternal && tab === 'delegation' && <DelegationSection authority={authority} />}

      {/* M1-11. Denetim kaydıyla aynı kümeye açık, ve bu bir tesadüf değil:
          kuyruk `audit_log`'dan okuyor, yani satırı gören denetim kaydını da
          görebilmek zorunda — yoksa boş bir hücre "kayıt yok" ile
          "göremezsin" arasında belirsiz kalır. 0055 ikisini aynı
          fonksiyona bağlıyor. */}
      {canReadAudit && tab === 'review' && <AccessReviewSection canReview={canReview} />}

      {canReadAudit && tab === 'audit' && <AuditSection />}

      {isInternal && tab === 'intake' && <IntakeScopeSection canManage={canAdminister} />}

      {!isInternal && (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-500">
          {tr
            ? 'Eksik gördüğünüz erişim için proje direktörüne başvurun.'
            : 'For access you think is missing, ask the project director.'}
        </p>
      )}
    </div>
  );
};
