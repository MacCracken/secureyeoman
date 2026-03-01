import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Globe, Github, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { ingestUrl, ingestText, ingestGithubWiki, fetchPersonalities } from '../../api/client';
import type { KbDocument } from '../../types';

function ResultMessage({ doc }: { doc: KbDocument | null; error: string | null }) {
  return null;
}

export function ConnectorsPanel() {
  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
    staleTime: 30000,
  });
  const personalities = personalitiesData?.personalities ?? [];

  // Web Crawl
  const [crawlUrl, setCrawlUrl] = useState('');
  const [crawlPersonality, setCrawlPersonality] = useState('');
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlResult, setCrawlResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // GitHub Wiki
  const [wikiOwner, setWikiOwner] = useState('');
  const [wikiRepo, setWikiRepo] = useState('');
  const [wikiPersonality, setWikiPersonality] = useState('');
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiResult, setWikiResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Paste Text
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pastePersonality, setPastePersonality] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteResult, setPasteResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleCrawl() {
    if (!crawlUrl.trim()) return;
    setCrawlLoading(true);
    setCrawlResult(null);
    try {
      const res = await ingestUrl(crawlUrl.trim(), {
        personalityId: crawlPersonality || undefined,
      });
      setCrawlResult({ ok: true, msg: `Ingested: ${res.document.title} (${res.document.status})` });
    } catch (err) {
      setCrawlResult({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setCrawlLoading(false);
    }
  }

  async function handleWiki() {
    if (!wikiOwner.trim() || !wikiRepo.trim()) return;
    setWikiLoading(true);
    setWikiResult(null);
    try {
      const res = await ingestGithubWiki(
        wikiOwner.trim(),
        wikiRepo.trim(),
        wikiPersonality || undefined
      );
      setWikiResult({
        ok: true,
        msg: `Synced ${res.documents.length} file${res.documents.length !== 1 ? 's' : ''} from ${wikiOwner}/${wikiRepo}`,
      });
    } catch (err) {
      setWikiResult({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setWikiLoading(false);
    }
  }

  async function handlePaste() {
    if (!pasteText.trim() || !pasteTitle.trim()) return;
    setPasteLoading(true);
    setPasteResult(null);
    try {
      const res = await ingestText(pasteText.trim(), pasteTitle.trim(), {
        personalityId: pastePersonality || undefined,
      });
      setPasteResult({ ok: true, msg: `Added: ${res.document.title}` });
      setPasteText('');
      setPasteTitle('');
    } catch (err) {
      setPasteResult({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setPasteLoading(false);
    }
  }

  const personalitySelector = (value: string, onChange: (v: string) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-card border border-border rounded text-xs py-1.5 px-2 w-full"
    >
      <option value="">Global (All Personalities)</option>
      {personalities.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );

  const resultBanner = (result: { ok: boolean; msg: string } | null) =>
    result ? (
      <p className={`text-xs flex items-center gap-1 ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
        {result.ok ? <CheckCircle className="w-3 h-3 shrink-0" /> : <AlertCircle className="w-3 h-3 shrink-0" />}
        {result.msg}
      </p>
    ) : null;

  return (
    <div className="space-y-4">
      {/* Web Crawl */}
      <div className="card">
        <div className="card-header p-3 sm:p-4">
          <h3 className="card-title text-sm flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            Web Crawl
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Fetch a URL and add its content to the knowledge base.</p>
        </div>
        <div className="card-content space-y-2 p-3 sm:p-4 pt-0 sm:pt-0">
          <input
            type="url"
            value={crawlUrl}
            onChange={(e) => setCrawlUrl(e.target.value)}
            placeholder="https://example.com/docs/page"
            className="w-full bg-card border border-border rounded text-sm py-1.5 px-2"
          />
          <div>{personalitySelector(crawlPersonality, setCrawlPersonality)}</div>
          <button
            className="btn btn-primary text-xs h-8 px-3 disabled:opacity-50"
            onClick={() => void handleCrawl()}
            disabled={crawlLoading || !crawlUrl.trim()}
          >
            {crawlLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Ingest URL
          </button>
          {resultBanner(crawlResult)}
        </div>
      </div>

      {/* GitHub Wiki */}
      <div className="card">
        <div className="card-header p-3 sm:p-4">
          <h3 className="card-title text-sm flex items-center gap-2">
            <Github className="w-4 h-4 text-muted-foreground" />
            GitHub Wiki / Repository
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Sync all markdown files from a GitHub repository.</p>
        </div>
        <div className="card-content space-y-2 p-3 sm:p-4 pt-0 sm:pt-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={wikiOwner}
              onChange={(e) => setWikiOwner(e.target.value)}
              placeholder="owner"
              className="flex-1 bg-card border border-border rounded text-sm py-1.5 px-2"
            />
            <span className="text-muted-foreground self-center">/</span>
            <input
              type="text"
              value={wikiRepo}
              onChange={(e) => setWikiRepo(e.target.value)}
              placeholder="repository"
              className="flex-1 bg-card border border-border rounded text-sm py-1.5 px-2"
            />
          </div>
          <div>{personalitySelector(wikiPersonality, setWikiPersonality)}</div>
          <button
            className="btn btn-primary text-xs h-8 px-3 disabled:opacity-50"
            onClick={() => void handleWiki()}
            disabled={wikiLoading || !wikiOwner.trim() || !wikiRepo.trim()}
          >
            {wikiLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Sync Wiki
          </button>
          {resultBanner(wikiResult)}
        </div>
      </div>

      {/* Paste Text */}
      <div className="card">
        <div className="card-header p-3 sm:p-4">
          <h3 className="card-title text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            Paste Text
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Directly paste content to add to the knowledge base.</p>
        </div>
        <div className="card-content space-y-2 p-3 sm:p-4 pt-0 sm:pt-0">
          <input
            type="text"
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="Title *"
            className="w-full bg-card border border-border rounded text-sm py-1.5 px-2"
          />
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste or type content here…"
            rows={6}
            className="w-full bg-card border border-border rounded text-sm py-1.5 px-2 font-mono resize-y"
          />
          <div>{personalitySelector(pastePersonality, setPastePersonality)}</div>
          <button
            className="btn btn-primary text-xs h-8 px-3 disabled:opacity-50"
            onClick={() => void handlePaste()}
            disabled={pasteLoading || !pasteText.trim() || !pasteTitle.trim()}
          >
            {pasteLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Add to Knowledge Base
          </button>
          {resultBanner(pasteResult)}
        </div>
      </div>
    </div>
  );
}
