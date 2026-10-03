-- ---------------------------------------------------------------------------
-- 0052 — Sözleşme kütüğü bitmiş sözleşmeyi de göstersin (M14-03, M14-04).
--
-- Kütük turunda çıkan kusur, geri çekmenin tersi: ekran bitmiş kaydı eşit
-- ağırlıkta göstermiyordu, **hiç göstermiyordu.**
--
-- `ContractPanel` "Sözleşme kütüğü" başlığıyla `contract_alerts` görünümünü
-- okuyor ve o görünüm 0022'de
--
--     where c.state in ('draft', 'signed', 'active', 'suspended')
--
-- ile süzülüyor. Görünümün kendisi dürüst — adı "alerts", işi 90/60/30
-- uyarısı, ve bitmiş bir sözleşme için "bitiyor" uyarısı üretmemesi doğru
-- (0022'deki yorum bunu söylüyor). Kusur, uyarı akışının kütük yerine
-- kullanılması: süresi dolmuş ya da feshedilmiş bir sözleşmenin şartları,
-- M2'de doğurduğu yükümlülükler, ödeme planı ve performans değerlendirmeleri
-- portalın hiçbir yerinden görünmüyordu. Bir ihtilafta ya da denetimde en çok
-- okunacak sözleşme, tam olarak sona ermiş olandır.
--
-- Çözüm görünümü genişletmek değil, ikiye ayırmak:
--
--   `contract_register` — her sözleşme, hesaplanan kolonlarıyla. Kütüğün
--   okuduğu şey. Uyarı bantları yalnız canlı sözleşmeler için dolu: biten bir
--   sözleşmenin bitiş tarihi geçmiştir ve `notice_band` ona 'overdue' derdi,
--   yani ekran feshedilmiş bir sözleşme için "süresi geçti" uyarısı verirdi.
--   Bilinmeyeni değil, yanlışı ekrana çıkarmak olurdu.
--
--   `contract_alerts` — aynı kolonlar, canlı sözleşmelerle sınırlı. Dışarıdan
--   bakıldığında değişmedi; artık kendi SELECT'ini tekrar etmiyor.
--
-- RLS ikisinde de sözleşmenin kendi politikasından geliyor
-- (`security_invoker = true`), yani bu migration kimseye yeni bir satır
-- göstermiyor — yalnız görmeye hakkı olanın bitmiş sözleşmesini saklamayı
-- bırakıyor.
-- ---------------------------------------------------------------------------

-- Hangi sözleşme hâlâ birinin işi? Bu küme 0022'de iki ayrı yerde elle
-- yazılacaktı (görünümün WHERE'i ve bandın CASE'i). Bir kez yazılıyor, ve
-- `tests/register-states.mjs` onu `src/lib/registerStates.ts`'teki
-- `contract_state.open` hükmüne bağlıyor: hüküm değişirse test bu satırı adıyla
-- söylüyor. SQL bir TypeScript sabitini okuyamıyor; yapılabilecek olan kopyayı
-- bağlamak (CLAUDE.md §4).
create or replace function app.contract_is_open(p_state contract_state)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_state in ('draft', 'signed', 'active', 'suspended');
$$;

comment on function app.contract_is_open(contract_state) is
  'Whether a contract still binds somebody. The one SQL copy of the '
  'open/settled judgment for contract_state, bound to src/lib/registerStates.ts '
  'by tests/register-states.mjs.';

create or replace view contract_register with (security_invoker = true) as
select
  c.id as contract_id,
  c.reference_no,
  c.counterparty_name,
  c.subject_en,
  c.subject_tr,
  c.state,
  c.starts_on,
  c.ends_on,
  c.renewal_on,
  c.notice_days,
  c.value_amount,
  c.value_currency,
  c.value_amount_kes,
  c.value_basis,
  -- The renewal decision usually falls due before the contract does, so both
  -- dates get a band and the screen sorts on whichever is sooner. A contract
  -- that has ended gets no band at all: 'overdue' on a terminated contract
  -- would be a warning about something nobody has to do.
  case when app.contract_is_open(c.state) then app.notice_band(c.renewal_on) end as renewal_band,
  case when app.contract_is_open(c.state) then app.notice_band(c.ends_on) end as expiry_band,
  least(
    coalesce(c.renewal_on, 'infinity'::date),
    coalesce(c.ends_on, 'infinity'::date)
  ) as next_date,
  case
    when c.ends_on is not null then c.ends_on - current_date
  end as days_to_expiry,
  case
    when c.renewal_on is not null then c.renewal_on - current_date
  end as days_to_renewal,
  -- Whether anybody has already written the next contract. A renewal nobody
  -- has drafted is the thing the alert is for.
  exists (
    select 1 from contracts n where n.supersedes_contract_id = c.id
  ) as renewal_drafted,
  c.confidentiality
from contracts c;

comment on view contract_register is
  'Every contract on the register, ended ones included (M14-03). The alert '
  'bands are null once a contract is no longer open, because a band on a '
  'contract that has ended would warn about nothing. contract_alerts is this '
  'view narrowed to the ones still live.';

-- Aynı kolonlar, aynı sırada: `create or replace view` bunu şart koşuyor.
create or replace view contract_alerts with (security_invoker = true) as
select
  contract_id,
  reference_no,
  counterparty_name,
  subject_en,
  subject_tr,
  state,
  starts_on,
  ends_on,
  renewal_on,
  notice_days,
  value_amount,
  value_currency,
  value_amount_kes,
  value_basis,
  renewal_band,
  expiry_band,
  next_date,
  days_to_expiry,
  days_to_renewal,
  renewal_drafted,
  confidentiality
from contract_register
where app.contract_is_open(state);

comment on view contract_alerts is
  'Contracts approaching renewal or expiry, in 90/60/30 bands (M14-05). '
  '`renewal_drafted` is the column that closes the loop: a renewal date '
  'nobody has acted on is the one worth surfacing. Since 0052 this is '
  'contract_register narrowed by app.contract_is_open() rather than a second '
  'copy of the same select.';

grant select on contract_register to authenticated;

-- Postgres yeni fonksiyonun EXECUTE'unu PUBLIC'e veriyor ve bunu varsayılan
-- ACL ile geri alamıyorsun (ölçüm 0026). İstisnalar fonksiyonun içinde durur.
select app.reset_function_grants();
