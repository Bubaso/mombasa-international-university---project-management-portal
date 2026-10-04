-- Everyone can read their own profile row, always.
--
-- This closes a gap that only shows up at the worst moment. The read policy
-- on `profiles` is:
--
--     using (app.current_clearance() is not null)
--
-- and `app.current_clearance()` answers null for a profile that is inactive
-- or past its expiry date, because `app.current_profile()` filters those out.
-- So for exactly the people whose access has been switched off or has run
-- out, the row describing that fact becomes unreadable — by them.
--
-- The result is a portal that cannot tell "there is no profile for this
-- account" apart from "there is one and it is switched off". Those have
-- different fixes and different people to ask, and the difference was
-- invisible to the one person who most needed it: somebody who has just set
-- their own account up and cannot get in.
--
-- The rule underneath is one the admin console already states in words —
-- everyone has a right to see what their own access consists of. It is now a
-- policy as well. A permissive policy ORs with the existing one, so this
-- widens nothing else: the only row it adds to anybody's view is their own,
-- and its contents are their own name, address, role, clearance and dates.
--
-- Note what this does not do. It does not let an inactive person read
-- anything else: every other table still gates on app.current_clearance(),
-- which is still null for them. It does not let them change their own row
-- either — profiles_self_update already refuses to let anyone edit their own
-- role, clearance or active flag, and an inactive caller fails its subqueries
-- anyway. Reading is all this grants.

create policy profiles_read_self on profiles
  for select using (id = auth.uid());

comment on policy profiles_read_self on profiles is
  'Your own row, whatever state it is in. Without this, a profile that is '
  'inactive or expired is invisible to the person it belongs to, so the '
  'portal cannot tell them why they are locked out.';
