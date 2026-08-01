import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import Mark from 'mark.js';
import type { ExtractionResponse } from '../types';
import { buildRobustRegex } from '../utils/regex';
import { getMarkClassAndTitle, markClassToHex } from '../utils/citations';

type UsePdfHighlightsArgs = {
  pdfContainerRef: RefObject<HTMLDivElement | null>;
  results: ExtractionResponse | null;
  numPages: number | null;
  visibleCategories: Record<string, boolean>;
  hiddenCitations: Record<string, boolean>;
  isCachedFile: boolean;
};

export function getCitationMatchGroups(citationText?: string) {
  const groups: Record<string, HTMLElement[][]> = {};
  const marks = Array.from(document.querySelectorAll('mark[data-citation]')) as HTMLElement[];

  marks.forEach(el => {
    const cit = el.getAttribute('data-citation');
    if (!cit) return;
    if (citationText && cit !== citationText) return;

    if (!groups[cit]) groups[cit] = [];

    const citGroups = groups[cit];
    let added = false;

    if (citGroups.length > 0) {
      const lastGroup = citGroups[citGroups.length - 1];
      const lastEl = lastGroup[lastGroup.length - 1];

      try {
        const range = document.createRange();
        range.setStartAfter(lastEl);
        range.setEndBefore(el);
        const textBetween = range.toString();
        const cleanTextBetween = textBetween.replace(/[\s\-‑–—_]/g, '').trim();

        let isVisuallyClose = true;
        if (cleanTextBetween === '') {
          const lastRect = lastEl.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const verticalDist = Math.abs(elRect.top - lastRect.top);
          const horizontalDist = elRect.left - lastRect.right;

          if (verticalDist < 10) {
            if (horizontalDist > 30) {
              isVisuallyClose = false;
            }
          } else if (verticalDist > 50) {
            isVisuallyClose = false;
          }
        }

        if (cleanTextBetween === '' && isVisuallyClose) {
          lastGroup.push(el);
          added = true;
        }
      } catch (e) {
        console.error('Range error when grouping marks:', e);
      }
    }

    if (!added) {
      citGroups.push([el]);
    }
  });

  return groups;
}

