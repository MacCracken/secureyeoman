-- Phase 107-A: Reasoning Strategies
-- Composable meta-reasoning strategies applied to personality system prompts.

CREATE TABLE soul.reasoning_strategies (
    id text NOT NULL PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text DEFAULT '' NOT NULL,
    prompt_prefix text NOT NULL,
    category text NOT NULL CHECK (category IN (
        'chain_of_thought','tree_of_thought','reflexion','self_refine',
        'self_consistent','chain_of_density','argument_of_thought','standard'
    )),
    is_builtin boolean DEFAULT false NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

CREATE INDEX idx_reasoning_strategies_category ON soul.reasoning_strategies(category);
CREATE INDEX idx_reasoning_strategies_slug ON soul.reasoning_strategies(slug);

ALTER TABLE chat.conversations ADD COLUMN strategy_id text;
CREATE INDEX idx_conversations_strategy ON chat.conversations(strategy_id);
