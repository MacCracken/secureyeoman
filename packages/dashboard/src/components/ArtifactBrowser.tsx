/**
 * ArtifactBrowser — Cross-forge artifact registry browser.
 *
 * Displays container images and build artifacts for a selected forge connection.
 * Supports GHCR (GitHub), GitLab Container Registry, and Delta build artifacts.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchContainerImages, fetchImageTags, fetchBuildArtifacts } from '../api/client';
import type { ContainerImage, ContainerTag, BuildArtifact } from '../api/client';

interface ArtifactBrowserProps {
  forgeKey: string;
  owner: string;
  repo?: string;
  pipelineId?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ArtifactBrowser({ forgeKey, owner, repo, pipelineId }: ArtifactBrowserProps) {
  const [activeTab, setActiveTab] = useState<'images' | 'artifacts'>('images');

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Artifact Registry
      </h4>

      <div className="flex gap-2 mb-2">
        <button
          className={`text-xs px-2 py-1 rounded ${
            activeTab === 'images' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
          }`}
          onClick={() => {
            setActiveTab('images');
          }}
        >
          Container Images
        </button>
        <button
          className={`text-xs px-2 py-1 rounded ${
            activeTab === 'artifacts'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground'
          }`}
          onClick={() => {
            setActiveTab('artifacts');
          }}
        >
          Build Artifacts
        </button>
      </div>

      {activeTab === 'images' && <ContainerImagesList forgeKey={forgeKey} owner={owner} />}
      {activeTab === 'artifacts' && repo && pipelineId && (
        <BuildArtifactsList forgeKey={forgeKey} owner={owner} repo={repo} pipelineId={pipelineId} />
      )}
      {activeTab === 'artifacts' && (!repo || !pipelineId) && (
        <p className="text-xs text-muted-foreground">
          Select a repository and pipeline to view build artifacts
        </p>
      )}
    </div>
  );
}

function ContainerImagesList({ forgeKey, owner }: { forgeKey: string; owner: string }) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const imagesQuery = useQuery({
    queryKey: ['artifactImages', forgeKey, owner],
    queryFn: () => fetchContainerImages(forgeKey, owner),
  });

  if (imagesQuery.isLoading) {
    return <p className="text-xs text-muted-foreground">Loading container images...</p>;
  }
  if (imagesQuery.error) {
    return <p className="text-xs text-red-500">{imagesQuery.error.message}</p>;
  }
  if (!imagesQuery.data || imagesQuery.data.length === 0) {
    return <p className="text-xs text-muted-foreground">No container images found</p>;
  }

  return (
    <div className="space-y-1">
      {imagesQuery.data.map((img: ContainerImage) => (
        <div key={img.fullName}>
          <div
            className={`card p-2 cursor-pointer text-xs ${
              expandedImage === img.fullName ? 'ring-1 ring-primary' : ''
            }`}
            onClick={() => {
              setExpandedImage(expandedImage === img.fullName ? null : img.fullName);
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{img.name}</span>
                <span className="text-[10px] text-muted-foreground/60 font-mono">
                  {img.registry}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {img.visibility && (
                  <span className="text-[10px] text-muted-foreground/60">{img.visibility}</span>
                )}
                <span className="text-muted-foreground/60">{formatDate(img.updatedAt)}</span>
              </div>
            </div>
            <p className="text-muted-foreground mt-0.5 truncate font-mono text-[10px]">
              {img.fullName}
            </p>
          </div>

          {expandedImage === img.fullName && (
            <ImageTagsExpanded forgeKey={forgeKey} owner={owner} imageName={img.name} />
          )}
        </div>
      ))}
    </div>
  );
}

function ImageTagsExpanded({
  forgeKey,
  owner,
  imageName,
}: {
  forgeKey: string;
  owner: string;
  imageName: string;
}) {
  const tagsQuery = useQuery({
    queryKey: ['artifactImageTags', forgeKey, owner, imageName],
    queryFn: () => fetchImageTags(forgeKey, owner, imageName),
  });

  if (tagsQuery.isLoading) {
    return <p className="text-xs text-muted-foreground pl-4 py-1">Loading tags...</p>;
  }
  if (tagsQuery.error) {
    return <p className="text-xs text-red-500 pl-4 py-1">{tagsQuery.error.message}</p>;
  }
  if (!tagsQuery.data || tagsQuery.data.length === 0) {
    return <p className="text-xs text-muted-foreground pl-4 py-1">No tags found</p>;
  }

  return (
    <div className="ml-4 border-l border-border pl-3 py-1 space-y-1">
      {tagsQuery.data.map((tag: ContainerTag) => (
        <div key={tag.digest || tag.name} className="text-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono font-medium">{tag.name}</span>
            <div className="flex items-center gap-3 text-muted-foreground/60">
              {tag.size != null && <span>{formatBytes(tag.size)}</span>}
              {tag.architecture && <span>{tag.architecture}</span>}
              <span>{formatDate(tag.pushedAt)}</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/50 font-mono truncate">{tag.digest}</p>
        </div>
      ))}
    </div>
  );
}

function BuildArtifactsList({
  forgeKey,
  owner,
  repo,
  pipelineId,
}: {
  forgeKey: string;
  owner: string;
  repo: string;
  pipelineId: string;
}) {
  const artifactsQuery = useQuery({
    queryKey: ['buildArtifacts', forgeKey, owner, repo, pipelineId],
    queryFn: () => fetchBuildArtifacts(forgeKey, owner, repo, pipelineId),
  });

  if (artifactsQuery.isLoading) {
    return <p className="text-xs text-muted-foreground">Loading build artifacts...</p>;
  }
  if (artifactsQuery.error) {
    return <p className="text-xs text-red-500">{artifactsQuery.error.message}</p>;
  }
  if (!artifactsQuery.data || artifactsQuery.data.length === 0) {
    return <p className="text-xs text-muted-foreground">No build artifacts found</p>;
  }

  return (
    <div className="space-y-1">
      {artifactsQuery.data.map((art: BuildArtifact) => (
        <div key={art.id} className="card p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">{art.name}</span>
            <span className="text-muted-foreground/60">{formatBytes(art.size)}</span>
          </div>
          <div className="flex items-center justify-between mt-0.5 text-muted-foreground">
            <span>Created {formatDate(art.createdAt)}</span>
            <div className="flex items-center gap-2">
              {art.expiresAt && (
                <span className="text-[10px]">Expires {formatDate(art.expiresAt)}</span>
              )}
              {art.downloadUrl && (
                <a
                  href={art.downloadUrl}
                  className="text-primary hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
