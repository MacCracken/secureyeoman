import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Trash2, Loader2, FileText, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
  fetchPersonalities,
} from '../../api/client';
import type { KbDocument } from '../../types';
import { useKbScope } from './KnowledgeBaseContext';

const ALL_PERSONALITIES = '__all__';

function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

function StatusBadge({ status }: { status: KbDocument['status'] }) {
  const cls: Record<string, string> = {
    ready: 'bg-green-100 text-green-700',
    processing: 'bg-yellow-100 text-yellow-700',
    pending: 'bg-gray-100 text-gray-600',
    error: 'bg-red-100 text-red-700',
  };
  const icons: Record<string, React.ReactNode> = {
    ready: <CheckCircle className="w-3 h-3" />,
    processing: <Loader2 className="w-3 h-3 animate-spin" />,
    pending: <Clock className="w-3 h-3" />,
    error: <AlertCircle className="w-3 h-3" />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${cls[status] ?? ''}`}
    >
      {icons[status]}
      {status}
    </span>
  );
}

function FormatBadge({ format }: { format: KbDocument['format'] }) {
  const colors: Record<string, string> = {
    pdf: 'bg-red-50 text-red-600',
    html: 'bg-orange-50 text-orange-600',
    md: 'bg-blue-50 text-blue-600',
    txt: 'bg-gray-50 text-gray-600',
    url: 'bg-purple-50 text-purple-600',
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-xs font-mono ${colors[format] ?? 'bg-gray-50 text-gray-600'}`}
    >
      {format}
    </span>
  );
}

export function DocumentsPanel() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const kbScope = useKbScope();
  const isOrg = kbScope === 'organization';

  const [selectedPersonalityId, setSelectedPersonalityId] = useState(ALL_PERSONALITIES);
  const [uploadPersonalityId, setUploadPersonalityId] = useState('');
  const [uploadVisibility, setUploadVisibility] = useState<'private' | 'shared'>('private');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
    staleTime: 30000,
    enabled: !isOrg,
  });
  const personalities = personalitiesData?.personalities ?? [];

  const filterPersonalityId =
    isOrg ? undefined : (selectedPersonalityId === ALL_PERSONALITIES ? undefined : selectedPersonalityId);

  const { data: docsData, isLoading } = useQuery({
    queryKey: ['kb-documents', kbScope, filterPersonalityId],
    queryFn: () => listDocuments({ personalityId: filterPersonalityId, scope: isOrg ? 'organization' : undefined }),
    staleTime: 5000,
  });
  const documents = docsData?.documents ?? [];

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadDocument(file, {
        personalityId: isOrg ? undefined : (uploadPersonalityId || undefined),
        visibility: isOrg ? 'shared' : uploadVisibility,
        title: uploadTitle || undefined,
        scope: isOrg ? 'organization' : undefined,
      }),
    onSuccess: () => {
      setUploadError(null);
      setUploadTitle('');
      void queryClient.invalidateQueries({ queryKey: ['kb-documents'] });
    },
    onError: (err: Error) => {
      setUploadError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kb-documents'] });
    },
  });

  function handleFileSelect(file: File) {
    setUploadError(null);
    uploadMutation.mutate(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  return (
    <div className="space-y-4">
      {/* Filter + list */}
      <div className="card">
        <div className="card-header p-3 sm:p-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h3 className="card-title text-sm">{isOrg ? 'Organization Documents' : 'Documents'}</h3>
          {!isOrg && (
            <div className="ml-auto flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Personality:</label>
              <select
                value={selectedPersonalityId}
                onChange={(e) => {
                  setSelectedPersonalityId(e.target.value);
                }}
                className="bg-card border border-border rounded text-xs py-1 px-2"
              >
                <option value={ALL_PERSONALITIES}>All</option>
                {personalities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="card-content p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">
              No documents ingested yet.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{doc.title}</span>
                      <FormatBadge format={doc.format} />
                      <StatusBadge status={doc.status} />
                      {doc.visibility === 'shared' && (
                        <span className="text-xs text-muted-foreground bg-blue-50 px-1.5 py-0.5 rounded">
                          shared
                        </span>
                      )}
                    </div>
                    {doc.status === 'ready' && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {doc.chunkCount} chunk{doc.chunkCount !== 1 ? 's' : ''}
                      </p>
                    )}
                    {doc.status === 'error' && doc.errorMessage && (
                      <p className="text-xs text-red-500 mt-0.5 truncate" title={doc.errorMessage}>
                        {doc.errorMessage}
                      </p>
                    )}
                  </div>
                  <button
                    className="shrink-0 p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                    onClick={() => {
                      deleteMutation.mutate(doc.id);
                    }}
                    disabled={deleteMutation.isPending}
                    title="Delete document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upload area */}
      <div className="card">
        <div className="card-header p-3 sm:p-4">
          <h3 className="card-title text-sm flex items-center gap-2">
            <Upload className="w-4 h-4 text-muted-foreground" />
            Upload Document
          </h3>
        </div>
        <div className="card-content space-y-3 p-3 sm:p-4 pt-0 sm:pt-0">
          {/* Upload options */}
          {!isOrg && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Personality</label>
                <select
                  value={uploadPersonalityId}
                  onChange={(e) => {
                    setUploadPersonalityId(e.target.value);
                  }}
                  className="w-full bg-card border border-border rounded text-xs py-1.5 px-2"
                >
                  <option value="">Global (All Personalities)</option>
                  {personalities.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Visibility</label>
                <select
                  value={uploadVisibility}
                  onChange={(e) => {
                    setUploadVisibility(e.target.value as 'private' | 'shared');
                  }}
                  className="w-full bg-card border border-border rounded text-xs py-1.5 px-2"
                >
                  <option value="private">Private</option>
                  <option value="shared">Shared</option>
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Title (optional)</label>
            <input
              type="text"
              value={uploadTitle}
              onChange={(e) => {
                setUploadTitle(e.target.value);
              }}
              placeholder="Auto-detected from filename"
              className="w-full bg-card border border-border rounded text-xs py-1.5 px-2"
            />
          </div>

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => {
              setIsDragging(false);
            }}
            onDrop={handleDrop}
          >
            {uploadMutation.isPending ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Processing…</p>
              </div>
            ) : (
              <>
                <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Drop file or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, HTML, MD, TXT (max 20 MB)</p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.html,.htm,.md,.markdown,.txt,.text"
            className="hidden"
            onChange={handleInputChange}
          />

          {uploadMutation.isSuccess && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Document uploaded and queued for indexing.
            </p>
          )}
          {uploadError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {uploadError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
