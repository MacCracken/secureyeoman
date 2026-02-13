# Dashboard Tasks View: Create New Task Plan

> Adding task creation capability to the Tasks (History) view in the dashboard

## Current State

### What's Available
- **TaskHistory component** (`TaskHistory.tsx`) — Read-only list with filters
- **API endpoints**:
  - `GET /api/v1/tasks` — List tasks with filters
  - `GET /api/v1/tasks/:id` — Get single task
  - `PUT /api/v1/brain/heartbeat/tasks/:name` — Create/update heartbeat tasks
- **HeartbeatTasksSection** in PersonalityEditor — Manage heartbeat tasks (edit frequency, toggle)

### What's Missing
- No UI to create new tasks directly from the dashboard
- No POST endpoint to execute ad-hoc tasks
- No dedicated "Create Task" button/form in TaskHistory view

---

## User Stories

1. **As a user**, I want to quickly trigger a task execution from the dashboard so I don't need to use the API or CLI
2. **As a user**, I want to schedule recurring tasks (heartbeat) from the UI so I can set up monitoring without config files
3. **As a user**, I want to see my running tasks in real-time and view their results

---

## Design Options

### Option A: Expand TaskHistory View (Recommended)

Add "Create Task" button to existing TaskHistory page with modal form.

**Pros:**
- Single page for all task operations
- Lower cognitive load
- Quick access from existing workflow

**Cons:**
- May get cluttered with too many features

### Option B: Separate "New Task" Page

Create dedicated `/tasks/new` route with full-page form.

**Pros:**
- More screen space for complex forms
- Clearer separation of concerns

**Cons:**
- Extra navigation step
- Less cohesive experience

### Option C: Hybrid

Add "Create" button opens modal, with "Advanced" link to full page.

---

## Implementation Plan

### Phase 1: Backend API Enhancement

#### 1.1 Add POST /api/v1/tasks (Execute Task)

```typescript
// POST /api/v1/tasks
// Body: { type: string, name?: string, params?: Record<string, unknown> }
// Response: { task: Task }

interface CreateTaskRequest {
  type: 'execute' | 'query' | 'file' | 'network' | 'system';
  name?: string;  // Optional name, auto-generated if omitted
  params?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
}
```

**RBAC Requirements:**
- `tasks:execute` permission required

#### 1.2 Add POST /api/v1/brain/heartbeat/tasks (Create Heartbeat)

```typescript
// POST /api/v1/brain/heartbeat/tasks
// Body: { name: string, type: string, intervalMs: number, config?: Record<string, unknown>, actions?: [] }
// Response: { task: HeartbeatTask }

interface CreateHeartbeatTaskRequest {
  name: string;
  type: 'system_health' | 'memory_check' | 'log_analysis' | 'custom';
  intervalMs: number;
  enabled?: boolean;
  config?: Record<string, unknown>;
  actions?: HeartbeatActionTrigger[];  // From ADR 018
  schedule?: HeartbeatSchedule;
}
```

#### 1.3 Add DELETE /api/v1/brain/heartbeat/tasks/:name

```typescript
// DELETE /api/v1/brain/heartbeat/tasks/:name
// Response: { success: boolean }
```

---

### Phase 2: Dashboard API Client

#### 2.1 Add client functions

```typescript
// src/api/client.ts

export async function createTask(data: CreateTaskRequest): Promise<Task> {
  return request('/tasks', { method: 'POST', body: data });
}

export async function createHeartbeatTask(data: CreateHeartbeatTaskRequest): Promise<HeartbeatTask> {
  return request('/brain/heartbeat/tasks', { method: 'POST', body: data });
}

export async function deleteHeartbeatTask(name: string): Promise<{ success: boolean }> {
  return request(`/brain/heartbeat/tasks/${encodeURIComponent(name)}`, { method: 'DELETE' });
}
```

---

### Phase 3: UI Components

#### 3.1 CreateTaskModal Component

```tsx
interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (task: Task) => void;
}

// Form fields:
// - Task Type (dropdown): execute, query, file, network, system
// - Task Name (optional, text)
// - Parameters (JSON editor or key-value pairs)
// - Priority (radio): low, normal, high
// - Schedule (optional): one-time vs recurring
```

#### 3.2 CreateHeartbeatTaskModal Component

```tsx
// For creating scheduled heartbeat tasks
// - Task Name (required, text)
// - Task Type (dropdown): system_health, memory_check, log_analysis, custom
// - Interval (number + unit: minutes, hours, days)
// - Enable immediately (toggle)
// - Actions (expandable from ADR 018)
// - Schedule constraints (days of week, active hours)
```

#### 3.3 Update TaskHistory Component

```tsx
// Add header button:
// <Button variant="default">
//   <Plus className="w-4 h-4" /> New Task
// </Button>

// Dropdown menu:
// - Execute Once → opens CreateTaskModal
// - Schedule Recurring → opens CreateHeartbeatTaskModal

// Add status column with real-time updates (via refetchInterval)
```

---

### Phase 4: UX Refinements

#### 4.1 Task Execution Feedback
- Show loading spinner while task is "running"
- Toast notification on completion/failure
- Auto-refresh task list after execution

#### 4.2 Validation & Error Handling
- Form validation with clear error messages
- Duplicate name detection for heartbeat tasks
- Confirmation dialog for destructive actions (delete)

#### 4.3 Responsive Design
- Modal adapts to screen size
- Mobile-friendly touch targets

---

## Component Structure

```
TaskHistory.tsx (updated)
├── CreateTaskModal.tsx (new)
│   ├── TaskTypeSelect
│   ├── TaskParamsForm
│   └── TaskPrioritySelect
├── CreateHeartbeatTaskModal.tsx (new)
│   ├── HeartbeatTaskForm
│   ├── ActionConfigEditor (reused from ADR 018)
│   └── ScheduleEditor (reused from ADR 018)
└── DeleteConfirmDialog.tsx (reused)
```

---

## Configuration

### RBAC Updates

```typescript
// New permissions
const TASK_PERMISSIONS = {
  'tasks:execute': { description: 'Execute ad-hoc tasks' },
  'tasks:create': { description: 'Create new tasks' },
  'heartbeat:create': { description: 'Create heartbeat tasks' },
  'heartbeat:delete': { description: 'Delete heartbeat tasks' },
};
```

---

## Related Features

- **Voice Execution** — Future: trigger tasks via voice command
- **Task Templates** — Future: save/load common task configurations
- **Task Chains** — Future: link tasks together with dependencies

---

## Migration Path

1. **v1.4.0**: Backend API + client functions
2. **v1.4.0**: CreateTaskModal for ad-hoc execution
3. **v1.4.1**: CreateHeartbeatTaskModal for scheduling
4. **v1.4.2**: UX polish, validation, error handling

---

## References

- [ADR 018: Proactive Heartbeat](./adr/018-proactive-heartbeat-enhancements.md)
- [Configuration Reference](./configuration.md#heartbeat)
- [REST API](./api/rest-api.md)
- [Security Model](./security/security-model.md)
