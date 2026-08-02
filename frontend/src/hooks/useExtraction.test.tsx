import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExtraction } from './useExtraction';
import { PIPELINE_STEPS } from '../constants/pipeline';

describe('useExtraction', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects non-PDF files before starting the network flow', async () => {
    const setters = {
      pdfFilename: null,
      setPdfUrl: vi.fn(),
      setPdfFilename: vi.fn(),
      setHighlightRects: vi.fn(),
      setVisibleCategories: vi.fn(),
      setHiddenCitations: vi.fn(),
    };

    const { result } = renderHook(() => useExtraction(setters));

    await act(async () => {
      await result.current.processFile(new File(['text'], 'notes.txt', { type: 'text/plain' }));
    });

    expect(result.current.error).toBe('Please upload a valid PDF file.');
    expect(setters.setPdfUrl).not.toHaveBeenCalled();
  });

  it('cancels an in-flight extraction task', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const setters = {
      pdfFilename: null,
      setPdfUrl: vi.fn(),
      setPdfFilename: vi.fn(),
      setHighlightRects: vi.fn(),
      setVisibleCategories: vi.fn(),
      setHiddenCitations: vi.fn(),
    };

    const { result } = renderHook(() => useExtraction(setters));

    act(() => {
      result.current.setCurrentExtractionTaskId('task-123');
      result.current.setPipelineStatus('loading');
    });

    await act(async () => {
      await result.current.handleCancelExtraction();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/task/task-123/cancel'),
      { method: 'POST' },
    );
    expect(result.current.pipelineStatus).toBe('cancelled');
    expect(result.current.currentExtractionTaskId).toBeNull();
  });

  it('toggles extraction pause and resume', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const setters = {
      pdfFilename: null,
      setPdfUrl: vi.fn(),
      setPdfFilename: vi.fn(),
      setHighlightRects: vi.fn(),
      setVisibleCategories: vi.fn(),
      setHiddenCitations: vi.fn(),
    };

    const { result } = renderHook(() => useExtraction(setters));

    act(() => {
      result.current.setCurrentExtractionTaskId('task-456');
      result.current.setPipelineStatus('loading');
    });

    await act(async () => {
      await result.current.handleToggleExtractionPause();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/task/task-456/pause'),
      { method: 'POST' },
    );
    expect(result.current.isExtractionPaused).toBe(true);

    await act(async () => {
      await result.current.handleToggleExtractionPause();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/task/task-456/resume'),
      { method: 'POST' },
    );
    expect(result.current.isExtractionPaused).toBe(false);
  });

  it('processes progress and completion events from the extraction stream', async () => {
    vi.useFakeTimers();

    let eventSourceMock: {
      onmessage: ((event: MessageEvent) => void) | null;
      onerror: ((event: Event) => void) | null;
      close: ReturnType<typeof vi.fn>;
    } | null = null;

    class MockEventSource {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      close = vi.fn();

      constructor() {
        eventSourceMock = this;
      }
    }

    vi.stubGlobal('EventSource', MockEventSource);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_id: 'task-789' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const setters = {
      pdfFilename: null,
      setPdfUrl: vi.fn(),
      setPdfFilename: vi.fn(),
      setHighlightRects: vi.fn(),
      setVisibleCategories: vi.fn(),
      setHiddenCitations: vi.fn(),
    };

    const { result } = renderHook(() =>
      useExtraction({
        ...setters,
        pdfFilename: 'paper.pdf',
      }),
    );

    await act(async () => {
      await result.current.processFile(new File(['pdf'], 'paper.pdf', { type: 'application/pdf' }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/extract'),
      expect.objectContaining({ method: 'POST' }),
    );

    expect(eventSourceMock).not.toBeNull();

    await act(async () => {
      eventSourceMock?.onmessage?.({
        data: JSON.stringify({ type: 'rate_limit', delay: 7 }),
      } as MessageEvent);
      eventSourceMock?.onmessage?.({
        data: JSON.stringify({ type: 'progress_counter', current: 2, total: 5 }),
      } as MessageEvent);
    });

    expect(result.current.rateLimitDelay).toBe(7);
    expect(result.current.llmProgress).toEqual({ current: 2, total: 5 });

    await act(async () => {
      eventSourceMock?.onmessage?.({
        data: JSON.stringify({
          type: 'progress',
          message: 'Found 2 raw citations before deduplication',
        }),
      } as MessageEvent);
    });

    expect(result.current.rateLimitDelay).toBeNull();
    expect(result.current.activeStepIndex).toBe(2);
    expect(result.current.stepDetails[2]).toBe('2 raw references found');

    await act(async () => {
      eventSourceMock?.onmessage?.({
        data: JSON.stringify({
          type: 'complete',
          result: {
            authors: 'Smith J',
            citations: [{ citation: 'GSE12345', context: 'ctx', category: 'Primary' }],
          },
        }),
      } as MessageEvent);
      await vi.advanceTimersByTimeAsync(500 + 1000 + 250);
    });

    expect((eventSourceMock as any)?.close).toHaveBeenCalled();
    expect(result.current.results).toEqual({
      authors: 'Smith J',
      citations: [{ citation: 'GSE12345', context: 'ctx', category: 'Primary' }],
    });
    expect(result.current.pipelineStatus).toBe('success');
    expect(result.current.activeStepIndex).toBe(PIPELINE_STEPS.length);
  });

  it('handles a cancellation error event from the extraction stream', async () => {
    let eventSourceMock: {
      onmessage: ((event: MessageEvent) => void) | null;
      onerror: ((event: Event) => void) | null;
      close: ReturnType<typeof vi.fn>;
    } | null = null;

    class MockEventSource {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      close = vi.fn();

      constructor() {
        eventSourceMock = this;
      }
    }

    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_id: 'task-999' }),
    }));

    const setters = {
      pdfFilename: null,
      setPdfUrl: vi.fn(),
      setPdfFilename: vi.fn(),
      setHighlightRects: vi.fn(),
      setVisibleCategories: vi.fn(),
      setHiddenCitations: vi.fn(),
    };

    const { result } = renderHook(() =>
      useExtraction({
        ...setters,
        pdfFilename: 'paper.pdf',
      }),
    );

    await act(async () => {
      await result.current.processFile(new File(['pdf'], 'paper.pdf', { type: 'application/pdf' }));
    });

    await act(async () => {
      eventSourceMock?.onmessage?.({
        data: JSON.stringify({ type: 'error', message: 'Cancelled by user' }),
      } as MessageEvent);
    });

    expect((eventSourceMock as any)?.close).toHaveBeenCalled();
    expect(result.current.pipelineStatus).toBe('cancelled');
    expect(result.current.currentExtractionTaskId).toBeNull();
  });

  it('handles general error event from the extraction stream and network errors', async () => {
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
    
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_id: 'task-111' }),
    }));

    const { result } = renderHook(() =>
      useExtraction({
        pdfFilename: 'paper.pdf',
        setPdfUrl: vi.fn(),
        setPdfFilename: vi.fn(),
        setHighlightRects: vi.fn(),
        setVisibleCategories: vi.fn(),
        setHiddenCitations: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.processFile(new File(['pdf'], 'paper.pdf', { type: 'application/pdf' }));
    });

    // general error event
    await act(async () => {
      eventSourceMock?.onmessage?.({
        data: JSON.stringify({ type: 'error', message: 'Internal Server Error' }),
      } as MessageEvent);
    });

    expect(result.current.pipelineStatus).toBe('idle');
    expect(result.current.error).toBe('Internal Server Error');

    // trigger another process to test onerror
    await act(async () => {
      await result.current.processFile(new File(['pdf'], 'paper.pdf', { type: 'application/pdf' }));
    });

    await act(async () => {
      eventSourceMock?.onerror?.(new Event('error'));
    });

    expect(result.current.error).toBe('Connection to server lost.');
    expect(result.current.pipelineStatus).toBe('idle');
  });

  it('handles API errors during processFile', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ detail: 'Something went wrong' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useExtraction({
        pdfFilename: null,
        setPdfUrl: vi.fn(),
        setPdfFilename: vi.fn(),
        setHighlightRects: vi.fn(),
        setVisibleCategories: vi.fn(),
        setHiddenCitations: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.processFile(new File(['pdf'], 'paper.pdf', { type: 'application/pdf' }));
    });

    expect(result.current.error).toBe('API returned 500: Something went wrong');
    expect(result.current.pipelineStatus).toBe('idle');
  });

  it('processes cached results correctly', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        cached_result: {
          authors: 'Jane Doe',
          citations: [{ citation: '10.1234/test', context: 'ctx', category: 'Primary' }],
        }
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useExtraction({
        pdfFilename: null,
        setPdfUrl: vi.fn(),
        setPdfFilename: vi.fn(),
        setHighlightRects: vi.fn(),
        setVisibleCategories: vi.fn(),
        setHiddenCitations: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.processFile(new File(['pdf'], 'paper.pdf', { type: 'application/pdf' }));
    });

    expect(result.current.isCachedFile).toBe(true);
    
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000); // 500 + 300 + 800
    });

    expect(result.current.pipelineStatus).toBe('results');
    expect(result.current.results?.authors).toBe('Jane Doe');
  });

  it('ticks down the rate limit delay', async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() =>
      useExtraction({
        pdfFilename: null,
        setPdfUrl: vi.fn(),
        setPdfFilename: vi.fn(),
        setHighlightRects: vi.fn(),
        setVisibleCategories: vi.fn(),
        setHiddenCitations: vi.fn(),
      }),
    );

    act(() => {
      result.current.setRateLimitDelay(2);
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.rateLimitDelay).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.rateLimitDelay).toBeNull();
  });

  it('transitions from success to results after timeout', async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() =>
      useExtraction({
        pdfFilename: null,
        setPdfUrl: vi.fn(),
        setPdfFilename: vi.fn(),
        setHighlightRects: vi.fn(),
        setVisibleCategories: vi.fn(),
        setHiddenCitations: vi.fn(),
      }),
    );

    act(() => {
      result.current.setPipelineStatus('success');
    });

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.pipelineStatus).toBe('results');
  });

  it('handles fetch exceptions during cancellation and pause/resume', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { result } = renderHook(() =>
      useExtraction({
        pdfFilename: null,
        setPdfUrl: vi.fn(),
        setPdfFilename: vi.fn(),
        setHighlightRects: vi.fn(),
        setVisibleCategories: vi.fn(),
        setHiddenCitations: vi.fn(),
      }),
    );

    act(() => {
      result.current.setCurrentExtractionTaskId('task-error');
    });

    await act(async () => {
      await result.current.handleCancelExtraction();
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to cancel extraction', expect.any(Error));

    act(() => {
      result.current.setCurrentExtractionTaskId('task-error');
    });

    await act(async () => {
      await result.current.handleToggleExtractionPause();
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to pause extraction', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it('appends text to an existing step detail if mapped.detail.append is true', async () => {
    vi.useFakeTimers();

    let eventSourceMock: {
      onmessage: ((event: MessageEvent) => void) | null;
      close: ReturnType<typeof vi.fn>;
    } | null = null;
    class MockEventSource {
      onmessage: ((event: MessageEvent) => void) | null = null;
      close = vi.fn();
      constructor() { eventSourceMock = this; }
    }
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_id: 'task-append' }),
    }));

    const { result } = renderHook(() =>
      useExtraction({
        pdfFilename: 'paper.pdf',
        setPdfUrl: vi.fn(),
        setPdfFilename: vi.fn(),
        setHighlightRects: vi.fn(),
        setVisibleCategories: vi.fn(),
        setHiddenCitations: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.processFile(new File(['pdf'], 'paper.pdf', { type: 'application/pdf' }));
    });

    await act(async () => {
      eventSourceMock?.onmessage?.({
        data: JSON.stringify({ type: 'progress', message: '1 out of 5 classified as \'dataset\'' }),
      } as MessageEvent);
    });

    expect(result.current.stepDetails[5]).toBe('1 out of 5 classified as \'dataset\'');

    await act(async () => {
      eventSourceMock?.onmessage?.({
        data: JSON.stringify({ type: 'progress', message: '2 out of 5 classified as \'dataset\'' }),
      } as MessageEvent);
    });

    expect(result.current.stepDetails[5]).toBe('1 out of 5 classified as \'dataset\'\n2 out of 5 classified as \'dataset\'');
  });

  it('filters out self-citations based on the DOI in pdfFilename', async () => {
    vi.useFakeTimers();

    let eventSourceMock: {
      onmessage: ((event: MessageEvent) => void) | null;
      close: ReturnType<typeof vi.fn>;
    } | null = null;
    class MockEventSource {
      onmessage: ((event: MessageEvent) => void) | null = null;
      close = vi.fn();
      constructor() { eventSourceMock = this; }
    }
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_id: 'task-doi' }),
    }));

    const { result } = renderHook(() =>
      useExtraction({
        pdfFilename: '10.1234_test-paper.pdf', // starts with 10. and replaces _ with /
        setPdfUrl: vi.fn(),
        setPdfFilename: vi.fn(),
        setHighlightRects: vi.fn(),
        setVisibleCategories: vi.fn(),
        setHiddenCitations: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.processFile(new File(['pdf'], '10.1234_test-paper.pdf', { type: 'application/pdf' }));
    });

    await act(async () => {
      eventSourceMock?.onmessage?.({
        data: JSON.stringify({
          type: 'complete',
          result: {
            authors: 'Test',
            citations: [
              { citation: 'https://doi.org/10.1234/test-paper', context: 'self', category: 'Primary' },
              { citation: 'https://doi.org/10.9999/other', context: 'other', category: 'Primary' }
            ],
          },
        }),
      } as MessageEvent);
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(result.current.results?.citations.length).toBe(1);
    expect(result.current.results?.citations[0].citation).toBe('https://doi.org/10.9999/other');
  });
});
