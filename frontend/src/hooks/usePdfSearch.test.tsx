import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
const mockGetCitationMatchGroups = vi.hoisted(() => vi.fn());
vi.mock('./usePdfHighlights', () => ({
  getCitationMatchGroups: mockGetCitationMatchGroups,
}));
import { usePdfSearch } from './usePdfSearch';
describe('usePdfSearch', () => {
  beforeEach(() => {
    mockGetCitationMatchGroups.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });
  it('alerts when a citation is not found in the PDF', () => {
    mockGetCitationMatchGroups.mockReturnValue({});
    const pdfContainerRef = { current: document.createElement('div') };
    const { result } = renderHook(() =>
      usePdfSearch({
        pdfContainerRef,
        hiddenCitations: {},
        pdfUrl: null,
        highlightRects: [],
        setHighlightRects: vi.fn(),
      }),
    );
    act(() => {
      result.current.handleFindCitation('missing citation');
    });
    expect(window.alert).toHaveBeenCalledWith(
      '\u0426\u044F \u0446\u0438\u0442\u0430\u0442\u0430 \u043D\u0435 \u0431\u0443\u043B\u0430 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u0432 \u0442\u0435\u043A\u0441\u0442\u0456 PDF.',
    );
  });
  it('scrolls to a matching citation and temporarily highlights the overlay', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    container.className = 'custom-pdf-container';
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: vi.fn(() => ({ top: 0, height: 200 })),
    });
    Object.defineProperty(container, 'scrollBy', {
      value: vi.fn(),
    });
    document.body.appendChild(container);
    const firstMatch = document.createElement('span');
    Object.defineProperty(firstMatch, 'getBoundingClientRect', {
      value: vi.fn(() => ({ top: 120, height: 20 })),
    });
    container.appendChild(firstMatch);
    const overlay = document.createElement('div');
    overlay.className = 'static-pdf-overlay';
    overlay.setAttribute('data-citation', 'matched citation');
    overlay.setAttribute('data-occurrence-index', '0');
    document.body.appendChild(overlay);
    mockGetCitationMatchGroups.mockReturnValue({
      'matched citation': [[firstMatch]],
    });
    const pdfContainerRef = { current: container };
    const { result } = renderHook(() =>
      usePdfSearch({
        pdfContainerRef,
        hiddenCitations: {},
        pdfUrl: null,
        highlightRects: [],
        setHighlightRects: vi.fn(),
      }),
    );
    act(() => {
      result.current.handleFindCitation('matched citation');
    });
    expect(container.scrollBy).toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(overlay.classList.contains('search-active')).toBe(false);
  });
  it('counts matches while typing and clears highlights for empty search', () => {
    const setHighlightRects = vi.fn();
    const pdfContainerRef = {
      current: Object.assign(document.createElement('div'), {
        textContent: 'alpha beta alpha',
      }),
    };
    const { result } = renderHook(() =>
      usePdfSearch({
        pdfContainerRef,
        hiddenCitations: {},
        pdfUrl: null,
        highlightRects: [],
        setHighlightRects,
      }),
    );
    act(() => {
      result.current.handleSearch('alpha', true, true);
    });
    expect(result.current.matchCount).toBe(2);
    expect(setHighlightRects).toHaveBeenCalledWith([]);
    act(() => {
      result.current.handleSearch('', true, true);
    });
    expect(setHighlightRects).toHaveBeenCalledWith([]);
  });
  it('handles manual search (isTyping=false) by wrapping around matches using window.find', () => {
    const setHighlightRects = vi.fn();
    const containerDiv = document.createElement('div');
    containerDiv.textContent = 'alpha beta alpha';
    const spanElement = document.createElement('span');
    containerDiv.appendChild(spanElement);
    const pdfContainerRef = { current: containerDiv };
    const mockFind = vi.fn();
    const mockSelection = {
      rangeCount: 1,
      removeAllRanges: vi.fn(),
      addRange: vi.fn(),
      getRangeAt: vi.fn().mockReturnValue({
        cloneRange: vi.fn().mockReturnValue({}),
        startContainer: {
          parentElement: spanElement,
        },
        getClientRects: vi.fn().mockReturnValue([{ top: 10, left: 10, width: 50, height: 20 }]),
      }),
    };
    Object.defineProperty(window, 'find', { value: mockFind, writable: true, configurable: true });
    Object.defineProperty(window, 'getSelection', { value: () => mockSelection, writable: true, configurable: true });
    document.createRange = vi.fn().mockReturnValue({
      selectNodeContents: vi.fn(),
      collapse: vi.fn(),
    }) as any;
    const { result } = renderHook(() =>
      usePdfSearch({
        pdfContainerRef,
        hiddenCitations: {},
        pdfUrl: null,
        highlightRects: [],
        setHighlightRects,
      }),
    );
    act(() => {
      result.current.handleSearch('alpha', true, true);
    });
    mockFind.mockReturnValueOnce(true);
    act(() => {
      result.current.handleSearch('alpha', true, false);
    });
    expect(mockFind).toHaveBeenCalled();
    expect(setHighlightRects).toHaveBeenCalled();
    expect(result.current.currentMatch).toBe(1);
    mockFind.mockReturnValueOnce(true);
    act(() => {
      result.current.handleSearch('alpha', true, false);
    });
    expect(result.current.currentMatch).toBe(2);
    mockFind.mockReturnValueOnce(true);
    act(() => {
      result.current.handleSearch('alpha', false, false);
    });
    expect(result.current.currentMatch).toBe(1);
    mockFind.mockReturnValueOnce(true);
    act(() => {
      result.current.handleSearch('alpha', false, false);
    });
    expect(result.current.currentMatch).toBe(2);
  });
  it('resets state when pdfUrl changes', () => {
    const { result, rerender } = renderHook(
      ({ pdfUrl }) =>
        usePdfSearch({
          pdfContainerRef: { current: null },
          hiddenCitations: {},
          pdfUrl,
          highlightRects: [],
          setHighlightRects: vi.fn(),
        }),
      { initialProps: { pdfUrl: 'initial-url' } },
    );
    act(() => {
      result.current.setSearchText('test');
      result.current.setIsSearchOpen(true);
    });
    expect(result.current.searchText).toBe('test');
    expect(result.current.isSearchOpen).toBe(true);
    rerender({ pdfUrl: 'new-url' });
    expect(result.current.searchText).toBe('');
    expect(result.current.isSearchOpen).toBe(false);
  });
});
