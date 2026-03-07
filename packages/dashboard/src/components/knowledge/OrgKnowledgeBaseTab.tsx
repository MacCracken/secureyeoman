import { KbScopeProvider } from './KnowledgeBaseContext';
import { KnowledgeBaseTab } from './KnowledgeBaseTab';

export function OrgKnowledgeBaseTab() {
  return (
    <KbScopeProvider value="organization">
      <KnowledgeBaseTab />
    </KbScopeProvider>
  );
}
