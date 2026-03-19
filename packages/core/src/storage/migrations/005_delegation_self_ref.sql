-- Migration 005: Prevent delegation self-reference
-- Adds CHECK constraint to agents.delegations ensuring a delegation cannot reference itself
-- as its own parent, which would create a circular reference.

DO $$ BEGIN
ALTER TABLE agents.delegations
    ADD CONSTRAINT delegations_no_self_reference CHECK (id != parent_delegation_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;
