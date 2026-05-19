-- M7_Studio — aggregated stats view used by the dashboard.
-- security_invoker keeps RLS in effect (caller must own the qr_codes row).

create or replace view public.qr_code_stats
with (security_invoker = true) as
select
  c.id          as qr_code_id,
  c.user_id,
  coalesce(count(s.id), 0)                              as scans_count,
  coalesce(count(s.id) filter (where s.is_unique), 0)   as unique_count,
  max(s.scanned_at)                                     as last_scan_at
from public.qr_codes c
left join public.qr_scans s on s.qr_code_id = c.id
group by c.id, c.user_id;

comment on view public.qr_code_stats is
  'Aggregated scan stats per QR. security_invoker = the caller''s RLS on qr_codes/qr_scans applies.';
