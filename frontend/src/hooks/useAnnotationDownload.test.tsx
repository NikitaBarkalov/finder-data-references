import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAnnotationDownload } from './useAnnotationDownload';

describe('useAnnotationDownload', () => {
  it('creates a download link for a generated file', () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(HTMLAnchorElement.prototype, 'remove');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    const { result } = renderHook(() =>
      useAnnotationDownload({
        pdfUrl: null,
        pdfFilename: 'paper.pdf',
        results: null,
        hiddenCitations: {},
        generatedFileId: 'file-123',
        setGeneratedFileId: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleDownloadGeneratedFile();
    });

    expect(appendSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
  });

  it('starts the annotated PDF generation flow', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        blob: async () => new Blob(['pdf'], { type: 'application/pdf' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ task_id: 'task-123' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useAnnotationDownload({
        pdfUrl: 'blob:mock-pdf',
        pdfFilename: 'paper.pdf',
        results: {
          authors: 'Smith J',
          citations: [
            {
              citation: 'https://doi.org/10.1/a',
              context: 'context',
              category: 'Primary',
            },
          ],
        },
        hiddenCitations: {},
        generatedFileId: null,
        setGeneratedFileId: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleDownloadAnnotatedPdf();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.currentDownloadTaskId).toBe('task-123');
    expect(result.current.isDownloadingPdf).toBe(true);
    expect(result.current.downloadProgress).toEqual({ current: 0, total: 1 });
  });

  it('handles errors during handleDownloadAnnotatedPdf fetch', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { result } = renderHook(() =>
      useAnnotationDownload({
        pdfUrl: 'blob:test',
        pdfFilename: 'test.pdf',
        results: { authors: 'Test', citations: [] },
        hiddenCitations: {},
        generatedFileId: null,
        setGeneratedFileId: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleDownloadAnnotatedPdf();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error));
    expect(alertSpy).toHaveBeenCalledWith('Failed to download annotated PDF.');
    expect(result.current.isDownloadingPdf).toBe(false);
    expect(result.current.downloadProgress).toBeNull();
    expect(result.current.currentDownloadTaskId).toBeNull();

    alertSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('handles fetch exceptions during cancellation and pause/resume', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { result } = renderHook(() =>
      useAnnotationDownload({
        pdfUrl: null,
        pdfFilename: null,
        results: null,
        hiddenCitations: {},
        generatedFileId: null,
        setGeneratedFileId: vi.fn(),
      }),
    );

    act(() => {
      result.current.setCurrentDownloadTaskId('task-error');
    });

    await act(async () => {
      await result.current.handleCancelDownload();
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to cancel task', expect.any(Error));
    expect(result.current.isDownloadingPdf).toBe(false);

    act(() => {
      result.current.setCurrentDownloadTaskId('task-error');
    });

    await act(async () => {
      await result.current.handleToggleDownloadPause();
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to pause download task', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it('processes events from the download stream and handles completion/errors', async () => {
    let eventSourceMock: {
      onmessage: ((event: MessageEvent) => void) | null;
      onerror: ((event: Event) => void) | null;
      close: ReturnType<typeof vi.fn>;
    } | null = null;

    class MockEventSource {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      close = vi.fn();
      constructor() { eventSourceMock = this; }
    }
    vi.stubGlobal('EventSource', MockEventSource);

    const { result } = renderHook(() =>
      useAnnotationDownload({
        pdfUrl: 'blob:test',
        pdfFilename: 'test.pdf',
        results: null,
        hiddenCitations: {},
        generatedFileId: null,
        setGeneratedFileId: vi.fn(),
      }),
    );

    act(() => {
      result.current.setCurrentDownloadTaskId('task-stream');
      result.current.setIsDownloadingPdf(true);
    });

    expect(eventSourceMock).not.toBeNull();

    // progress event
    act(() => {
      eventSourceMock?.onmessage?.({
        data: JSON.stringify({ type: 'progress', current: 2, total: 5 }),
      } as MessageEvent);
    });

    expect(result.current.downloadProgress).toEqual({ current: 2, total: 5 });

    // error event
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    act(() => {
      eventSourceMock?.onmessage?.({
        data: JSON.stringify({ type: 'error', message: 'Failed generation' }),
      } as MessageEvent);
    });

    expect(alertSpy).toHaveBeenCalledWith('Error: Failed generation');
    expect(result.current.isDownloadingPdf).toBe(false);
    expect(result.current.currentDownloadTaskId).toBeNull();

    // re-trigger for completion
    act(() => {
      result.current.setCurrentDownloadTaskId('task-stream-2');
      result.current.setIsDownloadingPdf(true);
    });

    // complete event
    act(() => {
      eventSourceMock?.onmessage?.({
        data: JSON.stringify({ type: 'complete', result: { file_id: 'file-123' } }),
      } as MessageEvent);
    });

    expect(result.current.isDownloadingPdf).toBe(false);
    expect(result.current.currentDownloadTaskId).toBeNull();
    // setGeneratedFileId is called, which we can mock or let it fall through.
    
    // re-trigger for onerror
    act(() => {
      result.current.setCurrentDownloadTaskId('task-stream-3');
      result.current.setIsDownloadingPdf(true);
    });

    act(() => {
      eventSourceMock?.onerror?.(new Event('error'));
    });

    expect(result.current.isDownloadingPdf).toBe(false);
    expect(result.current.currentDownloadTaskId).toBeNull();

    alertSpy.mockRestore();
  });
});
describe('useAnnotationDownload additional flows', () => {
  it('cancels a download task', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useAnnotationDownload({
        pdfUrl: null,
        pdfFilename: 'paper.pdf',
        results: null,
        hiddenCitations: {},
        generatedFileId: null,
        setGeneratedFileId: vi.fn(),
      }),
    );

    act(() => {
      result.current.setCurrentDownloadTaskId('task-abc');
    });

    await act(async () => {
      await result.current.handleCancelDownload();
    });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/task/task-abc/cancel'), { method: 'POST' });
    expect(result.current.currentDownloadTaskId).toBeNull();
    expect(result.current.isDownloadingPdf).toBe(false);
  });

  it('toggles pause/resume for download task', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useAnnotationDownload({
        pdfUrl: null,
        pdfFilename: 'paper.pdf',
        results: null,
        hiddenCitations: {},
        generatedFileId: null,
        setGeneratedFileId: vi.fn(),
      }),
    );

    act(() => {
      result.current.setCurrentDownloadTaskId('task-xyz');
    });

    await act(async () => {
      await result.current.handleToggleDownloadPause();
    });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/task/task-xyz/pause'), { method: 'POST' });
    expect(result.current.isDownloadPaused).toBe(true);

    await act(async () => {
      await result.current.handleToggleDownloadPause();
    });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/task/task-xyz/resume'), { method: 'POST' });
    expect(result.current.isDownloadPaused).toBe(false);
  });
});
