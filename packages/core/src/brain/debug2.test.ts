import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrainStorage } from './src/brain/storage.js';
import { BrainManager } from './src/brain/manager.js';
import { DocumentManager } from './src/brain/document-manager.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from './src/test-setup.js';

function noopLogger(): any {
  const noop = () => {};
  return { trace:noop,debug:noop,info:noop,warn:noop,error:noop,fatal:noop,child:()=>noopLogger(),level:'silent' };
}

describe('debug2', () => {
  let storage: BrainStorage, bm: BrainManager, dm: DocumentManager;
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => {
    await truncateAllTables();
    storage = new BrainStorage();
    bm = new BrainManager(storage, { enabled:true,maxMemories:10000,maxKnowledge:5000,memoryRetentionDays:90,importanceDecayRate:0.01,contextWindowMemories:10 }, { auditChain: null as any, logger: noopLogger() });
    dm = new DocumentManager({ brainManager: bm, storage, logger: noopLogger() });
  });

  it('diagnoses large text corpus', async () => {
    const doc = await dm.ingestText('word '.repeat(10_000), 'Big', null, 'private');
    console.log('status:', doc.status, 'chunkCount:', doc.chunkCount);
    const chunks = await storage.getAllDocumentChunks(null);
    console.log('chunks returned:', chunks.length, 'totalTokens:', chunks.reduce((s,c) => s+c.estimatedTokens, 0));
    const corpus = await dm.getNotebookCorpus(null, 100);
    console.log('corpus:', JSON.stringify({ totalTokens: corpus.totalTokens, fitsInBudget: corpus.fitsInBudget, docsCount: corpus.documents.length }));
  });
});
