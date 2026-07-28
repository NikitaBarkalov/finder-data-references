import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import Mark from 'mark.js';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './index.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface Citation {
  citation: string;
  context: string;
  category: string;
  url?: string;
}

interface ExtractionResponse {
  authors: string;
  citations: Citation[];
}

const CategorySection = ({ title, citations, badgeClass, onSearch, activeSearch, counts, hiddenCitations, onToggleHide, isCategoryVisible }: { title: string, citations: Citation[], badgeClass: string, onSearch: (text: string) => void, activeSearch: { text: string, index: number } | null, counts: Record<string, number>, hiddenCitations: Record<string, boolean>, onToggleHide: (citText: string) => void, isCategoryVisible: boolean }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const getColor = (cls: string) => {
    if (cls === 'primary-doi') return '#22c55e';
    if (cls === 'primary-id') return '#06b6d4';
    if (cls === 'secondary-doi') return '#eab308';
    if (cls === 'secondary-id') return '#ec4899';
    if (cls === 'article') return '#3b82f6';
    return '#8b5cf6';
  };

  const getBg = (cls: string) => {
    if (cls === 'primary-doi') return 'rgba(34, 197, 94, 0.15)';
    if (cls === 'primary-id') return 'rgba(6, 182, 212, 0.15)';
    if (cls === 'secondary-doi') return 'rgba(234, 179, 8, 0.15)';
    if (cls === 'secondary-id') return 'rgba(236, 72, 153, 0.15)';
    if (cls === 'article') return 'rgba(59, 130, 246, 0.15)';
    return 'rgba(139, 92, 246, 0.15)';
  };

  const colorVar = getColor(badgeClass);
  const bgVar = getBg(badgeClass);

  return (
    <div style={{ marginBottom: '1rem', border: `1px solid ${bgVar}`, borderRadius: '12px', overflow: 'hidden', background: 'var(--surface-color)' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{ cursor: 'pointer', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: bgVar, transition: 'background 0.2s ease', userSelect: 'none' }}
      >
        <span style={{ fontWeight: 600, fontSize: '1.1rem', color: colorVar, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {title}
          <span style={{ background: colorVar, color: '#fff', fontSize: '0.8rem', padding: '0.1rem 0.6rem', borderRadius: '9999px', minWidth: '24px', textAlign: 'center' }}>
            {citations.length}
          </span>
        </span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease', color: colorVar, fontSize: '0.8em' }}>
          ▼
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.3s ease-in-out' }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ padding: citations.length > 0 ? '1.5rem' : '1rem 1.5rem' }}>
            {citations.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontStyle: 'italic' }}>No citations found.</p>
            ) : (
              citations.map((cit, idx) => (
                <div key={idx} className="card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: idx === citations.length - 1 ? 0 : '1rem' }}>
                  <span className="citation-id" style={{ wordBreak: 'break-all', paddingRight: '1rem' }}>
                    {cit.url || cit.citation.startsWith('http') ? (
                      <a href={cit.url || cit.citation} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)', textDecoration: 'none' }}
                        onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                      >
                        {cit.citation}
                      </a>
                    ) : (
                      cit.citation
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 'max-content' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleHide(cit.citation); }}
                      disabled={!isCategoryVisible}
                      title={hiddenCitations[cit.citation] ? "Show in PDF" : "Hide in PDF"}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: isCategoryVisible ? 'pointer' : 'not-allowed',
                        opacity: isCategoryVisible ? (hiddenCitations[cit.citation] ? 0.4 : 1) : 0.2,
                        fontSize: '1.2rem',
                        padding: '0.2rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'opacity 0.2s',
                        filter: hiddenCitations[cit.citation] ? 'grayscale(100%)' : 'none'
                      }}
                    >
                      {hiddenCitations[cit.citation] ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colorVar} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colorVar} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                    {(() => {
                      const total = counts[cit.citation] || 0;
                      if (total === 0) return null;

                      const isActive = activeSearch?.text === cit.citation;
                      const displayCount = isActive ? `${activeSearch.index + 1}/${total}` : `${total}`;

                      return (
                        <button
                          onClick={(e) => { e.stopPropagation(); onSearch(cit.citation); }}
                          title="Find in document"
                          style={{
                            background: isActive ? 'var(--accent-color)' : 'rgba(59, 130, 246, 0.1)',
                            border: isActive ? '1px solid var(--accent-color)' : '1px solid rgba(59, 130, 246, 0.3)',
                            color: isActive ? '#fff' : 'var(--accent-color)',
                            padding: '0.3rem 0.6rem',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseOver={(e) => {
                            if (!isActive) e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                          }}
                          onMouseOut={(e) => {
                            if (!isActive) e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                          {`Find (${displayCount})`}
                        </button>
                      );
                    })()}
                    <span className={`badge ${badgeClass}`}>{cit.category}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const PIPELINE_STEPS = [
  { id: 'extract', label: 'Reading PDF & Extracting Authors' },
  { id: 'raw', label: 'Extracting Raw References' },
  { id: 'dedup', label: 'Deduplication & Clustering' },
  { id: 'verify', label: 'LLM Verification' },
  { id: 'classify', label: 'LLM Classification' },
  { id: 'format', label: 'Formatting Results' }
];

const buildRobustRegex = (text: string, isDoi: boolean = false) => {
  const escapedCharacters = text.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const coreRegexStr = escapedCharacters.join('[\\s-]*');

  if (isDoi) {
    const prefixes = [
      "https://doi.org/",
      "http://doi.org/",
      "https://dx.doi.org/",
      "http://dx.doi.org/",
      "doi.org/",
      "doi:",
      "doi"
    ];
    const mapped = prefixes.map(prefix => {
      return prefix.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s-]*');
    });
    const prefixRegexStr = '(?:(?:' + mapped.join(')|(?:') + '))?[\\s-]*';
    return new RegExp(prefixRegexStr + coreRegexStr, 'gi');
  }

};

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  const [dragActive, setDragActive] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<'idle' | 'loading' | 'success' | 'results'>('idle');
  const [results, setResults] = useState<ExtractionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [stepDetails, setStepDetails] = useState<Record<number, string>>({});
  const [numPages, setNumPages] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const highlightTimeoutRef = useRef<number | null>(null);

  const [visibleCategories, setVisibleCategories] = useState<Record<string, boolean>>({
    'PRIMARY DOI': true,
    'SECONDARY DOI': true,
    'PRIMARY ID': true,
    'SECONDARY ID': true,
    'ARTICLE': true
  });

  const [hiddenCitations, setHiddenCitations] = useState<Record<string, boolean>>({});
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{current: number, total: number} | null>(null);

  const handleDownloadAnnotatedPdf = async () => {
    if (!pdfUrl || !results || !pdfFilename) return;
    setIsDownloadingPdf(true);

    try {
      const response = await fetch(pdfUrl);
      const blob = await response.blob();

      const citationsToHighlight = results.citations
        .filter(cit => {
          if (hiddenCitations[cit.citation]) return false;
          const isHttp = cit.citation.startsWith('http');
          let catKey = 'ARTICLE';
          if (cit.category === 'Primary') catKey = isHttp ? 'PRIMARY DOI' : 'PRIMARY ID';
          else if (cit.category === 'Secondary') catKey = isHttp ? 'SECONDARY DOI' : 'SECONDARY ID';

          if (visibleCategories[catKey] === false) return false;
          return true;
        })
        .map(cit => {
          const isHttp = cit.citation.startsWith('http');
          let className = 'mark-article';
          let title = 'Article';
          if (cit.category === 'Primary') {
            className = isHttp ? 'mark-primary-doi' : 'mark-primary-id';
            title = isHttp ? 'Primary Dataset DOI' : 'Primary Dataset ID';
          } else if (cit.category === 'Secondary') {
            className = isHttp ? 'mark-secondary-doi' : 'mark-secondary-id';
            title = isHttp ? 'Secondary Dataset DOI' : 'Secondary Dataset ID';
          }

          let hexColor = '#3b82f6';
          if (className === 'mark-primary-doi') hexColor = '#22c55e';
          else if (className === 'mark-secondary-doi') hexColor = '#eab308';
          else if (className === 'mark-primary-id') hexColor = '#06b6d4';
          else if (className === 'mark-secondary-id') hexColor = '#ec4899';

          const r = parseInt(hexColor.slice(1, 3), 16) / 255;
          const g = parseInt(hexColor.slice(3, 5), 16) / 255;
          const b = parseInt(hexColor.slice(5, 7), 16) / 255;

          return {
            text: cit.citation,
            url: cit.url || '',
            color: [r, g, b],
            title: title
          };
        });

      setDownloadProgress({ current: 0, total: citationsToHighlight.length });

      const formData = new FormData();
      formData.append('file', blob, pdfFilename);
      formData.append('citations', JSON.stringify(citationsToHighlight));

      const uploadRes = await fetch(`${API_BASE_URL}/api/v1/annotate-pdf`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Failed to start download task');

      const { task_id } = await uploadRes.json();
      const eventSource = new EventSource(`${API_BASE_URL}/api/v1/task/${task_id}/stream`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "progress" && data.total) {
          setDownloadProgress({ current: data.current, total: data.total });
        } else if (data.type === "complete") {
          eventSource.close();
          const fileId = data.result.file_id;

          const a = document.createElement('a');
          a.href = `${API_BASE_URL}/api/v1/download-annotated/${fileId}`;
          a.download = `annotated_${pdfFilename}`;
          document.body.appendChild(a);
          a.click();
          a.remove();

          setIsDownloadingPdf(false);
          setDownloadProgress(null);
        } else if (data.type === "error") {
          eventSource.close();
          alert("Error: " + data.message);
          setIsDownloadingPdf(false);
          setDownloadProgress(null);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        alert("Connection lost during PDF annotation.");
        setIsDownloadingPdf(false);
        setDownloadProgress(null);
      };
    } catch (error) {
      console.error(error);
      alert('Failed to download annotated PDF.');
      setIsDownloadingPdf(false);
      setDownloadProgress(null);
    }
  };

  const applyHighlights = () => {
    if (!pdfContainerRef.current || !results) {
      return;
    }
    const instance = new Mark(pdfContainerRef.current);
    instance.unmark({
      done: () => {
        results.citations.forEach(cit => {
          let regex: RegExp;
          const doiMatch = cit.citation.match(/10\.[^\s?#]+/);

          if (doiMatch) {
            regex = buildRobustRegex(doiMatch[0], true);
          } else if (cit.citation.startsWith('http')) {

            let cleanUrl = cit.citation.replace(/^https?:\/\/(www\.)?/, '');
            cleanUrl = cleanUrl.split('?')[0].replace(/\/$/, '');
            regex = buildRobustRegex(cleanUrl);
          } else {

            const idPart = cit.citation.replace(/^[a-zA-Z]+:\s*/, '');
            regex = buildRobustRegex(idPart);
          }

          let className = 'mark-secondary-id';
          let title = 'Secondary Dataset ID';
          const isHttp = cit.citation.startsWith('http');

          if (cit.category === 'Primary') {
            className = isHttp ? 'mark-primary-doi' : 'mark-primary-id';
            title = isHttp ? 'Primary Dataset DOI' : 'Primary Dataset ID';
          } else if (cit.category === 'Secondary') {
            className = isHttp ? 'mark-secondary-doi' : 'mark-secondary-id';
            title = isHttp ? 'Secondary Dataset DOI' : 'Secondary Dataset ID';
          } else if (cit.category === 'Article') {
            className = 'mark-article';
            title = 'Article';
          }

          instance.markRegExp(regex, {
            className,
            acrossElements: true,
            each: (element: Element) => {
              element.setAttribute('data-title', title);
              element.setAttribute('data-citation', cit.citation);
              const htmlEl = element as HTMLElement;
              htmlEl.style.cursor = 'pointer'; 
              htmlEl.style.pointerEvents = 'auto'; 

              let color = '#3b82f6'; 
              if (className === 'mark-primary-doi') color = '#22c55e'; 
              else if (className === 'mark-secondary-doi') color = '#eab308'; 
              else if (className === 'mark-primary-id') color = '#06b6d4'; 
              else if (className === 'mark-secondary-id') color = '#ec4899'; 
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
            }
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

                groups[cit].forEach(matchElements => {
                  const lines: Record<number, HTMLElement[]> = {};
                  matchElements.forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const lineTop = Math.round(rect.top / 10) * 10;
                    if (!lines[lineTop]) lines[lineTop] = [];
                    lines[lineTop].push(el);
                  });

                  Object.values(lines).forEach(lineEls => {
                    const minLeft = Math.min(...lineEls.map(el => el.getBoundingClientRect().left));
                    const maxRight = Math.max(...lineEls.map(el => el.getBoundingClientRect().right));
                    const top = Math.min(...lineEls.map(el => el.getBoundingClientRect().top));
                    const bottom = Math.max(...lineEls.map(el => el.getBoundingClientRect().bottom));

                    const firstEl = lineEls[0] as HTMLElement;

                    const classString = firstEl.className;
                    const keyMap: Record<string, string> = {
                      'mark-primary-doi': 'PRIMARY DOI',
                      'mark-secondary-doi': 'SECONDARY DOI',
                      'mark-primary-id': 'PRIMARY ID',
                      'mark-secondary-id': 'SECONDARY ID',
                      'mark-article': 'ARTICLE'
                    };
                    const categoryCls = Object.keys(keyMap).find(cls => classString.includes(cls));
                    if (categoryCls && !visibleCategories[keyMap[categoryCls]]) {
                      return; 
                    }
                    if (hiddenCitations[cit]) {
                      return; 
                    }

                    const div = document.createElement('div');

                    div.className = `static-pdf-overlay ${firstEl.className.replace('mark.js', '').trim()}`;
                    div.style.position = 'absolute';
                    div.style.top = `${top - containerRect.top + container.scrollTop - 2}px`;
                    div.style.left = `${minLeft - containerRect.left + container.scrollLeft - 2}px`;
                    div.style.width = `${maxRight - minLeft + 4}px`;
                    div.style.height = `${bottom - top + 4}px`;
                    div.style.borderRadius = '3px';
                    div.style.zIndex = '5';

                    div.setAttribute('data-title', firstEl.getAttribute('data-title') || '');
                    div.style.setProperty('--tooltip-color', firstEl.style.getPropertyValue('--tooltip-color'));
                    div.onclick = (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      let url = cit;
                      const citObj = results.citations.find(c => c.citation === cit);
                      if (citObj?.url) {
                        url = citObj.url;
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
          }, 100);
        });
      }
    });
  };

  const getCitationMatchGroups = (citationText?: string) => {
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

          if (cleanTextBetween === '') {
            lastGroup.push(el);
            added = true;
          }
        } catch (e) {
          console.error("Range error when grouping marks:", e);
        }
      }

      if (!added) {
        citGroups.push([el]);
      }
    });

    return groups;
  };

  const debouncedApplyHighlights = () => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => {
      applyHighlights();
    }, 100);
  };

  useEffect(() => {
    if (results && numPages) {
      debouncedApplyHighlights();
    }
  }, [results, numPages, visibleCategories, hiddenCitations]);

  const [zoom, setZoom] = useState<number>(1);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [pdfWidth, setPdfWidth] = useState<number>(0);
  const [citationCounts, setCitationCounts] = useState<Record<string, number>>({});
  const [searchText, setSearchText] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [matchCount, setMatchCount] = useState<number>(0);
  const [currentMatch, setCurrentMatch] = useState<number>(0);
  const [highlightRects, setHighlightRects] = useState<{ top: number, left: number, width: number, height: number }[]>([]);

  useEffect(() => {
    setHighlightRects([]);
  }, [zoom, pdfWidth]);

  const lastMatchRangeRef = useRef<Range | null>(null);

  const [activeCitationSearch, setActiveCitationSearch] = useState<{ text: string, index: number } | null>(null);

  const handleFindCitation = (citationText: string) => {
    const groups = getCitationMatchGroups(citationText)[citationText] || [];

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
        behavior: 'smooth'
      });

      document.querySelectorAll('.find-highlight-overlay').forEach(el => el.remove());

      const lines: Record<number, HTMLElement[]> = {};
      groupElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const lineTop = Math.round(rect.top / 10) * 10;
        if (!lines[lineTop]) lines[lineTop] = [];
        lines[lineTop].push(el);
      });

      Object.values(lines).forEach(lineEls => {
        const minLeft = Math.min(...lineEls.map(el => el.getBoundingClientRect().left));
        const maxRight = Math.max(...lineEls.map(el => el.getBoundingClientRect().right));
        const top = Math.min(...lineEls.map(el => el.getBoundingClientRect().top));
        const bottom = Math.max(...lineEls.map(el => el.getBoundingClientRect().bottom));

        const div = document.createElement('div');
        div.className = 'find-highlight-overlay';
        div.style.position = 'absolute';
        div.style.top = `${top - containerRect.top + container.scrollTop - 4}px`;
        div.style.left = `${minLeft - containerRect.left + container.scrollLeft - 4}px`;
        div.style.width = `${maxRight - minLeft + 8}px`;
        div.style.height = `${bottom - top + 8}px`;
        div.style.backgroundColor = 'rgba(234, 179, 8, 0.4)';
        div.style.border = '2px solid rgba(234, 179, 8, 0.8)';
        div.style.borderRadius = '4px';
        div.style.pointerEvents = 'none';
        div.style.zIndex = '10';
        container.appendChild(div);

        setTimeout(() => {
          div.style.opacity = '0';
          div.style.transition = 'opacity 0.5s ease';
          setTimeout(() => div.remove(), 500);
        }, 2000);
      });
    } else {
      firstElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleSearch = (text: string, forward: boolean = true, isTyping: boolean = false) => {
    if (!text) {
      setMatchCount(0);
      setCurrentMatch(0);
      setHighlightRects([]);
      return;
    } const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
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

    let found = (window as any).find(text, false, !forward, true, false, false, false);
    let selection = window.getSelection();

    let sanity = 100;
    while (found && selection && selection.rangeCount > 0 && sanity > 0) {
      let element = selection.getRangeAt(0).startContainer.parentElement;
      if (element && pdfContainerRef.current && !pdfContainerRef.current.contains(element)) {
        const range = document.createRange();
        range.selectNodeContents(pdfContainerRef.current);
        range.collapse(forward);
        selection.removeAllRanges();
        selection.addRange(range);

        found = (window as any).find(text, false, !forward, true, false, false, false);
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
          height: r.height
        }));
        setHighlightRects(rects);
      }

      const element = range.startContainer.parentElement;
      if (element) {
        const container = document.querySelector('.custom-pdf-container');
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          const offset = elementRect.top - containerRect.top - (containerRect.height / 2) + (elementRect.height / 2);

          container.scrollBy({
            top: offset,
            behavior: 'smooth'
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
  };

  useEffect(() => {
    if (!pdfContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setPdfWidth(entries[0].contentRect.width - 64);
    });
    observer.observe(pdfContainerRef.current);
    return () => observer.disconnect();
  }, [pdfUrl]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (pipelineStatus === 'success') {
      timer = setTimeout(() => {
        setPipelineStatus('results');
      }, 1500);
    }
    return () => clearTimeout(timer);
  }, [pipelineStatus]);

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
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

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const processFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      setError("Please upload a valid PDF file.");
      return;
    }

    setPdfUrl(URL.createObjectURL(file));
    setPdfFilename(file.name);
    setPipelineStatus('loading');
    setActiveStepIndex(0);
    setStepDetails({});
    setError(null);
    setResults(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/extract`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = errText;
        try { errMsg = JSON.parse(errText).detail || errText; } catch { }
        throw new Error(`API returned ${response.status}: ${errMsg}`);
      }

      const { task_id } = await response.json();

      const eventSource = new EventSource(`${API_BASE_URL}/api/v1/task/${task_id}/stream`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "progress") {
          const msgStr = data.message;
          const msg = msgStr.toLowerCase();

          if (msg.includes("extracting dois")) {
            setActiveStepIndex(1);
          } else if (msg.includes("raw citations before deduplication")) {
            setActiveStepIndex(1);
            const match = msgStr.match(/Found (\d+) raw citations/);
            if (match) {
              setStepDetails(prev => ({ ...prev, 1: `${match[1]} raw references found` }));
            }
          } else if (msg.includes("after deduplication")) {
            setActiveStepIndex(2);
            const match = msgStr.match(/After deduplication:\s*(.*)/);
            if (match) {
              setStepDetails(prev => ({ ...prev, 2: match[1] }));
            }
          } else if (msg.includes("clustering")) {
            setActiveStepIndex(2);
          } else if (msg.includes("verifying")) {
            setActiveStepIndex(3);
          } else if (msg.includes("successfully verified")) {
            setActiveStepIndex(3);
            const match = msgStr.match(/Successfully verified (\d+) IDs/);
            if (match) {
              setStepDetails(prev => ({ ...prev, 3: `${match[1]} IDs passed verification` }));
            }
          } else if (msg.includes("classifying verified") || msg.includes("sending")) {
            setActiveStepIndex(4);
          } else if (msg.includes("classified as 'dataset'")) {
            setActiveStepIndex(4);
            const match = msgStr.match(/(\d+ out of \d+.*)/);
            if (match) {
              setStepDetails(prev => {
                const existing = prev[4] ? prev[4] + '\n' : '';
                return { ...prev, 4: existing + match[1] };
              });
            }
          } else if (msg.includes("identified") && msg.includes("prefix filter")) {
            setActiveStepIndex(4);
            const match = msgStr.match(/Identified (\d+) DOIs as Articles/);
            if (match) {
              setStepDetails(prev => {
                const existing = prev[4] ? prev[4] + '\n' : '';
                return { ...prev, 4: existing + `${match[1]} articles found by prefix` };
              });
            }
          } else if (msg.includes("formatting results") || msg.includes("processing complete")) {
            setActiveStepIndex(5);
          }
        } else if (data.type === "complete") {
          const resultData = data.result;
          if (file.name.startsWith('10.')) {
            const selfDoi = file.name.replace(/\.pdf$/i, '').replace(/_/g, '/');
            if (resultData && resultData.citations) {
              resultData.citations = resultData.citations.filter((cit: Citation) => !cit.citation.includes(selfDoi));
            }
          }
          setResults(resultData);
          setPipelineStatus('success');
          setActiveStepIndex(PIPELINE_STEPS.length);
          eventSource.close();
        } else if (data.type === "error") {
          setError(data.message);
          setPipelineStatus('idle');
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setError("Connection to server lost.");
        setPipelineStatus('idle');
        eventSource.close();
      };

    } catch (err: any) {
      setError(err.message || "Failed to process PDF.");
      setPipelineStatus('idle');
    }
  };

  const grouped = {
    primaryDoi: [] as Citation[],
    secondaryDoi: [] as Citation[],
    primaryId: [] as Citation[],
    secondaryId: [] as Citation[],
    articles: [] as Citation[]
  };

  if (results) {
    results.citations.forEach(cit => {
      const isHttp = cit.citation.startsWith('http');
      const cat = cit.category;

      if (cat === 'Article') {
        grouped.articles.push(cit);
      } else if (cat === 'Primary') {
        if (isHttp) grouped.primaryDoi.push(cit);
        else grouped.primaryId.push(cit);
      } else if (cat === 'Secondary') {
        if (isHttp) grouped.secondaryDoi.push(cit);
        else grouped.secondaryId.push(cit);
      }
    });

    const sortFn = (a: Citation, b: Citation) => a.citation.localeCompare(b.citation);
    grouped.primaryDoi.sort(sortFn);
    grouped.secondaryDoi.sort(sortFn);
    grouped.primaryId.sort(sortFn);
    grouped.secondaryId.sort(sortFn);
    grouped.articles.sort(sortFn);
  }

  return (
    <div className="app-container">
      {}
      <div className="pdf-viewer-section">
        {!pdfUrl ? (
          <div
            className={`upload-container ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={onButtonClick}
            style={{ width: '80%', maxWidth: '500px' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple={false}
              onChange={handleChange}
              style={{ display: 'none' }}
            />
            <span className="upload-icon">📄</span>
            <div className="upload-text">Drag & drop a scientific article PDF here</div>
            <div className="upload-subtext">or click to browse</div>
            {error && <div style={{ color: '#ef4444', marginTop: '1rem' }}>{error}</div>}
          </div>
        ) : (
          <div className="custom-pdf-container">
            <div className="pdf-toolbar">
              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}>-</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(3, z + 0.2))}>+</button>
              <button onClick={() => setZoom(1)}>Fit</button>
              <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.2)', margin: '0 0.5rem' }} />
              <button
                onClick={() => {
                  setIsSearchOpen(!isSearchOpen);
                  if (isSearchOpen) {
                    setSearchText('');
                    handleSearch('', true, true);
                  }
                }}
                title={isSearchOpen ? "Close search" : "Open search"}
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                {isSearchOpen ? '✖ Close' : '🔍 Search'}
              </button>
              {isSearchOpen && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Search in PDF..."
                      value={searchText}
                      onChange={(e) => {
                        setSearchText(e.target.value);
                        handleSearch(e.target.value, true, true);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchText, true)}
                      className="pdf-search-input"
                      style={{ paddingRight: searchText ? '24px' : undefined }}
                      autoFocus
                    />
                    {searchText && (
                      <button
                        onClick={() => {
                          setSearchText('');
                          handleSearch('', true, true);
                        }}
                        title="Clear search"
                        style={{ position: 'absolute', right: '4px', padding: '0 4px', border: 'none', background: 'transparent', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}
                      >
                        ✖
                      </button>
                    )}
                  </div>
                  {matchCount > 0 && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', minWidth: '40px' }}>
                      {currentMatch} of {matchCount}
                    </span>
                  )}
                  <button onClick={() => handleSearch(searchText, false)} title="Previous match" style={{ padding: '0.25rem 0.5rem' }}>↑</button>
                  <button onClick={() => handleSearch(searchText, true)} title="Next match" style={{ padding: '0.25rem 0.5rem' }}>↓</button>
                </div>
              )}
              <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.2)', margin: '0 0.5rem' }} />
              <button
                className="upload-another-btn"
                style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem' }}
                onClick={() => {
                  setResults(null);
                  setPdfUrl(null);
                  setPdfFilename(null);
                  setPipelineStatus('idle');
                }}
              >
                <span style={{ fontSize: '1rem' }}>📄</span>
                Upload New PDF
              </button>
            </div>
            <div ref={pdfContainerRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <Document
                file={pdfUrl}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                loading={<div className="pdf-placeholder">Loading PDF...</div>}
                error={<div className="pdf-placeholder" style={{ color: '#ef4444' }}>Failed to load PDF.</div>}
                externalLinkTarget="_blank"
              >
                {Array.from(new Array(numPages || 0), (_, index) => (
                  <div key={`page_${index + 1}`} className="pdf-page-wrapper">
                    <Page
                      pageNumber={index + 1}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className="pdf-page"
                      width={pdfWidth ? pdfWidth * zoom : undefined}
                      onRenderSuccess={debouncedApplyHighlights}
                    />
                  </div>
                ))}
              </Document>
              {highlightRects.map((rect, i) => (
                <div
                  key={`highlight_${i}`}
                  style={{
                    position: 'absolute',
                    top: rect.top - 2.5,
                    left: rect.left - 2.5,
                    width: rect.width + 5,
                    height: rect.height + 5,
                    border: '2.5px solid #ef4444',
                    boxShadow: '0 0 6px rgba(239, 68, 68, 0.5)',
                    borderRadius: '3px',
                    pointerEvents: 'none',
                    zIndex: 10,
                    boxSizing: 'border-box'
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {}
      <div className="content-section">
        <header className="header" style={{ gap: '2rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 auto', minWidth: '350px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.5rem' }}>
              <h1 style={{ marginBottom: 0 }}>Finder of Data References</h1>

              {pipelineStatus === 'results' && results && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', position: 'relative' }}>
                  <button 
                    onClick={handleDownloadAnnotatedPdf} 
                    disabled={isDownloadingPdf}
                    style={{
                      minWidth: '140px',
                      justifyContent: 'center',
                      padding: '0.4rem 0.8rem',
                      background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isDownloadingPdf ? 'wait' : 'pointer',
                      opacity: isDownloadingPdf ? 0.8 : 1,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      boxShadow: '0 2px 8px rgba(139, 92, 246, 0.2)',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseOver={(e) => {
                      if (!isDownloadingPdf) {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isDownloadingPdf) {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(139, 92, 246, 0.2)';
                      }
                    }}
                  >
                    {isDownloadingPdf ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                        <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    )}
                    {isDownloadingPdf ? 'Generating...' : 'Download PDF'}
                  </button>
                  {downloadProgress && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 500, opacity: 0.8, whiteSpace: 'nowrap' }}>
                      Annotating {downloadProgress.current} of {downloadProgress.total} references...
                    </div>
                  )}
                </div>
              )}
            </div>
            <p>AI-powered Data Reference Extractor & Classificator</p>
            {pdfFilename && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.95rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Source Article: </span>
                {pdfFilename.startsWith('10.') ? (
                  <a
                    href={`https://doi.org/${pdfFilename.replace(/\.pdf$/i, '').replace(/_/g, '/')}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent-color)', textDecoration: 'none', fontWeight: 500 }}
                    title="Open article in new tab"
                  >
                    https://doi.org/{pdfFilename.replace(/\.pdf$/i, '').replace(/_/g, '/')}
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {pdfFilename}
                  </span>
                )}
              </div>
            )}

            {pipelineStatus === 'results' && results && (
              <div className="visibility-toggles" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: '1rem', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '0.1rem' }}>HIGHLIGHT IN PDF:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'flex-start' }}>
                  {Object.keys(visibleCategories).map(cat => (
                    <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', background: visibleCategories[cat] ? 'var(--bg-secondary)' : 'transparent', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', transition: 'all 0.2s', opacity: visibleCategories[cat] ? 1 : 0.6 }}>
                      <input
                        type="checkbox"
                        checked={visibleCategories[cat]}
                        onChange={(e) => setVisibleCategories(prev => ({ ...prev, [cat]: e.target.checked }))}
                        style={{ cursor: 'pointer', margin: 0 }}
                      />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {pipelineStatus === 'idle' && !pdfUrl && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flexGrow: 1,
              color: 'var(--text-secondary)'
            }}>
              <h3>Welcome to Finder of Data References</h3>
              <p style={{ marginTop: '1rem', textAlign: 'center', maxWidth: '400px' }}>
                Upload a PDF file on the left to begin the automated citation extraction and classification process.
              </p>
            </div>
          )}

          {(pipelineStatus === 'loading' || pipelineStatus === 'success') && (
            <div className="stepper-container">
              {PIPELINE_STEPS.map((step, index) => {
                const isCompleted = pipelineStatus === 'success' || index < activeStepIndex;
                const isActive = pipelineStatus === 'loading' && index === activeStepIndex;

                let stepStatusClass = 'pending';
                if (isCompleted) stepStatusClass = 'completed';
                if (isActive) stepStatusClass = 'active';

                return (
                  <div key={step.id} className={`step-item ${stepStatusClass}`}>
                    <div className={`step-icon ${stepStatusClass}`}>
                      {isCompleted ? '✓' : index + 1}
                    </div>
                    <div className="step-content-col">
                      <div className={`step-label ${stepStatusClass}`}>
                        {step.label}
                      </div>
                      {stepDetails[index] && (
                        <div className={`step-detail ${stepStatusClass}`}>
                          {stepDetails[index].split('\n').map((line, i) => <div key={i}>{line}</div>)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pipelineStatus === 'results' && results && (
            <div className="results-container results-entrance">
              <div className="categories-wrapper">
                <CategorySection title="PRIMARY DOI" citations={grouped.primaryDoi} badgeClass="primary-doi" onSearch={handleFindCitation} activeSearch={activeCitationSearch} counts={citationCounts} hiddenCitations={hiddenCitations} onToggleHide={(cit) => setHiddenCitations(prev => ({ ...prev, [cit]: !prev[cit] }))} isCategoryVisible={visibleCategories['PRIMARY DOI']} />
                <CategorySection title="SECONDARY DOI" citations={grouped.secondaryDoi} badgeClass="secondary-doi" onSearch={handleFindCitation} activeSearch={activeCitationSearch} counts={citationCounts} hiddenCitations={hiddenCitations} onToggleHide={(cit) => setHiddenCitations(prev => ({ ...prev, [cit]: !prev[cit] }))} isCategoryVisible={visibleCategories['SECONDARY DOI']} />
                <CategorySection title="PRIMARY ID" citations={grouped.primaryId} badgeClass="primary-id" onSearch={handleFindCitation} activeSearch={activeCitationSearch} counts={citationCounts} hiddenCitations={hiddenCitations} onToggleHide={(cit) => setHiddenCitations(prev => ({ ...prev, [cit]: !prev[cit] }))} isCategoryVisible={visibleCategories['PRIMARY ID']} />
                <CategorySection title="SECONDARY ID" citations={grouped.secondaryId} badgeClass="secondary-id" onSearch={handleFindCitation} activeSearch={activeCitationSearch} counts={citationCounts} hiddenCitations={hiddenCitations} onToggleHide={(cit) => setHiddenCitations(prev => ({ ...prev, [cit]: !prev[cit] }))} isCategoryVisible={visibleCategories['SECONDARY ID']} />
                <CategorySection title="ARTICLES" citations={grouped.articles} badgeClass="article" onSearch={handleFindCitation} activeSearch={activeCitationSearch} counts={citationCounts} hiddenCitations={hiddenCitations} onToggleHide={(cit) => setHiddenCitations(prev => ({ ...prev, [cit]: !prev[cit] }))} isCategoryVisible={visibleCategories['ARTICLE']} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
