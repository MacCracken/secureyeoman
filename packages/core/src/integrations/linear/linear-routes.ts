/**
 * Linear Routes — Linear GraphQL API proxy.
 *
 * Credentials come from the stored Linear integration config.
 * Auth: plain API key in the Authorization header (no Bearer prefix).
 */

import type { FastifyInstance } from 'fastify';
import type { IntegrationManager } from '../manager.js';
import { sendError, toErrorMessage } from '../../utils/errors.js';

const LINEAR_API = 'https://api.linear.app/graphql';

export interface LinearRoutesOptions {
  integrationManager: IntegrationManager;
}

// ─── Helpers ──────────────────────────────────────────────────

async function resolveLinearCredentials(
  integrationManager: IntegrationManager
): Promise<{ apiKey: string } | null> {
  const integrations = await integrationManager.listIntegrations({
    platform: 'linear',
    enabled: true,
  });
  const first = integrations[0];
  if (!first) return null;
  const cfg = first.config as { apiKey?: string };
  if (!cfg?.apiKey) return null;
  return { apiKey: cfg.apiKey };
}

interface LinearGraphQLResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

async function linearGraphQL(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<LinearGraphQLResponse> {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Linear API returned HTTP ${res.status}: ${await res.text()}`);
  }

  return (await res.json()) as LinearGraphQLResponse;
}

// ─── Route registration ────────────────────────────────────────

export function registerLinearRoutes(app: FastifyInstance, opts: LinearRoutesOptions): void {
  const { integrationManager } = opts;

  // GET /api/v1/integrations/linear/teams
  app.get('/api/v1/integrations/linear/teams', async (_req, reply) => {
    const creds = await resolveLinearCredentials(integrationManager);
    if (!creds) {
      return sendError(
        reply,
        404,
        'No Linear integration configured. Add a Linear integration via Settings > Connections.'
      );
    }

    try {
      const result = await linearGraphQL(creds.apiKey, `
        query {
          teams {
            nodes { id name key }
          }
        }
      `);

      if (result.errors?.length) {
        return sendError(reply, 502, `Linear API error: ${result.errors![0]!.message}`);
      }

      return reply.send(result.data?.teams);
    } catch (err) {
      return sendError(reply, 500, `Linear API error: ${toErrorMessage(err)}`);
    }
  });

  // GET /api/v1/integrations/linear/issues/search?query=&limit=
  app.get<{ Querystring: { query?: string; limit?: string } }>(
    '/api/v1/integrations/linear/issues/search',
    async (req, reply) => {
      const creds = await resolveLinearCredentials(integrationManager);
      if (!creds) return sendError(reply, 404, 'No Linear integration configured.');

      const q = req.query.query;
      if (!q) return sendError(reply, 400, 'Query parameter "query" is required.');

      const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 100);

      try {
        const result = await linearGraphQL(creds.apiKey, `
          query IssueSearch($term: String!, $first: Int!) {
            issueSearch(term: $term, first: $first) {
              nodes {
                id
                identifier
                title
                state { name }
                priority
                assignee { name }
              }
            }
          }
        `, { term: q, first: limit });

        if (result.errors?.length) {
          return sendError(reply, 502, `Linear API error: ${result.errors![0]!.message}`);
        }

        return reply.send(result.data?.issueSearch);
      } catch (err) {
        return sendError(reply, 500, `Linear API error: ${toErrorMessage(err)}`);
      }
    }
  );

  // GET /api/v1/integrations/linear/issues?teamId=&status=&assigneeId=&limit=
  app.get<{ Querystring: { teamId?: string; status?: string; assigneeId?: string; limit?: string } }>(
    '/api/v1/integrations/linear/issues',
    async (req, reply) => {
      const creds = await resolveLinearCredentials(integrationManager);
      if (!creds) return sendError(reply, 404, 'No Linear integration configured.');

      const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 100);

      // Build filter object dynamically
      const filter: Record<string, unknown> = {};
      if (req.query.teamId) filter.team = { id: { eq: req.query.teamId } };
      if (req.query.status) filter.state = { name: { eq: req.query.status } };
      if (req.query.assigneeId) filter.assignee = { id: { eq: req.query.assigneeId } };

      try {
        const result = await linearGraphQL(creds.apiKey, `
          query ListIssues($first: Int!, $filter: IssueFilter) {
            issues(first: $first, filter: $filter) {
              nodes {
                id
                identifier
                title
                state { name }
                priority
                assignee { id name }
                labels { nodes { name } }
                createdAt
                updatedAt
              }
            }
          }
        `, {
          first: limit,
          filter: Object.keys(filter).length > 0 ? filter : undefined,
        });

        if (result.errors?.length) {
          return sendError(reply, 502, `Linear API error: ${result.errors![0]!.message}`);
        }

        return reply.send(result.data?.issues);
      } catch (err) {
        return sendError(reply, 500, `Linear API error: ${toErrorMessage(err)}`);
      }
    }
  );

  // GET /api/v1/integrations/linear/issues/:issueId
  app.get<{ Params: { issueId: string } }>(
    '/api/v1/integrations/linear/issues/:issueId',
    async (req, reply) => {
      const creds = await resolveLinearCredentials(integrationManager);
      if (!creds) return sendError(reply, 404, 'No Linear integration configured.');

      try {
        const result = await linearGraphQL(creds.apiKey, `
          query GetIssue($id: String!) {
            issue(id: $id) {
              id
              identifier
              title
              description
              state { id name }
              priority
              priorityLabel
              assignee { id name email }
              labels { nodes { id name color } }
              createdAt
              updatedAt
              url
            }
          }
        `, { id: req.params.issueId });

        if (result.errors?.length) {
          return sendError(reply, 502, `Linear API error: ${result.errors![0]!.message}`);
        }

        return reply.send(result.data?.issue);
      } catch (err) {
        return sendError(reply, 500, `Linear API error: ${toErrorMessage(err)}`);
      }
    }
  );

  // POST /api/v1/integrations/linear/issues
  app.post<{
    Body: {
      title: string;
      description?: string;
      teamId: string;
      priority?: number;
      assigneeId?: string;
      labelIds?: string[];
    };
  }>('/api/v1/integrations/linear/issues', async (req, reply) => {
    const creds = await resolveLinearCredentials(integrationManager);
    if (!creds) return sendError(reply, 404, 'No Linear integration configured.');

    const { title, description, teamId, priority, assigneeId, labelIds } = req.body;

    if (!title) return sendError(reply, 400, '"title" is required.');
    if (!teamId) return sendError(reply, 400, '"teamId" is required.');

    const input: Record<string, unknown> = { title, teamId };
    if (description !== undefined) input.description = description;
    if (priority !== undefined) input.priority = priority;
    if (assigneeId !== undefined) input.assigneeId = assigneeId;
    if (labelIds !== undefined) input.labelIds = labelIds;

    try {
      const result = await linearGraphQL(creds.apiKey, `
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              title
              url
            }
          }
        }
      `, { input });

      if (result.errors?.length) {
        return sendError(reply, 502, `Linear API error: ${result.errors![0]!.message}`);
      }

      const createResult = result.data?.issueCreate as
        | { success: boolean; issue: Record<string, unknown> }
        | undefined;

      if (!createResult?.success) {
        return sendError(reply, 502, 'Linear issueCreate reported failure.');
      }

      return reply.code(201).send(createResult.issue);
    } catch (err) {
      return sendError(reply, 500, `Linear API error: ${toErrorMessage(err)}`);
    }
  });

  // PUT /api/v1/integrations/linear/issues/:issueId
  app.put<{
    Params: { issueId: string };
    Body: {
      title?: string;
      description?: string;
      stateId?: string;
      priority?: number;
      assigneeId?: string;
    };
  }>('/api/v1/integrations/linear/issues/:issueId', async (req, reply) => {
    const creds = await resolveLinearCredentials(integrationManager);
    if (!creds) return sendError(reply, 404, 'No Linear integration configured.');

    const { title, description, stateId, priority, assigneeId } = req.body;

    const input: Record<string, unknown> = {};
    if (title !== undefined) input.title = title;
    if (description !== undefined) input.description = description;
    if (stateId !== undefined) input.stateId = stateId;
    if (priority !== undefined) input.priority = priority;
    if (assigneeId !== undefined) input.assigneeId = assigneeId;

    if (Object.keys(input).length === 0) {
      return sendError(reply, 400, 'At least one field to update is required.');
    }

    try {
      const result = await linearGraphQL(creds.apiKey, `
        mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue {
              id
              identifier
              title
              state { name }
            }
          }
        }
      `, { id: req.params.issueId, input });

      if (result.errors?.length) {
        return sendError(reply, 502, `Linear API error: ${result.errors![0]!.message}`);
      }

      const updateResult = result.data?.issueUpdate as
        | { success: boolean; issue: Record<string, unknown> }
        | undefined;

      if (!updateResult?.success) {
        return sendError(reply, 502, 'Linear issueUpdate reported failure.');
      }

      return reply.send(updateResult.issue);
    } catch (err) {
      return sendError(reply, 500, `Linear API error: ${toErrorMessage(err)}`);
    }
  });

  // POST /api/v1/integrations/linear/issues/:issueId/comments
  app.post<{
    Params: { issueId: string };
    Body: { body: string };
  }>('/api/v1/integrations/linear/issues/:issueId/comments', async (req, reply) => {
    const creds = await resolveLinearCredentials(integrationManager);
    if (!creds) return sendError(reply, 404, 'No Linear integration configured.');

    const { body } = req.body;
    if (!body) return sendError(reply, 400, '"body" is required.');

    try {
      const result = await linearGraphQL(creds.apiKey, `
        mutation CreateComment($input: CommentCreateInput!) {
          commentCreate(input: $input) {
            success
            comment {
              id
              body
              createdAt
              user { name }
            }
          }
        }
      `, { input: { issueId: req.params.issueId, body } });

      if (result.errors?.length) {
        return sendError(reply, 502, `Linear API error: ${result.errors![0]!.message}`);
      }

      const createResult = result.data?.commentCreate as
        | { success: boolean; comment: Record<string, unknown> }
        | undefined;

      if (!createResult?.success) {
        return sendError(reply, 502, 'Linear commentCreate reported failure.');
      }

      return reply.code(201).send(createResult.comment);
    } catch (err) {
      return sendError(reply, 500, `Linear API error: ${toErrorMessage(err)}`);
    }
  });
}
