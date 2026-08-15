import { useState, useRef, useEffect } from 'react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './index.css';
import './pdfSetup';
import { UploadZone } from './components/UploadZone';
import { PdfViewer } from './components/PdfViewer';
import { CitationPanel } from './components/CitationPanel';
import { ConfirmUploadDialog } from './components/ConfirmUploadDialog';
import { usePersistedSession, clearPersistedSession } from './hooks/usePersistedSession';
import { useExtraction } from './hooks/useExtraction';
import { useAnnotationDownload } from './hooks/useAnnotationDownload';
import { usePdfHighlights } from './hooks/usePdfHighlights';
import { usePdfSearch } from './hooks/usePdfSearch';
import { CATEGORY_KEYS, defaultVisibleCategories, getCategoryKey, groupCitations } from './utils/citations';
import type { HighlightRect } from './types';
function App() {
  const [dragActive, setDragActive] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pdfWidth, setPdfWidth] = useState(0);
  const [visibleCategories, setVisibleCategories] = useState(defaultVisibleCategories());
  const [hiddenCitations, setHiddenCitations] = useState<Record<string, boolean>>({});
  const [highlightRects, setHighlightRects] = useState<HighlightRect[]>([]);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const {
    pipelineStatus,
    setPipelineStatus,
    results,
    setResults,
    error,
    activeStepIndex,
    setActiveStepIndex,
    stepDetails,
    setStepDetails,
    setCurrentExtractionTaskId,
    isExtractionPaused,
    setIsExtractionPaused,
    isCachedFile,
    setIsCachedFile,
    llmProgress,
    setLlmProgress,
    rateLimitDelay,
    generatedFileId,
    setGeneratedFileId,
    processFile,
    handleCancelExtraction,
    handleToggleExtractionPause,
  } = useExtraction({
    pdfFilename,
    setPdfUrl,
    setPdfFilename,
    setHighlightRects,
    setVisibleCategories,
    setHiddenCitations,
  });
  const {
    setCurrentDownloadTaskId,
    isDownloadingPdf,
    setIsDownloadingPdf,
    downloadProgress,
    setDownloadProgress,
    isDownloadPaused,
    setIsDownloadPaused,
    handleDownloadAnnotatedPdf,
    handleDownloadGeneratedFile,
    handleCancelDownload,
    handleToggleDownloadPause,
  } = useAnnotationDownload({
    pdfUrl,
    pdfFilename,
    results,
    hiddenCitations,
    generatedFileId,
    setGeneratedFileId,
  });
  const {
    searchText,
    setSearchText,
    isSearchOpen,
    setIsSearchOpen,
    matchCount,
    currentMatch,
    activeCitationSearch,
    handleFindCitation,
    handleSearch,
  } = usePdfSearch({
    pdfContainerRef,
    hiddenCitations,
    pdfUrl,
    highlightRects,
    setHighlightRects,
  });
  const { citationCounts, debouncedApplyHighlights } = usePdfHighlights({
    pdfContainerRef,
    results,
    numPages,
    visibleCategories,
    hiddenCitations,
    isCachedFile,
  });
  usePersistedSession({
    setPdfUrl,
    setPdfFilename,
    setIsCachedFile,
    setGeneratedFileId,
    setIsDownloadingPdf,
    setCurrentDownloadTaskId,
    setIsDownloadPaused,
    setDownloadProgress,
    setPipelineStatus,
    setCurrentExtractionTaskId,
    setIsExtractionPaused,
    setActiveStepIndex,
    setStepDetails,
    setLlmProgress,
    setResults,
  });
  useEffect(() => {
    if (!results) return;
    setVisibleCategories((prev) => {
      const next = { ...prev };
      let changed = false;
      CATEGORY_KEYS.forEach((cat) => {
        const cits = results.citations.filter((cit) => getCategoryKey(cit) === cat);
        if (cits.length > 0) {
          const allHidden = cits.every((cit) => hiddenCitations[cit.citation || '']);
          const allVisible = cits.every((cit) => !hiddenCitations[cit.citation || '']);
          if (allHidden && next[cat] !== false) {
            next[cat] = false;
            changed = true;
          } else if (allVisible && next[cat] !== true) {
            next[cat] = true;
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [hiddenCitations, results]);
  useEffect(() => {
    setHighlightRects([]);
    document.querySelectorAll('.static-pdf-overlay').forEach((el) => el.remove());
  }, [zoom, pdfWidth]);
  useEffect(() => {
    if (!pdfContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setPdfWidth(entries[0].contentRect.width - 64);
    });
    observer.observe(pdfContainerRef.current);
    return () => observer.disconnect();
  }, [pdfUrl]);
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);
  useEffect(() => {
    setZoom(1);
  }, [pdfUrl]);
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };
  const handleConfirmUploadNew = async () => {
    if (pipelineStatus === 'loading' && isExtractionPaused) {
      await handleCancelExtraction();
    }
    await clearPersistedSession();
    window.location.reload();
  };
  const grouped = groupCitations(results);
  return (
    <div className="app-container">
      <div className={`pdf-viewer-section ${pipelineStatus === 'cancelled' ? 'pdf-fade-out' : ''}`}>
        {!pdfUrl ? (
          <UploadZone
            dragActive={dragActive}
            error={error}
            onDrag={handleDrag}
            onDrop={handleDrop}
            onFileSelected={processFile}
          />
        ) : (
          <PdfViewer
            pdfUrl={pdfUrl}
            pdfContainerRef={pdfContainerRef}
            numPages={numPages}
            setNumPages={setNumPages}
            zoom={zoom}
            setZoom={setZoom}
            pdfWidth={pdfWidth}
            isSearchOpen={isSearchOpen}
            setIsSearchOpen={setIsSearchOpen}
            searchText={searchText}
            setSearchText={setSearchText}
            matchCount={matchCount}
            currentMatch={currentMatch}
            highlightRects={highlightRects}
            handleSearch={handleSearch}
            debouncedApplyHighlights={debouncedApplyHighlights}
            pipelineStatus={pipelineStatus}
            isExtractionPaused={isExtractionPaused}
            isDownloadingPdf={isDownloadingPdf}
            isDownloadPaused={isDownloadPaused}
            onRequestUploadNew={() => setShowUploadConfirm(true)}
          />
        )}
      </div>

      {showUploadConfirm && (
        <ConfirmUploadDialog onCancel={() => setShowUploadConfirm(false)} onConfirm={handleConfirmUploadNew} />
      )}

      <CitationPanel
        pdfUrl={pdfUrl}
        pdfFilename={pdfFilename}
        pipelineStatus={pipelineStatus}
        results={results}
        grouped={grouped}
        isExtractionPaused={isExtractionPaused}
        isCachedFile={isCachedFile}
        isDownloadingPdf={isDownloadingPdf}
        isDownloadPaused={isDownloadPaused}
        generatedFileId={generatedFileId}
        downloadProgress={downloadProgress}
        visibleCategories={visibleCategories}
        setVisibleCategories={setVisibleCategories}
        hiddenCitations={hiddenCitations}
        setHiddenCitations={setHiddenCitations}
        activeStepIndex={activeStepIndex}
        stepDetails={stepDetails}
        llmProgress={llmProgress}
        rateLimitDelay={rateLimitDelay}
        activeCitationSearch={activeCitationSearch}
        citationCounts={citationCounts}
        onToggleExtractionPause={handleToggleExtractionPause}
        onCancelExtraction={handleCancelExtraction}
        onDownloadAnnotatedPdf={handleDownloadAnnotatedPdf}
        onDownloadGeneratedFile={handleDownloadGeneratedFile}
        onToggleDownloadPause={handleToggleDownloadPause}
        onCancelDownload={handleCancelDownload}
        onFindCitation={handleFindCitation}
      />
    </div>
  );
}
export default App;