export function usePdfHighlights({
  pdfContainerRef,
  results,
  numPages,
  visibleCategories,
  hiddenCitations,
  isCachedFile,
}: UsePdfHighlightsArgs) {
  const [citationCounts, setCitationCounts] = useState<Record<string, number>>({});
  const highlightTimeoutRef = useRef<number | null>(null);
  const isMarkingRef = useRef(false);

  const applyHighlights = useCallback(() => {
    if (!pdfContainerRef.current || !results) {
      return;
    }
    if (isMarkingRef.current) return;
    isMarkingRef.current = true;
    const textLayers = Array.from(pdfContainerRef.current.querySelectorAll('.textLayer'));
    if (textLayers.length === 0) {
      isMarkingRef.current = false;
      return;
    }
    const instance = new Mark(textLayers as HTMLElement[]);
    instance.unmark({
      done: () => {
        results.citations.forEach(cit => {
          let regex: RegExp;
          const doiMatch = (cit.citation || '').match(/10\.[^\s?#]+/);

          if (doiMatch) {
            regex = buildRobustRegex(doiMatch[0], true);
          } else if ((cit.citation || '').startsWith('http')) {
            let cleanUrl = (cit.citation || '').replace(/^https?:\/\/(www\.)?/, '');
            cleanUrl = cleanUrl.split('?')[0].replace(/\/$/, '');
            regex = buildRobustRegex(cleanUrl);
          } else {
            const idPart = (cit.citation || '').replace(/^[a-zA-Z]+:\s*/, '');
            regex = buildRobustRegex(idPart);
          }

          const { className, title } = getMarkClassAndTitle(cit);

          instance.markRegExp(regex, {
            className,
            acrossElements: true,
            each: (element: Element) => {
              element.setAttribute('data-title', title);
              element.setAttribute('data-citation', cit.citation);
              const htmlEl = element as HTMLElement;
              htmlEl.style.cursor = 'pointer';
              htmlEl.style.pointerEvents = 'auto';

              const color = markClassToHex(className);
              htmlEl.style.setProperty('--tooltip-color', color);

              htmlEl.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                let url = cit.url || cit.citation;

                if (!url.startsWith('http') && (url.startsWith('10.') || url.includes('doi.org'))) {
                  if (!url.startsWith('http')) {
                    url = 'https://doi.org/' + url.replace(/^doi:/i, '');
                  }
                }
                if (url.startsWith('http')) {
                  window.open(url, '_blank');
                }
              };
            },
          });
        });

        setTimeout(() => {
          const newCounts: Record<string, number> = {};
          const groups = getCitationMatchGroups();
          const container = pdfContainerRef.current;
          if (container) {
            const containerRect = container.getBoundingClientRect();

            document.querySelectorAll('.static-pdf-overlay').forEach(el => el.remove());

            Object.keys(groups).forEach(cit => {
              newCounts[cit] = groups[cit].length;

              const citObj = results.citations.find(c => c.citation === cit);
              const title = citObj
                ? (citObj.category === 'Primary'
                  ? ((cit.startsWith('http') || cit.startsWith('10.')) ? 'Primary Dataset DOI' : 'Primary Dataset ID')
                  : citObj.category === 'Secondary'
                    ? ((cit.startsWith('http') || cit.startsWith('10.')) ? 'Secondary Dataset DOI' : 'Secondary Dataset ID')
                    : 'Article')
                : cit;

              groups[cit].forEach((matchElements, occurrenceIndex) => {
                const sortedEls = [...matchElements].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
                const lines: HTMLElement[][] = [];

                sortedEls.forEach(el => {
                  const rect = el.getBoundingClientRect();

                  if (lines.length > 0) {
                    const lastLine = lines[lines.length - 1];
                    const lastRect = lastLine[0].getBoundingClientRect();

                    const overlapTop = Math.max(rect.top, lastRect.top);
                    const overlapBottom = Math.min(rect.bottom, lastRect.bottom);
                    const overlapHeight = overlapBottom - overlapTop;
                    const minHeight = Math.min(rect.height, lastRect.height);

                    if (overlapHeight > minHeight * 0.2) {
                      lastLine.push(el);
                      return;
                    }
                  }
                  lines.push([el]);
                });

                lines.forEach(lineEls => {
                  const minLeft = Math.min(...lineEls.map(el => el.getBoundingClientRect().left));
                  const maxRight = Math.max(...lineEls.map(el => el.getBoundingClientRect().right));
                  const top = Math.min(...lineEls.map(el => el.getBoundingClientRect().top));
                  const bottom = Math.max(...lineEls.map(el => el.getBoundingClientRect().bottom));

                  const firstEl = lineEls[0] as HTMLElement;

                  const div = document.createElement('div');

                  div.className = `static-pdf-overlay ${firstEl.className.replace('mark.js', '').trim()}`;
                  div.style.position = 'absolute';
                  div.style.top = `${top - containerRect.top + container.scrollTop - 2}px`;
                  div.style.left = `${minLeft - containerRect.left + container.scrollLeft - 2}px`;
                  div.style.width = `${maxRight - minLeft + 4}px`;
                  div.style.height = `${bottom - top + 4}px`;
                  div.style.borderRadius = '3px';
                  div.style.zIndex = '5';
                  div.setAttribute('data-title', title);
                  div.setAttribute('data-citation', cit);
                  div.setAttribute('data-occurrence-index', occurrenceIndex.toString());

                  if (hiddenCitations[cit]) {
                    div.style.opacity = '0';
                    div.style.pointerEvents = 'none';
                  } else if (isCachedFile) {
                    div.style.background = 'transparent';
                    div.style.pointerEvents = 'auto';
                    div.style.cursor = 'pointer';
                  } else {
                    div.style.opacity = '1';
                    div.style.pointerEvents = 'auto';
                    div.style.cursor = 'pointer';
                  }
                  div.style.setProperty('--tooltip-color', firstEl.style.getPropertyValue('--tooltip-color'));
                  div.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    let url = cit;
                    const citObj2 = results.citations.find(c => c.citation === cit);
                    if (citObj2?.url) {
                      url = citObj2.url;
                    }
                    if (!url.startsWith('http') && (url.startsWith('10.') || url.includes('doi.org'))) {
                      if (!url.startsWith('http')) {
                        url = 'https://doi.org/' + url.replace(/^doi:/i, '');
                      }
                    }
                    if (url.startsWith('http')) {
                      window.open(url, '_blank');
                    }
                  };

                  container.appendChild(div);
                });
              });
            });
          }
          setCitationCounts(newCounts);
          isMarkingRef.current = false;
        }, 300);
      },
    });
  }, [pdfContainerRef, results, hiddenCitations, isCachedFile]);

  const applyHighlightsRef = useRef(applyHighlights);
  useEffect(() => {
    applyHighlightsRef.current = applyHighlights;
  });

  const debouncedApplyHighlights = useCallback(() => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => {
      applyHighlightsRef.current();
    }, 800);
  }, []);

  useEffect(() => {
    if (results && numPages) {
      debouncedApplyHighlights();
    }
  }, [results, numPages, visibleCategories, hiddenCitations, debouncedApplyHighlights]);

  return {
    citationCounts,
    debouncedApplyHighlights,
  };
}
