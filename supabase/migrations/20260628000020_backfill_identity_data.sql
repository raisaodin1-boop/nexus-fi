-- Backfill existing identity data for slow progression model (applies to all users retroactively)

-- 1) Credit score snapshots: score lives in metadata, never in points_delta
update public.identity_events
set
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object('score', coalesce((metadata->>'score')::numeric, points_delta)),
  points_delta = 0
where event_type = 'credit_score_snapshot'
  and (
    points_delta <> 0
    or metadata is null
    or not (metadata ? 'score')
  );

-- 2) Activity events: 1 point per deposit/contribution (legacy 0.5 → 1)
update public.identity_events
set points_delta = 1
where event_type in ('savings_deposit', 'tontine_contribution', 'wallet_topup')
  and points_delta > 0
  and points_delta is distinct from 1;

-- 3) Rebuild identity_scores from real transactions (not inflated event sums)
with activity_months as (
  select user_id, date_trunc('month', created_at) as month
  from public.savings_transactions
  where amount > 0
  union
  select user_id, date_trunc('month', created_at)
  from public.tontine_contributions
  union
  select user_id, date_trunc('month', created_at)
  from public.wallet_transactions
  where type = 'topup'
),
user_counts as (
  select
    p.id as user_id,
    coalesce(au.created_at, now()) as account_created,
    coalesce((
      select count(*)::int from public.savings_transactions st
      where st.user_id = p.id and st.amount > 0
    ), 0) as deposit_cnt,
    coalesce((
      select count(*)::int from public.tontine_contributions tc
      where tc.user_id = p.id
    ), 0) as contrib_cnt,
    coalesce((
      select count(*)::int from public.wallet_transactions wt
      where wt.user_id = p.id and wt.type = 'topup'
    ), 0) as topup_cnt,
    coalesce((
      select count(distinct month)::int from activity_months am
      where am.user_id = p.id
    ), 0) as active_months
  from public.profiles p
  left join auth.users au on au.id = p.id
),
scored as (
  select
    user_id,
    least(
      1000,
      round(
        (5 + deposit_cnt + contrib_cnt + topup_cnt) * 1.5
        + least(120, floor(extract(epoch from (now() - account_created)) / 86400 / 365) * 15)
        + least(250, active_months * 4)
      )
    )::numeric as score
  from user_counts
)
insert into public.identity_scores (user_id, score, updated_at)
select user_id, score, now()
from scored
on conflict (user_id) do update
  set score = excluded.score,
      updated_at = excluded.updated_at;
