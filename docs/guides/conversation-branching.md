# Conversation Branching & Replay

SecureYeoman supports git-like branching for conversations, enabling fork-from-message, replay-with-different-model, tree visualization, and batch A/B testing.

## Branching

### Fork from a Message

Click the branch icon (GitBranch) on any message bubble to create a new conversation that starts with all messages up to and including that point. The new conversation is linked to the original as a child branch.

**API:**
```bash
curl -X POST /api/v1/conversations/:id/branch \
  -d '{"messageIndex": 3, "title": "Experiment A", "branchLabel": "test-v2"}'
```

### View Branch Tree

Click the branch tree button in the chat header to see a ReactFlow visualization of all branches rooted at the current conversation. Each node shows:
- Conversation title
- Message count
- Quality score (if scored)
- Branch label

Click any node to navigate to that conversation.

### List Child Branches

```bash
GET /api/v1/conversations/:id/branches
# → { branches: Conversation[] }
```

## Replay

### Single Replay

Replay a conversation with a different model. All user messages are re-sent to the new model, generating fresh assistant responses.

```bash
curl -X POST /api/v1/conversations/:id/replay \
  -d '{"model": "gpt-4", "provider": "openai"}'
# → { replayConversationId, replayJobId }
```

The replay runs asynchronously. Check progress:
```bash
GET /api/v1/replay-jobs/:id
```

### Batch Replay

Compare multiple conversations against a new model:

```bash
curl -X POST /api/v1/conversations/replay-batch \
  -d '{
    "sourceConversationIds": ["conv-1", "conv-2", "conv-3"],
    "replayModel": "claude-3-opus",
    "replayProvider": "anthropic"
  }'
```

### Replay Report

After a batch completes, get the pairwise comparison report:

```bash
GET /api/v1/replay-jobs/:id/report
# → {
#   job: ReplayJob,
#   results: ReplayResult[],
#   summary: { sourceWins, replayWins, ties, avgSourceQuality, avgReplayQuality }
# }
```

## Dashboard

### Diff View

The replay diff view shows source and replay conversations side-by-side:
- User messages span both columns
- Assistant responses appear in parallel for easy comparison
- Quality scores and pairwise winner displayed in the header

### Batch Panel

The batch panel allows:
1. Multi-selecting conversations in the list
2. Configuring model/provider for batch replay
3. Monitoring job progress with live polling
4. Viewing detailed win/loss/tie reports

## Quality Scoring

If the Conversation Quality Scorer (Phase 92) is active, replayed conversations are automatically scored. The system compares quality scores to determine a pairwise winner:
- Scores within 0.05 = **tie**
- Higher score wins

## Auth Permissions

| Endpoint | Permission |
|----------|-----------|
| Branch, Replay | `chat:write` / `chat:execute` |
| List, Tree, Report | `chat:read` |
