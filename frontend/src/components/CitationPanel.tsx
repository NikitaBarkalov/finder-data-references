import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ActiveCitationSearch, ExtractionResponse, PipelineStatus, ProgressCounter } from '../types';
import type { GroupedCitations } from '../utils/citations';
import { getCategoryKey } from '../utils/citations';
import { CategorySection } from './CategorySection';
import { PipelineProgress } from './PipelineProgress';

type CitationPanelProps = {
  pdfUrl: string | null;
  pdfFilename: string | null;
  pipelineStatus: PipelineStatus;
  results: ExtractionResponse | null;
  grouped: GroupedCitations;
  isExtractionPaused: boolean;
  isCachedFile: boolean;
  isDownloadingPdf: boolean;
  isDownloadPaused: boolean;
  generatedFileId: string | null;
  downloadProgress: ProgressCounter | null;
  visibleCategories: Record<string, boolean>;
  setVisibleCategories: Dispatch<SetStateAction<Record<string, boolean>>>;
  hiddenCitations: Record<string, boolean>;
  setHiddenCitations: Dispatch<SetStateAction<Record<string, boolean>>>;
  activeStepIndex: number;
  stepDetails: Record<number, string>;
  llmProgress: ProgressCounter | null;
  rateLimitDelay: number | null;
  activeCitationSearch: ActiveCitationSearch;
  citationCounts: Record<string, number>;
  onToggleExtractionPause: () => void;
  onCancelExtraction: () => void;
  onDownloadAnnotatedPdf: () => void;
  onDownloadGeneratedFile: () => void;
  onToggleDownloadPause: () => void;
  onCancelDownload: () => void;
  onFindCitation: (text: string) => void;
};

