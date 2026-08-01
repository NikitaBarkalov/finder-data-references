import type { RefObject } from 'react';
import { Document, Page } from 'react-pdf';
import type { HighlightRect, PipelineStatus } from '../types';

type PdfViewerProps = {
  pdfUrl: string;
  pdfContainerRef: RefObject<HTMLDivElement | null>;
  numPages: number | null;
  setNumPages: (n: number) => void;
  zoom: number;
  setZoom: (updater: (z: number) => number) => void;
  pdfWidth: number;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  searchText: string;
  setSearchText: (text: string) => void;
  matchCount: number;
  currentMatch: number;
  highlightRects: HighlightRect[];
  handleSearch: (text: string, forward?: boolean, isTyping?: boolean) => void;
  debouncedApplyHighlights: () => void;
  pipelineStatus: PipelineStatus;
  isExtractionPaused: boolean;
  isDownloadingPdf: boolean;
  isDownloadPaused: boolean;
  onRequestUploadNew: () => void;
};

export function PdfViewer({
  pdfUrl,
  pdfContainerRef,
  numPages,
  setNumPages,
  zoom,
  setZoom,
  pdfWidth,
  isSearchOpen,
  setIsSearchOpen,
  searchText,
  setSearchText,
  matchCount,
  currentMatch,
  highlightRects,
  handleSearch,
  debouncedApplyHighlights,
  pipelineStatus,
  isExtractionPaused,
  isDownloadingPdf,
  isDownloadPaused,
  onRequestUploadNew,
}: PdfViewerProps) {
  const uploadDisabled =
    (pipelineStatus === 'loading' && !isExtractionPaused) ||
    (isDownloadingPdf && !isDownloadPaused);

  return (
    <div className="custom-pdf-container">
      <div className="pdf-toolbar">
        <button onClick={() => setZoom(z => Math.max(0.6, z - 0.2))}>-</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.2))}>+</button>
        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.2)', margin: '0 0.5rem' }} />
        <button
          onClick={() => {
            setIsSearchOpen(!isSearchOpen);
            if (isSearchOpen) {
              setSearchText('');
              handleSearch('', true, true);
            }
          }}
          title={isSearchOpen ? 'Close search' : 'Open search'}
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
        >
          {isSearchOpen ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Close
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              Search
            </div>
          )}
        </button>
        {isSearchOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search in PDF..."
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  handleSearch(e.target.value, true, true);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchText, true)}
                className="pdf-search-input"
                style={{ paddingRight: searchText ? '24px' : undefined }}
                autoFocus
              />
              {searchText && (
                <button
                  onClick={() => {
                    setSearchText('');
                    handleSearch('', true, true);
                  }}
                  title="Clear search"
                  style={{ position: 'absolute', right: '4px', padding: '0 4px', border: 'none', background: 'transparent', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}
                >
                  ✖
                </button>
              )}
            </div>
            {matchCount > 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', minWidth: '40px' }}>
                {currentMatch} of {matchCount}
              </span>
            )}
            <button onClick={() => handleSearch(searchText, false)} title="Previous match" style={{ padding: '0.25rem 0.5rem' }}>↑</button>
            <button onClick={() => handleSearch(searchText, true)} title="Next match" style={{ padding: '0.25rem 0.5rem' }}>↓</button>
          </div>
        )}
        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.2)', margin: '0 0.5rem' }} />
        <button
          className="upload-new-btn"
          style={{
            padding: '0.3rem 0.8rem',
            fontSize: '0.85rem',
            opacity: uploadDisabled ? 0.5 : 1,
            cursor: uploadDisabled ? 'not-allowed' : 'pointer',
          }}
          disabled={uploadDisabled}
          onClick={() => {
            if (uploadDisabled) return;
            onRequestUploadNew();
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          Upload New PDF
        </button>
      </div>
      <div ref={pdfContainerRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', position: 'relative' }}>
        <Document
          file={pdfUrl}
          onLoadSuccess={({ numPages: pages }) => setNumPages(pages)}
          loading={<div className="pdf-placeholder">Loading PDF...</div>}
          error={<div className="pdf-placeholder" style={{ color: '#ef4444' }}>Failed to load PDF.</div>}
          externalLinkTarget="_blank"
        >
          {Array.from(new Array(numPages || 0), (_, index) => (
            <div key={`page_${index + 1}`} className="pdf-page-wrapper">
              <Page
                pageNumber={index + 1}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="pdf-page"
                width={pdfWidth ? pdfWidth * zoom : undefined}
                onRenderTextLayerSuccess={debouncedApplyHighlights}
              />
            </div>
          ))}
        </Document>
        {highlightRects.map((rect, i) => (
          <div
            key={`highlight_${i}`}
            style={{
              position: 'absolute',
              top: rect.top - 2.5,
              left: rect.left - 2.5,
              width: rect.width + 5,
              height: rect.height + 5,
              border: '2.5px solid #ef4444',
              boxShadow: '0 0 6px rgba(239, 68, 68, 0.5)',
              borderRadius: '3px',
              pointerEvents: 'none',
              zIndex: 10,
              boxSizing: 'border-box',
            }}
          />
        ))}
      </div>
    </div>
  );
}
