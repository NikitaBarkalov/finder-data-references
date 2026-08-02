import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GroupedCitations } from '../utils/citations';
import { defaultVisibleCategories } from '../utils/citations';
import { CitationPanel } from './CitationPanel';
function makeGrouped(): GroupedCitations {
  return {
    primaryDoi: [
      {
        citation: 'https://doi.org/10.1/a',
        context: 'context',
        category: 'Primary',
        url: 'https://doi.org/10.1/a',
      },
    ],
    secondaryDoi: [],
    primaryId: [],
    secondaryId: [],
    articles: [],
  };
}
describe('CitationPanel', () => {
  it('shows loading controls and forwards pause/cancel actions', async () => {
    const user = userEvent.setup();
    const onToggleExtractionPause = vi.fn();
    const onCancelExtraction = vi.fn();
    render(
      <CitationPanel
        pdfUrl={null}
        pdfFilename={null}
        pipelineStatus="loading"
        results={null}
        grouped={makeGrouped()}
        isExtractionPaused={false}
        isCachedFile={false}
        isDownloadingPdf={false}
        isDownloadPaused={false}
        generatedFileId={null}
        downloadProgress={null}
        visibleCategories={defaultVisibleCategories()}
        setVisibleCategories={vi.fn()}
        hiddenCitations={{}}
        setHiddenCitations={vi.fn()}
        activeStepIndex={1}
        stepDetails={{ 0: 'No embedded annotations found.' }}
        llmProgress={{ current: 1, total: 3 }}
        rateLimitDelay={null}
        activeCitationSearch={null}
        citationCounts={{}}
        onToggleExtractionPause={onToggleExtractionPause}
        onCancelExtraction={onCancelExtraction}
        onDownloadAnnotatedPdf={vi.fn()}
        onDownloadGeneratedFile={vi.fn()}
        onToggleDownloadPause={vi.fn()}
        onCancelDownload={vi.fn()}
        onFindCitation={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /pause pipeline/i }));
    await user.click(screen.getByRole('button', { name: /cancel pipeline/i }));
    expect(onToggleExtractionPause).toHaveBeenCalledTimes(1);
    expect(onCancelExtraction).toHaveBeenCalledTimes(1);
  });
  it('renders result actions and category toggles', async () => {
    const user = userEvent.setup();
    const onDownloadAnnotatedPdf = vi.fn();
    const onDownloadGeneratedFile = vi.fn();
    const setVisibleCategories = vi.fn();
    const setHiddenCitations = vi.fn();
    render(
      <CitationPanel
        pdfUrl="blob:restored-pdf"
        pdfFilename="10.1234_restored.pdf"
        pipelineStatus="results"
        results={{
          authors: 'Smith J',
          citations: makeGrouped().primaryDoi,
        }}
        grouped={makeGrouped()}
        isExtractionPaused={false}
        isCachedFile={false}
        isDownloadingPdf={false}
        isDownloadPaused={false}
        generatedFileId={null}
        downloadProgress={null}
        visibleCategories={defaultVisibleCategories()}
        setVisibleCategories={setVisibleCategories}
        hiddenCitations={{}}
        setHiddenCitations={setHiddenCitations}
        activeStepIndex={7}
        stepDetails={{}}
        llmProgress={null}
        rateLimitDelay={null}
        activeCitationSearch={null}
        citationCounts={{ 'https://doi.org/10.1/a': 1 }}
        onToggleExtractionPause={vi.fn()}
        onCancelExtraction={vi.fn()}
        onDownloadAnnotatedPdf={onDownloadAnnotatedPdf}
        onDownloadGeneratedFile={onDownloadGeneratedFile}
        onToggleDownloadPause={vi.fn()}
        onCancelDownload={vi.fn()}
        onFindCitation={vi.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: 'https://doi.org/10.1234/restored' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /generate marked pdf/i }));
    await user.click(screen.getByRole('checkbox', { name: 'PRIMARY DOI' }));
    expect(onDownloadAnnotatedPdf).toHaveBeenCalledTimes(1);
    expect(setVisibleCategories).toHaveBeenCalled();
    expect(setHiddenCitations).toHaveBeenCalled();
  });
});
describe('CitationPanel additional branches', () => {
  it('renders paused download controls and forwards pause/cancel for download', async () => {
    const user = userEvent.setup();
    const onToggleDownloadPause = vi.fn();
    const onCancelDownload = vi.fn();
    render(
      <CitationPanel
        pdfUrl="blob:restored-pdf"
        pdfFilename="paper.pdf"
        pipelineStatus="results"
        results={{ authors: 'Smith J', citations: makeGrouped().primaryDoi }}
        grouped={makeGrouped()}
        isExtractionPaused={false}
        isCachedFile={false}
        isDownloadingPdf={true}
        isDownloadPaused={true}
        generatedFileId={null}
        downloadProgress={{ current: 1, total: 3 }}
        visibleCategories={defaultVisibleCategories()}
        setVisibleCategories={vi.fn()}
        hiddenCitations={{}}
        setHiddenCitations={vi.fn()}
        activeStepIndex={7}
        stepDetails={{}}
        llmProgress={null}
        rateLimitDelay={null}
        activeCitationSearch={null}
        citationCounts={{ 'https://doi.org/10.1/a': 1 }}
        onToggleExtractionPause={vi.fn()}
        onCancelExtraction={vi.fn()}
        onDownloadAnnotatedPdf={vi.fn()}
        onDownloadGeneratedFile={vi.fn()}
        onToggleDownloadPause={onToggleDownloadPause}
        onCancelDownload={onCancelDownload}
        onFindCitation={vi.fn()}
      />,
    );
    expect(screen.getByText(/Paused/i)).toBeInTheDocument();
    await user.click(screen.getByTitle(/Resume Generation|Pause Generation/i));
    await user.click(screen.getByTitle(/Cancel Generation/i));
    expect(onToggleDownloadPause).toHaveBeenCalledTimes(1);
    expect(onCancelDownload).toHaveBeenCalledTimes(1);
  });
  it('renders non-DOI filename as plain text', () => {
    render(
      <CitationPanel
        pdfUrl="blob:restored-pdf"
        pdfFilename="paper.pdf"
        pipelineStatus="results"
        results={{ authors: 'Smith J', citations: makeGrouped().primaryDoi }}
        grouped={makeGrouped()}
        isExtractionPaused={false}
        isCachedFile={false}
        isDownloadingPdf={false}
        isDownloadPaused={false}
        generatedFileId={null}
        downloadProgress={null}
        visibleCategories={defaultVisibleCategories()}
        setVisibleCategories={vi.fn()}
        hiddenCitations={{}}
        setHiddenCitations={vi.fn()}
        activeStepIndex={7}
        stepDetails={{}}
        llmProgress={null}
        rateLimitDelay={null}
        activeCitationSearch={null}
        citationCounts={{}}
        onToggleExtractionPause={vi.fn()}
        onCancelExtraction={vi.fn()}
        onDownloadAnnotatedPdf={vi.fn()}
        onDownloadGeneratedFile={vi.fn()}
        onToggleDownloadPause={vi.fn()}
        onCancelDownload={vi.fn()}
        onFindCitation={vi.fn()}
      />,
    );
    expect(screen.getByText('paper.pdf')).toBeInTheDocument();
  });
});
