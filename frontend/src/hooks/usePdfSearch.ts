import React, { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import type { ActiveCitationSearch, HighlightRect } from '../types';
import { getCitationMatchGroups } from './usePdfHighlights';

type UsePdfSearchArgs = {
  pdfContainerRef: RefObject<HTMLDivElement | null>;
  hiddenCitations: Record<string, boolean>;
  pdfUrl: string | null;
  highlightRects: HighlightRect[];
  setHighlightRects: React.Dispatch<React.SetStateAction<HighlightRect[]>>;
};

export function usePdfSearch({
  pdfContainerRef,
  hiddenCitations,
  pdfUrl,
  highlightRects,
  setHighlightRects,
}: UsePdfSearchArgs) {
  const [searchText, setSearchText] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [activeCitationSearch, setActiveCitationSearch] = useState<ActiveCitationSearch>(null);
  const lastMatchRangeRef = useRef<Range | null>(null);

  useEffect(() => {
    document.querySelectorAll('.static-pdf-overlay').forEach(el => el.remove());
    setSearchText('');
    setIsSearchOpen(false);
    setMatchCount(0);
    setCurrentMatch(0);
    setActiveCitationSearch(null);
  }, [pdfUrl]);

  const handleFindCitation = useCallback((citationText: string) => {
    const groups = getCitationMatchGroups()[citationText] || [];

    if (groups.length === 0) {
      alert('Ця цитата не була знайдена в тексті PDF.');
      return;
    }

    let nextIndex = 0;
    if (activeCitationSearch?.text === citationText) {
      nextIndex = (activeCitationSearch.index + 1) % groups.length;
    }

    setActiveCitationSearch({ text: citationText, index: nextIndex });

    const groupElements = groups[nextIndex];
    const firstElement = groupElements[0];
    const container = document.querySelector('.custom-pdf-container');

    if (container) {
      const containerRect = container.getBoundingClientRect();
      const elementRect = firstElement.getBoundingClientRect();
      const offset = elementRect.top - containerRect.top - (containerRect.height / 2) + (elementRect.height / 2);

      container.scrollBy({
        top: offset,
        behavior: 'smooth',
      });

      document.querySelectorAll('.static-pdf-overlay.search-active').forEach(el => el.classList.remove('search-active'));

      const activeOverlays = document.querySelectorAll(
        `.static-pdf-overlay[data-citation="${citationText.replace(/"/g, '\\"')}"][data-occurrence-index="${nextIndex}"]`,
      ) as NodeListOf<HTMLElement>;
      activeOverlays.forEach(el => {
        el.classList.add('search-active');
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
      });

      setTimeout(() => {
        activeOverlays.forEach(el => {
          el.classList.remove('search-active');
          if (hiddenCitations[citationText]) {
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
          } else {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
          }
        });
      }, 2000);
    } else {
      firstElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeCitationSearch, hiddenCitations]);

  const handleSearch = useCallback((text: string, forward: boolean = true, isTyping: boolean = false) => {
    if (!text) {
      setMatchCount(0);
      setCurrentMatch(0);
      setHighlightRects([]);
      return;
    }
    const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
    const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
    const cursorStart = isInputFocused ? activeElement.selectionStart : null;
    const cursorEnd = isInputFocused ? activeElement.selectionEnd : null;

    if (isTyping && pdfContainerRef.current) {
      lastMatchRangeRef.current = null;
      setHighlightRects([]);
      setCurrentMatch(0);

      const content = pdfContainerRef.current.textContent || '';
      const regex = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = content.match(regex);
      const count = matches ? matches.length : 0;
      setMatchCount(count);

      return;
    }

    if (!lastMatchRangeRef.current && pdfContainerRef.current) {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(pdfContainerRef.current);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } else if (lastMatchRangeRef.current) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(lastMatchRangeRef.current);
      }
    }

    let found = (window as unknown as { find: (...args: unknown[]) => boolean }).find(
      text, false, !forward, true, false, false, false,
    );
    let selection = window.getSelection();

    let sanity = 100;
    while (found && selection && selection.rangeCount > 0 && sanity > 0) {
      const element = selection.getRangeAt(0).startContainer.parentElement;
      if (element && pdfContainerRef.current && !pdfContainerRef.current.contains(element)) {
        const range = document.createRange();
        range.selectNodeContents(pdfContainerRef.current);
        range.collapse(forward);
        selection.removeAllRanges();
        selection.addRange(range);

        found = (window as unknown as { find: (...args: unknown[]) => boolean }).find(
          text, false, !forward, true, false, false, false,
        );
        selection = window.getSelection();
        sanity--;
      } else {
        break;
      }
    }

    if (selection && selection.rangeCount > 0 && found) {
      const range = selection.getRangeAt(0);
      lastMatchRangeRef.current = range.cloneRange();

      const container = pdfContainerRef.current;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const rects = Array.from(range.getClientRects()).map(r => ({
          top: r.top - containerRect.top,
          left: r.left - containerRect.left,
          width: r.width,
          height: r.height,
        }));
        setHighlightRects(rects);
      }

      const element = range.startContainer.parentElement;
      if (element) {
        const scrollContainer = document.querySelector('.custom-pdf-container');
        if (scrollContainer) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          const offset = elementRect.top - containerRect.top - (containerRect.height / 2) + (elementRect.height / 2);

          scrollContainer.scrollBy({
            top: offset,
            behavior: 'smooth',
          });
        } else {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      selection.removeAllRanges();
    } else {
      setHighlightRects([]);
    }

    if (found && matchCount > 0) {
      setCurrentMatch(prev => {
        if (prev === 0) return forward ? 1 : matchCount;
        return forward
          ? (prev < matchCount ? prev + 1 : 1)
          : (prev > 1 ? prev - 1 : matchCount);
      });
    }

    if (isInputFocused && activeElement) {
      setTimeout(() => {
        activeElement.focus();
        if (cursorStart !== null && cursorEnd !== null) {
          activeElement.setSelectionRange(cursorStart, cursorEnd);
        }
      }, 0);
    }
  }, [pdfContainerRef, matchCount]);

  return {
    searchText,
    setSearchText,
    isSearchOpen,
    setIsSearchOpen,
    matchCount,
    currentMatch,
    highlightRects,
    setHighlightRects,
    activeCitationSearch,
    setActiveCitationSearch,
    handleFindCitation,
    handleSearch,
  };
}
