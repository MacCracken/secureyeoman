import { createContext, useContext } from 'react';

export type KbScope = 'personality' | 'organization';

const KnowledgeBaseContext = createContext<KbScope>('personality');

export const KbScopeProvider = KnowledgeBaseContext.Provider;
export function useKbScope(): KbScope {
  return useContext(KnowledgeBaseContext);
}