export function CitationPanel({
  pdfUrl,
  pdfFilename,
  pipelineStatus,
  results,
  grouped,
  isExtractionPaused,
  isCachedFile,
  isDownloadingPdf,
  isDownloadPaused,
  generatedFileId,
  downloadProgress,
  visibleCategories,
  setVisibleCategories,
  hiddenCitations,
  setHiddenCitations,
  activeStepIndex,
  stepDetails,
  llmProgress,
  rateLimitDelay,
  activeCitationSearch,
  citationCounts,
  onToggleExtractionPause,
  onCancelExtraction,
  onDownloadAnnotatedPdf,
  onDownloadGeneratedFile,
  onToggleDownloadPause,
  onCancelDownload,
  onFindCitation,
}: CitationPanelProps) {
  const toggleHide = useCallback((cit: string) =>
    setHiddenCitations(prev => ({ ...prev, [cit]: !prev[cit] })), []);

  return (
    <div className="content-section">
      <header className="header" style={{ gap: '2rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 auto', minWidth: '350px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.5rem' }}>
            <div>
              <h1 style={{ marginBottom: 0, fontSize: '1.4rem' }}>Finder of Data References</h1>
              <p style={{ margin: 0, marginTop: '0.2rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>AI-powered Data Reference Extractor & Classificator</p>
            </div>

            {pipelineStatus === 'loading' && (
              <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                <button
                  onClick={onToggleExtractionPause}
                  style={{
                    padding: '0.4rem 0.8rem',
                    background: isExtractionPaused ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                    color: isExtractionPaused ? '#22c55e' : '#eab308',
                    border: `1px solid ${isExtractionPaused ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = isExtractionPaused ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)';
                    e.currentTarget.style.border = `1px solid ${isExtractionPaused ? 'rgba(34, 197, 94, 0.5)' : 'rgba(234, 179, 8, 0.5)'}`;
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = isExtractionPaused ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)';
                    e.currentTarget.style.border = `1px solid ${isExtractionPaused ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`;
                  }}
                >
                  {isExtractionPaused ? '▶ Resume Pipeline' : '⏸ Pause Pipeline'}
                </button>
                <button
                  onClick={onCancelExtraction}
                  style={{
                    padding: '0.4rem 0.8rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    e.currentTarget.style.border = '1px solid rgba(239, 68, 68, 0.5)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    e.currentTarget.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                  }}
                >
                  ✖ Cancel Pipeline
                </button>
              </div>
            )}

            {pipelineStatus === 'results' && results && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', position: 'relative' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', position: 'relative' }}>
                  <button
                    onClick={onDownloadAnnotatedPdf}
                    disabled={isDownloadingPdf || isCachedFile || generatedFileId !== null}
                    style={{
                      minWidth: '140px',
                      justifyContent: 'center',
                      padding: '0.4rem 0.8rem',
                      background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: (isDownloadingPdf || isCachedFile || generatedFileId !== null) ? 'not-allowed' : 'pointer',
                      opacity: (isDownloadingPdf || isCachedFile || generatedFileId !== null) ? 0.5 : 1,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      boxShadow: '0 2px 8px rgba(139, 92, 246, 0.2)',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseOver={(e) => {
                      if (!isDownloadingPdf && !isCachedFile && generatedFileId === null) {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isDownloadingPdf && !isCachedFile && generatedFileId === null) {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(139, 92, 246, 0.2)';
                      }
                    }}
                  >
                    {isDownloadingPdf ? (
                      isDownloadPaused ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="6" y="4" width="4" height="16"></rect>
                          <rect x="14" y="4" width="4" height="16"></rect>
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                          <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                        </svg>
                      )
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    )}
                    {isDownloadingPdf ? (
                      isDownloadPaused ? <span>Paused<span className="animated-ellipsis"></span></span> : 'Generating...'
                    ) : 'Generate marked PDF'}
                  </button>
                  <button
                    onClick={onDownloadGeneratedFile}
                    disabled={!generatedFileId || isCachedFile}
                    style={{
                      minWidth: '140px',
                      justifyContent: 'center',
                      padding: '0.4rem 0.8rem',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: (!generatedFileId || isCachedFile) ? 'not-allowed' : 'pointer',
                      opacity: (!generatedFileId || isCachedFile) ? 0.5 : 1,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseOver={(e) => {
                      if (generatedFileId && !isCachedFile) {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (generatedFileId && !isCachedFile) {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.2)';
                      }
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download PDF
                  </button>
                  {isDownloadingPdf && (
                    <div style={{ position: 'absolute', right: '100%', marginRight: '0.5rem', display: 'flex', gap: '0.25rem' }}>
                      <button
                        onClick={onToggleDownloadPause}
                        title={isDownloadPaused ? 'Resume Generation' : 'Pause Generation'}
                        style={{
                          padding: '0.4rem',
                          background: isDownloadPaused ? '#22c55e' : '#eab308',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: `0 2px 8px ${isDownloadPaused ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)'}`,
                          transition: 'all 0.2s ease',
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                        onMouseOut={(e) => (e.currentTarget.style.transform = 'none')}
                      >
                        {isDownloadPaused ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="6" y="4" width="4" height="16"></rect>
                            <rect x="14" y="4" width="4" height="16"></rect>
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={onCancelDownload}
                        title="Cancel Generation"
                        style={{
                          padding: '0.4rem',
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 8px rgba(239, 68, 68, 0.2)',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                        onMouseOut={(e) => (e.currentTarget.style.transform = 'none')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                {downloadProgress && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 500, opacity: 0.8, whiteSpace: 'nowrap' }}>
                    Annotating {downloadProgress.current} of {downloadProgress.total} references...
                  </div>
                )}
              </div>
            )}
          </div>

          {pdfFilename && (
            <div style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Source Article: </span>
              {pdfFilename.startsWith('10.') ? (
                <a
                  href={`https://doi.org/${pdfFilename.replace(/\.pdf$/i, '').replace(/_/g, '/')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent-color)', textDecoration: 'none', fontWeight: 500 }}
                  title="Open article in new tab"
                >
                  https://doi.org/{pdfFilename.replace(/\.pdf$/i, '').replace(/_/g, '/')}
                </a>
              ) : (
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {pdfFilename}
                </span>
              )}
            </div>
          )}

          {pipelineStatus === 'results' && results && (
            <div className="visibility-toggles" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: '1rem', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '0.1rem' }}>HIGHLIGHT IN PDF:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'flex-start' }}>
                {Object.keys(visibleCategories).map(cat => (
                  <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: isCachedFile ? 'not-allowed' : 'pointer', background: visibleCategories[cat] ? 'var(--bg-secondary)' : 'transparent', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', transition: 'all 0.2s', opacity: (visibleCategories[cat] && !isCachedFile) ? 1 : 0.4 }}>
                    <input
                      type="checkbox"
                      disabled={isCachedFile}
                      checked={visibleCategories[cat]}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setVisibleCategories(prev => ({ ...prev, [cat]: isChecked }));
                        if (results) {
                          setHiddenCitations(prev => {
                            const next = { ...prev };
                            results.citations.forEach(cit => {
                              if (getCategoryKey(cit) === cat) {
                                next[cit.citation] = !isChecked;
                              }
                            });
                            return next;
                          });
                        }
                      }}
                      style={{ cursor: 'pointer', margin: 0 }}
                    />
                    {cat}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {pipelineStatus === 'idle' && !pdfUrl && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexGrow: 1,
            color: 'var(--text-secondary)',
          }}>
            <h3>Welcome to Finder of Data References</h3>
            <p style={{ marginTop: '1rem', textAlign: 'center', maxWidth: '400px' }}>
              Upload a PDF file on the left to begin the automated citation extraction and classification process.
            </p>
          </div>
        )}

        {(pipelineStatus === 'loading' || pipelineStatus === 'success' || pipelineStatus === 'cancelled') && (
          <PipelineProgress
            pipelineStatus={pipelineStatus}
            activeStepIndex={activeStepIndex}
            stepDetails={stepDetails}
            isExtractionPaused={isExtractionPaused}
            llmProgress={llmProgress}
            rateLimitDelay={rateLimitDelay}
          />
        )}

        {pipelineStatus === 'results' && results && (
          <div className="results-container results-entrance">
            <div className="categories-wrapper">
              <CategorySection title="PRIMARY DOI" citations={grouped.primaryDoi} badgeClass="primary-doi" onSearch={onFindCitation} activeSearch={activeCitationSearch} counts={citationCounts} hiddenCitations={hiddenCitations} onToggleHide={toggleHide} isCachedFile={isCachedFile} />
              <CategorySection title="SECONDARY DOI" citations={grouped.secondaryDoi} badgeClass="secondary-doi" onSearch={onFindCitation} activeSearch={activeCitationSearch} counts={citationCounts} hiddenCitations={hiddenCitations} onToggleHide={toggleHide} isCachedFile={isCachedFile} />
              <CategorySection title="PRIMARY ID" citations={grouped.primaryId} badgeClass="primary-id" onSearch={onFindCitation} activeSearch={activeCitationSearch} counts={citationCounts} hiddenCitations={hiddenCitations} onToggleHide={toggleHide} isCachedFile={isCachedFile} />
              <CategorySection title="SECONDARY ID" citations={grouped.secondaryId} badgeClass="secondary-id" onSearch={onFindCitation} activeSearch={activeCitationSearch} counts={citationCounts} hiddenCitations={hiddenCitations} onToggleHide={toggleHide} isCachedFile={isCachedFile} />
              <CategorySection title="ARTICLES" citations={grouped.articles} badgeClass="article" onSearch={onFindCitation} activeSearch={activeCitationSearch} counts={citationCounts} hiddenCitations={hiddenCitations} onToggleHide={toggleHide} isCachedFile={isCachedFile} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
