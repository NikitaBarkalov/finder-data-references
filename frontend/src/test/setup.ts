import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { createElement, useEffect, type ReactNode } from 'react';
import { afterEach, beforeAll, vi } from 'vitest';

vi.mock('react-pdf', () => {
  function Document({
    children,
  }: {
    children?: ReactNode;
  }) {
    return createElement('div', { 'data-testid': 'pdf-document' }, children);
  }

  function Page({
    pageNumber,
    onRenderTextLayerSuccess,
  }: {
    pageNumber: number;
    onRenderTextLayerSuccess?: () => void;
  }) {
    useEffect(() => {
      onRenderTextLayerSuccess?.();
    }, [onRenderTextLayerSuccess]);

    return createElement('div', { 'data-testid': `pdf-page-${pageNumber}` }, `page ${pageNumber}`);
  }

  return {
    Document,
    Page,
    pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
  };
});

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class MockEventSource {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal('EventSource', MockEventSource);
  vi.stubGlobal('alert', vi.fn());

  Object.defineProperty(window, 'find', {
    value: vi.fn().mockReturnValue(false),
    writable: true,
    configurable: true,
  });

  Object.defineProperty(window, 'scrollTo', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });

  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });

  Object.defineProperty(window.HTMLElement.prototype, 'scrollBy', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });

  Object.defineProperty(window.HTMLAnchorElement.prototype, 'click', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });

  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:mock-pdf'),
    writable: true,
    configurable: true,
  });

  Object.defineProperty(URL, 'revokeObjectURL', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });

  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      writable: true,
      configurable: true,
    });
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});
