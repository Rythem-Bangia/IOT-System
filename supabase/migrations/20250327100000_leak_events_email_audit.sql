-- Why email_sent_at is still null: surface attempts and errors for debugging + Realtime.
alter table public.leak_events
  add column if not exists email_last_attempt_at timestamptz,
  add column if not exists email_last_error text;

comment on column public.leak_events.email_last_attempt_at is
  'Set when send-leak-alert runs (success or failure).';
comment on column public.leak_events.email_last_error is
  'Last failure reason from edge function; null when email_sent_at is set.';
