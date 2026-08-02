import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PdfViewer } from './PdfViewer';

describe('PdfViewer', () => {
  it('renders pdf pages and the toolbar using the mocked react-pdf layer', () => {
    const pdfContainerRef = createRef<HTMLDivElement>();

    render(
      <PdfViewer
        pdfUrl="blob:mock-pdf"
        pdfContainerRef={pdfContainerRef}
        numPages={2}
        setNumPages={vi.fn()}
        zoom={1}
        setZoom={vi.fn()}
        pdfWidth={800}
        isSearchOpen={false}
        setIsSearchOpen={vi.fn()}
        searchText=""
        setSearchText={vi.fn()}
        matchCount={0}
        currentMatch={0}
        highlightRects={[]}
        handleSearch={vi.fn()}
        debouncedApplyHighlights={vi.fn()}
        pipelineStatus="results"
        isExtractionPaused={false}
        isDownloadingPdf={false}
        isDownloadPaused={false}
        onRequestUploadNew={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload New PDF' })).toBeInTheDocument();
    expect(screen.getByTestId('pdf-page-1')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-page-2')).toBeInTheDocument();
  });

  it('opens search, updates the query, and clears it again', async () => {
    const user = userEvent.setup();
    const handleSearch = vi.fn();
    const setSearchText = vi.fn();
    const setIsSearchOpen = vi.fn();
    const pdfContainerRef = createRef<HTMLDivElement>();

    render(
      <PdfViewer
        pdfUrl="blob:mock-pdf"
        pdfContainerRef={pdfContainerRef}
        numPages={1}
        setNumPages={vi.fn()}
        zoom={1}
        setZoom={vi.fn()}
        pdfWidth={800}
        isSearchOpen={false}
        setIsSearchOpen={setIsSearchOpen}
        searchText=""
        setSearchText={setSearchText}
        matchCount={0}
        currentMatch={0}
        highlightRects={[]}
        handleSearch={handleSearch}
        debouncedApplyHighlights={vi.fn()}
        pipelineStatus="results"
        isExtractionPaused={false}
        isDownloadingPdf={false}
        isDownloadPaused={false}
        onRequestUploadNew={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /search/i }));

    expect(setIsSearchOpen).toHaveBeenCalledWith(true);
  });

  it('closes search and clears the current query', async () => {
    const user = userEvent.setup();
    const handleSearch = vi.fn();
    const setSearchText = vi.fn();
    const setIsSearchOpen = vi.fn();
    const pdfContainerRef = createRef<HTMLDivElement>();

    render(
      <PdfViewer
        pdfUrl="blob:mock-pdf"
        pdfContainerRef={pdfContainerRef}
        numPages={1}
        setNumPages={vi.fn()}
        zoom={1}
        setZoom={vi.fn()}
        pdfWidth={800}
        isSearchOpen
        setIsSearchOpen={setIsSearchOpen}
        searchText="alpha"
        setSearchText={setSearchText}
        matchCount={3}
        currentMatch={2}
        highlightRects={[]}
        handleSearch={handleSearch}
        debouncedApplyHighlights={vi.fn()}
        pipelineStatus="results"
        isExtractionPaused={false}
        isDownloadingPdf={false}
        isDownloadPaused={false}
        onRequestUploadNew={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(setIsSearchOpen).toHaveBeenCalledWith(false);
    expect(setSearchText).toHaveBeenCalledWith('');
    expect(handleSearch).toHaveBeenCalledWith('', true, true);
  });

  it('disables upload while work is in progress and enables it when idle', async () => {
    const user = userEvent.setup();
    const onRequestUploadNew = vi.fn();
    const pdfContainerRef = createRef<HTMLDivElement>();
    const baseProps = {
      pdfUrl: 'blob:mock-pdf',
      pdfContainerRef,
      numPages: 1,
      setNumPages: vi.fn(),
      zoom: 1,
      setZoom: vi.fn(),
      pdfWidth: 800,
      isSearchOpen: false,
      setIsSearchOpen: vi.fn(),
      searchText: '',
      setSearchText: vi.fn(),
      matchCount: 0,
      currentMatch: 0,
      highlightRects: [],
      handleSearch: vi.fn(),
      debouncedApplyHighlights: vi.fn(),
      isExtractionPaused: false,
      isDownloadingPdf: false,
      isDownloadPaused: false,
      onRequestUploadNew,
    } as const;

    const { rerender } = render(
      <PdfViewer
        {...baseProps}
        pipelineStatus="loading"
      />,
    );

    const uploadButton = screen.getByRole('button', { name: /upload new pdf/i });
    expect(uploadButton).toBeDisabled();

    await user.click(uploadButton);
    expect(onRequestUploadNew).not.toHaveBeenCalled();

    rerender(
      <PdfViewer
        {...baseProps}
        pipelineStatus="results"
      />,
    );

    const enabledUploadButton = screen.getByRole('button', { name: /upload new pdf/i });
    expect(enabledUploadButton).toBeEnabled();

    await user.click(enabledUploadButton);
    expect(onRequestUploadNew).toHaveBeenCalledTimes(1);
  });
});
