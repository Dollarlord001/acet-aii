-- Additional RLS policies for tenant isolation

-- Conversations
CREATE POLICY "Members can view org conversations"
  ON conversations FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY "Members can insert conversations"
  ON conversations FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND user_id = auth.uid()
  );

-- Messages (via conversation org)
CREATE POLICY "Members can view messages in org conversations"
  ON messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE organization_id IN (SELECT public.user_organization_ids())
    )
  );

CREATE POLICY "Members can insert messages"
  ON messages FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE organization_id IN (SELECT public.user_organization_ids())
    )
  );

-- Workflow steps
CREATE POLICY "Members can view org workflow steps"
  ON workflow_steps FOR SELECT
  USING (
    agent_run_id IN (
      SELECT id FROM agent_runs
      WHERE organization_id IN (SELECT public.user_organization_ids())
    )
  );

CREATE POLICY "Members can insert workflow steps"
  ON workflow_steps FOR INSERT
  WITH CHECK (
    agent_run_id IN (
      SELECT id FROM agent_runs
      WHERE organization_id IN (SELECT public.user_organization_ids())
    )
  );

CREATE POLICY "Members can update workflow steps"
  ON workflow_steps FOR UPDATE
  USING (
    agent_run_id IN (
      SELECT id FROM agent_runs
      WHERE organization_id IN (SELECT public.user_organization_ids())
    )
  );

-- Approvals
CREATE POLICY "Members can view org approvals"
  ON approvals FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY "Members can insert approvals"
  ON approvals FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY "Members can update org approvals"
  ON approvals FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));

-- Companies / contacts
CREATE POLICY "Members can manage companies"
  ON companies FOR ALL
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY "Members can manage contacts"
  ON contacts FOR ALL
  USING (organization_id IN (SELECT public.user_organization_ids()));

-- Reminders
CREATE POLICY "Users can manage own reminders"
  ON reminders FOR ALL
  USING (user_id = auth.uid());

-- Activity
CREATE POLICY "Members can view activity"
  ON activity_events FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY "Members can insert activity"
  ON activity_events FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));

-- Audit (read-only for members)
CREATE POLICY "Members can view audit logs"
  ON audit_logs FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));

-- Tool calls
CREATE POLICY "Members can view tool calls"
  ON tool_calls FOR SELECT
  USING (
    agent_run_id IN (
      SELECT id FROM agent_runs
      WHERE organization_id IN (SELECT public.user_organization_ids())
    )
  );

CREATE POLICY "Members can insert tool calls"
  ON tool_calls FOR INSERT
  WITH CHECK (
    agent_run_id IN (
      SELECT id FROM agent_runs
      WHERE organization_id IN (SELECT public.user_organization_ids())
    )
  );

-- Agent runs update
CREATE POLICY "Members can update own org agent runs"
  ON agent_runs FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));

-- Profiles update
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Organizations insert (bootstrap)
CREATE POLICY "Authenticated users can create orgs"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Memberships insert
CREATE POLICY "Users can insert own membership"
  ON memberships FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Subscriptions
CREATE POLICY "Members can view org subscription"
  ON subscriptions FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY "Owners can manage subscription"
  ON subscriptions FOR ALL
  USING (organization_id IN (SELECT public.user_organization_ids()));
