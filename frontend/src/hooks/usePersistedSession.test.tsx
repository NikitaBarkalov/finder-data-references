import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'idb-keyval';
import { usePersistedSession } from './usePersistedSession';

describe('usePersistedSession', () => {
  beforeEach(() => {
    vi.mocked(get).mockReset();
  });

  it('restores a saved successful session', async () => {
    vi.mocked(get).mockImplementation(async (key: IDBValidKey) => {
      const map: Record<string, unknown> = {
        savedPdfFile: new File(['pdf'], 'paper.pdf', { type: 'application/pdf' }),
        savedPdfFilename: 'paper.pdf',
        savedResults: {
          authors: 'Smith J',
          citations: [{ citation: 'GSE12345', context: 'ctx', category: 'Primary' }],
        },
        savedPipelineStatus: 'results',
        savedIsCachedFile: false,
        savedGeneratedFileId: 'file-id',
      };
      return map[key as string];
    });

    const setters = {
      setPdfUrl: vi.fn(),
      setPdfFilename: vi.fn(),
      setIsCachedFile: vi.fn(),
      setGeneratedFileId: vi.fn(),
      setIsDownloadingPdf: vi.fn(),
      setCurrentDownloadTaskId: vi.fn(),
      setIsDownloadPaused: vi.fn(),
      setDownloadProgress: vi.fn(),
      setPipelineStatus: vi.fn(),
      setCurrentExtractionTaskId: vi.fn(),
      setIsExtractionPaused: vi.fn(),
      setActiveStepIndex: vi.fn(),
      setStepDetails: vi.fn(),
      setLlmProgress: vi.fn(),
      setResults: vi.fn(),
    };

    renderHook(() => usePersistedSession(setters));

    await waitFor(() => {
      expect(setters.setPdfUrl).toHaveBeenCalledWith('blob:mock-pdf');
    });

    expect(setters.setPdfFilename).toHaveBeenCalledWith('paper.pdf');
    expect(setters.setResults).toHaveBeenCalledWith({
      authors: 'Smith J',
      citations: [{ citation: 'GSE12345', context: 'ctx', category: 'Primary' }],
    });
    expect(setters.setGeneratedFileId).toHaveBeenCalledWith('file-id');
    expect(setters.setPipelineStatus).toHaveBeenCalledWith('results');
    expect(setters.setActiveStepIndex).toHaveBeenCalled();
  });

});

// Additional tests moved from usePersistedSession.extra.test.tsx
describe('usePersistedSession additional flows', () => {
  beforeEach(() => {
    vi.mocked(get).mockReset();
  });

  it('restores loading state with saved extraction task and paused flags', async () => {
    vi.mocked(get).mockImplementation(async (key: IDBValidKey) => {
      const map: Record<string, unknown> = {
        savedExtractionTaskId: 'ext-1',
        savedPipelineStatus: 'loading',
        savedIsExtractionPaused: true,
        savedActiveStepIndex: 2,
        savedStepDetails: { 2: 'details' },
        savedLlmProgress: { current: 1, total: 3 },
      };
      return map[key as string];
    });

    const setters = {
      setPdfUrl: vi.fn(),
      setPdfFilename: vi.fn(),
      setIsCachedFile: vi.fn(),
      setGeneratedFileId: vi.fn(),
      setIsDownloadingPdf: vi.fn(),
      setCurrentDownloadTaskId: vi.fn(),
      setIsDownloadPaused: vi.fn(),
      setDownloadProgress: vi.fn(),
      setPipelineStatus: vi.fn(),
      setCurrentExtractionTaskId: vi.fn(),
      setIsExtractionPaused: vi.fn(),
      setActiveStepIndex: vi.fn(),
      setStepDetails: vi.fn(),
      setLlmProgress: vi.fn(),
      setResults: vi.fn(),
    };

    renderHook(() => usePersistedSession(setters));

    await waitFor(() => {
      expect(setters.setPipelineStatus).toHaveBeenCalledWith('loading');
    });

    expect(setters.setCurrentExtractionTaskId).toHaveBeenCalledWith('ext-1');
    expect(setters.setIsExtractionPaused).toHaveBeenCalledWith(true);
    expect(setters.setActiveStepIndex).toHaveBeenCalledWith(2);
  });
});
