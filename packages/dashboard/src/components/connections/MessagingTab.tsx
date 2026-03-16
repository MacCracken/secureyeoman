import { useState } from 'react';
import { Cable, Plus, HelpCircle } from 'lucide-react';
import type { IntegrationInfo } from '../../types';
import { PLATFORM_META } from './platformMetadata';
import { IntegrationCard } from './IntegrationCard';

export function MessagingTab({
  integrations,
  platformsData,
  hasRegisteredPlatforms: _hasRegisteredPlatforms,
  unregisteredPlatforms,
  connectingPlatform,
  formData,
  onConnectPlatform,
  onFormDataChange,
  onCreateIntegration,
  isCreating,
  createError,
  onStart,
  onStop,
  onDelete,
  isStarting,
  isStopping,
  isDeleting,
  onTest,
  isTesting,
  testResult,
}: {
  integrations: IntegrationInfo[];
  platformsData: Set<string>;
  hasRegisteredPlatforms: boolean;
  unregisteredPlatforms: string[];
  connectingPlatform: string | null;
  formData: Record<string, string>;
  onConnectPlatform: (platform: string | null) => void;
  onFormDataChange: (data: Record<string, string>) => void;
  onCreateIntegration: () => void;
  isCreating: boolean;
  createError: Error | null;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  isStarting: boolean;
  isStopping: boolean;
  isDeleting: boolean;
  onTest: (id: string) => void;
  isTesting: boolean;
  testResult: { id: string; ok: boolean; message: string } | null;
}) {
  const [showAddPicker, setShowAddPicker] = useState(false);

  // Platforms available to add (registered in core, not yet connected, and have metadata)
  const addablePlatforms = unregisteredPlatforms.filter((p) => platformsData.has(p));

  return (
    <div className="space-y-6">
      {/* -- Connect form (inline, replaces picker when a platform is selected) -- */}
      {connectingPlatform && PLATFORM_META[connectingPlatform] && (
        <div className="card overflow-hidden border-primary/60">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-primary/20">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                {PLATFORM_META[connectingPlatform].icon}
              </div>
              <div>
                <h3 className="font-semibold text-sm">
                  Connect {PLATFORM_META[connectingPlatform].name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {PLATFORM_META[connectingPlatform].description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onConnectPlatform(null);
                setShowAddPicker(false);
              }}
              className="text-muted-foreground hover:text-foreground text-lg leading-none"
              aria-label="Cancel"
            >
              &times;
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Setup steps */}
            {PLATFORM_META[connectingPlatform].setupSteps && (
              <div className="p-3 bg-muted/40 rounded-lg border border-border/60">
                <p className="text-xs font-semibold text-foreground mb-2">Setup Steps</p>
                <ol className="space-y-1.5">
                  {PLATFORM_META[connectingPlatform].setupSteps.map((step, idx) => (
                    <li key={idx} className="flex gap-2.5 text-xs text-muted-foreground">
                      <span className="text-primary font-medium shrink-0">{idx + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Fields */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onCreateIntegration();
              }}
              className="space-y-3"
            >
              {PLATFORM_META[connectingPlatform].fields.map((field) => (
                <div key={field.key}>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={formData[field.key] || ''}
                    onChange={(e) => {
                      onFormDataChange({ ...formData, [field.key]: e.target.value });
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {field.helpText && (
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                      {field.helpText}
                    </p>
                  )}
                </div>
              ))}

              {createError && (
                <div className="p-2.5 rounded-md bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {createError.message || 'Connection failed'}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={!formData.displayName || isCreating}
                  className="btn btn-primary text-sm px-4 py-2"
                >
                  {isCreating ? 'Connecting\u2026' : 'Connect'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onConnectPlatform(null);
                    setShowAddPicker(false);
                  }}
                  className="btn btn-ghost text-sm px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -- Connected integrations grid -- */}
      {integrations.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted">{integrations.length} Connected</h3>
            {addablePlatforms.length > 0 && !connectingPlatform && (
              <button
                onClick={() => {
                  setShowAddPicker(!showAddPicker);
                }}
                className="btn btn-ghost text-xs px-3 py-1.5 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onStart={onStart}
                onStop={onStop}
                onDelete={onDelete}
                isStarting={isStarting}
                isStopping={isStopping}
                isDeleting={isDeleting}
                onTest={onTest}
                isTesting={isTesting}
                testResult={testResult?.id === integration.id ? testResult : null}
              />
            ))}
          </div>
        </div>
      ) : !connectingPlatform ? (
        <div className="text-center py-12 space-y-3">
          <Cable className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No integrations connected yet</p>
          {addablePlatforms.length > 0 && (
            <button
              onClick={() => {
                setShowAddPicker(true);
              }}
              className="btn btn-ghost text-xs px-4 py-2 inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Integration
            </button>
          )}
        </div>
      ) : null}

      {/* -- Add-integration picker (compact dropdown-style list) -- */}
      {showAddPicker && !connectingPlatform && addablePlatforms.length > 0 && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Choose a platform</h3>
            <button
              onClick={() => {
                setShowAddPicker(false);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {addablePlatforms.map((platformId) => {
              const meta = PLATFORM_META[platformId];
              if (!meta) return null;
              return (
                <button
                  key={platformId}
                  onClick={() => {
                    onConnectPlatform(platformId);
                    setShowAddPicker(false);
                  }}
                  className="flex items-center gap-2.5 p-2.5 rounded-md border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                >
                  <div className="p-1.5 rounded bg-surface text-muted shrink-0">{meta.icon}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{meta.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{meta.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
