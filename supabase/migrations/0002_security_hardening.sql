-- M7_Studio — security hardening on top of 0001_initial.
-- Addresses Supabase advisor warnings.

-- 1) Trigger functions shouldn't be callable as RPC.
--    Revoke EXECUTE from anon and authenticated; triggers still run because
--    they execute under the table owner, not via REST.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.log_url_change()  from anon, authenticated, public;

-- 2) Public bucket `qr-logos` doesn't need a broad SELECT policy on storage.objects:
--    a public bucket already serves objects via direct URL. The broad policy
--    additionally allowed clients to LIST every object — drop it.
drop policy if exists "public reads logos" on storage.objects;
