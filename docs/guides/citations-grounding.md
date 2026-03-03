# Inline Citations & Grounding

Phase 110 adds source attribution, groundedness enforcement, and document provenance scoring to establish a trust layer for AI responses.

## Enabling Citations

Citations are enabled per personality via the `enableCitations` body config:

```json
{
  "body": {
    "enableCitations": true,
    "groundednessMode": "off"
  }
}
```

When enabled, the AI system prompt includes a numbered source list instructing the model to produce inline `[1]`, `[2]` citations referencing retrieved knowledge base documents and memories.

## Groundedness Modes

The `groundednessMode` setting controls how ungrounded claims are handled:

| Mode | Behavior |
|------|----------|
| `off` (default) | No grounding check performed |
| `annotate_only` | Ungrounded sentences get `[unverified]` appended |
| `block_unverified` | Response blocked entirely if grounding score < 0.3 |
| `strip_unverified` | Ungrounded sentences removed from response |

Grounding is checked using token-overlap similarity between each response sentence and the retrieved source texts. A sentence is considered grounded if its best match score exceeds the threshold.

## Source Types

Citations can reference four source types:

- **memory** -- Episodic/semantic memories from the brain
- **knowledge** -- Knowledge base entries
- **document_chunk** -- Specific chunks from ingested documents
- **web_search** -- Results from web search tool calls

## Document Provenance Scoring

Each knowledge base document can be scored on 8 provenance dimensions:

1. **Authority** (0.0--1.0) -- Credibility of the source
2. **Currency** (0.0--1.0) -- Timeliness of the information
3. **Objectivity** (0.0--1.0) -- Neutrality / freedom from bias
4. **Accuracy** (0.0--1.0) -- Factual correctness
5. **Methodology** (0.0--1.0) -- Research rigor
6. **Coverage** (0.0--1.0) -- Breadth of topic coverage
7. **Reliability** (0.0--1.0) -- Consistency and reproducibility
8. **Provenance** (0.0--1.0) -- Chain-of-custody clarity

The composite `trust_score` is a weighted average of these dimensions. Documents with no provenance data default to 0.5.

### API

```bash
# Get provenance scores
GET /api/v1/brain/documents/:id/provenance

# Update provenance scores
PUT /api/v1/brain/documents/:id/provenance
Content-Type: application/json
{
  "scores": {
    "authority": 0.9,
    "currency": 0.8,
    "objectivity": 0.7,
    "accuracy": 0.9,
    "methodology": 0.6,
    "coverage": 0.8,
    "reliability": 0.85,
    "provenance": 0.9
  }
}
```

## Citation Feedback

Users can provide relevance feedback on individual citations:

```bash
POST /api/v1/brain/citations/:messageId/feedback
Content-Type: application/json
{
  "citationIndex": 1,
  "sourceId": "source-uuid",
  "relevant": false
}
```

Feedback is stored and can be used as a quality signal for knowledge base maintenance.

## Grounding Stats

Get aggregate grounding statistics for a personality:

```bash
GET /api/v1/brain/grounding/stats?personalityId=<id>&windowDays=30
```

Returns average score, total messages checked, and count of low-grounding messages.

## Dashboard

When citations are enabled:

- Assistant messages show a **Sources** section below the brain context with numbered references, type badges, and document titles.
- `[N]` markers in the response text are rendered as superscript citation links.
- A grounding score badge (green/yellow/red) appears on assistant messages.
- Clicking a citation opens a slide-in drawer with full source content and feedback buttons.
