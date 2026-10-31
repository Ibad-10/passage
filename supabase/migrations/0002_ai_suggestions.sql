-- Phase 1 server layer: AI suggestions, screening detail for the review page, officer route note,
-- and an atomic quote decision (Review Focus 1).

alter table cases add column ai_result jsonb;      -- AiResult from the first pass (suggestions only, never final)
alter table cases add column route_note text;      -- officer's note when signing the route; D reasons shown to the client

alter table screening_results add column hits jsonb not null default '[]';  -- top candidate matches from the provider
alter table screening_results add column reasons text[] not null default '{}';
alter table screening_results add column proposed_by uuid references users(id); -- analyst proposes, officer decides
alter table screening_results add column proposed_reason text;

-- Approve or decline a shown quote and move the case in one transaction. The server computes the
-- from/to states with the domain state machine; both updates are guarded, so a double submit or a
-- stale tab touches 0 rows and the whole call rolls back.
create or replace function decide_quote(
  p_quote_id uuid, p_user_id uuid, p_status quote_status, p_from case_state, p_to case_state
) returns void
language plpgsql
set search_path = public
as $$
declare v_case uuid;
begin
  update quotes
     set status = p_status,
         approved_by = case when p_status = 'approved' then p_user_id end,
         approved_at = case when p_status = 'approved' then now() end
   where id = p_quote_id and status = 'shown'
  returning case_id into v_case;
  if v_case is null then
    raise exception 'quote is no longer open';
  end if;
  update cases set state = p_to where id = v_case and state = p_from;
  if not found then
    raise exception 'case is no longer awaiting this quote';
  end if;
end $$;

revoke execute on function decide_quote(uuid, uuid, quote_status, case_state, case_state) from public, anon, authenticated;
grant execute on function decide_quote(uuid, uuid, quote_status, case_state, case_state) to service_role;

notify pgrst, 'reload schema';
