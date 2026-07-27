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
}

interface ExtractionResponse {
  authors: string;
  citations: Citation[];
}

const CategorySection = ({ title, citations, badgeClass }: { title: string, citations: Citation[], badgeClass: string }) => {
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
                    {cit.citation.startsWith('http') ? (
                      <a href={cit.citation} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)', textDecoration: 'none' }}
                        onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                      >
                        {cit.citation}
                      </a>
                    ) : (
                      cit.citation
                    )}
                  </span>
                  <span className={`badge ${badgeClass}`}>{cit.category}</span>
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
  // Split into characters first, then escape each character, then join with whitespace/hyphen allowers
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

  return new RegExp(coreRegexStr, 'gi');
};

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

  const applyHighlights = () => {
    if (!pdfContainerRef.current || !results) return;
    const instance = new Mark(pdfContainerRef.current);
    instance.unmark({
      done: () => {
        results.citations.forEach(cit => {
          let regex: RegExp;
          const doiMatch = cit.citation.match(/10\.[^\s?#]+/);
          
          if (doiMatch) {
            // It's a DOI! Extract just the core starting from 10. and pass isDoi=true to optionally match and highlight prefixes
            regex = buildRobustRegex(doiMatch[0], true);
          } else if (cit.citation.startsWith('http')) {
            // Non-DOI URL. Strip protocol to be safe, because PDF might not have it.
            let cleanUrl = cit.citation.replace(/^https?:\/\/(www\.)?/, '');
            cleanUrl = cleanUrl.split('?')[0].replace(/\/$/, '');
            regex = buildRobustRegex(cleanUrl);
          } else {
            // ID (e.g. PDB: 1XYZ)
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
              const htmlEl = element as HTMLElement;
              htmlEl.style.cursor = 'pointer'; // indicate clickable
              htmlEl.style.pointerEvents = 'auto'; // ensure it receives hover events
              
              // Set a CSS variable for the tooltip color based on the category
              let color = '#3b82f6'; // default blue (Article)
              if (className === 'mark-primary-doi') color = '#22c55e'; // Green
              else if (className === 'mark-secondary-doi') color = '#eab308'; // Yellow
              else if (className === 'mark-primary-id') color = '#06b6d4'; // Cyan
              else if (className === 'mark-secondary-id') color = '#ec4899'; // Pink
              htmlEl.style.setProperty('--tooltip-color', color);
              
              // Forward click directly since we block the underlying <a> tag
              htmlEl.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                let url = cit.citation;
                // If it looks like a DOI without http prefix
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
        });
      }
    });
  };

  const debouncedApplyHighlights = () => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => {
      applyHighlights();
    }, 300);
  };

  useEffect(() => {
    if (results && numPages) {
      debouncedApplyHighlights();
    }
  }, [results, numPages]);

  const [zoom, setZoom] = useState<number>(1);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [pdfWidth, setPdfWidth] = useState<number>(0);
  const [searchText, setSearchText] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [matchCount, setMatchCount] = useState<number>(0);
  const [currentMatch, setCurrentMatch] = useState<number>(0);
  const [highlightRects, setHighlightRects] = useState<{top: number, left: number, width: number, height: number}[]>([]);

  useEffect(() => {
    setHighlightRects([]);
  }, [zoom, pdfWidth]);

  const lastMatchRangeRef = useRef<Range | null>(null);

  const handleSearch = (text: string, forward: boolean = true, isTyping: boolean = false) => {
    if (!text) {
      setMatchCount(0);
      setCurrentMatch(0);
      setHighlightRects([]);
      return;
    }      const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
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
        
        return; // Exit early: do not freeze UI with synchronous DOM searches while typing
      }

      if (!lastMatchRangeRef.current && pdfContainerRef.current) {
        // Start from beginning of PDF container
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(pdfContainerRef.current);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } else if (lastMatchRangeRef.current) {
        // Restore previous match
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(lastMatchRangeRef.current);
        }
      }

      let found = (window as any).find(text, false, !forward, true, false, false, false);
      let selection = window.getSelection();

      // Prevent window.find from highlighting text outside the PDF container
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
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // Clean up object URL to prevent memory leaks
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
      const response = await fetch("http://localhost:8000/api/v1/extract", {
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

      // Open SSE connection
      const eventSource = new EventSource(`http://localhost:8000/api/v1/task/${task_id}/stream`);

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

  // Group citations
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
  }



  return (
    <div className="app-container">
      {/* Left side: PDF Viewer */}
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

      {/* Right side: Content */}
      <div className="content-section">
        <header className="header">
          <div>
            <h1>Finder Data References</h1>
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
              <h3>Welcome to Finder Data References</h3>
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
                <CategorySection title="PRIMARY DOI" citations={grouped.primaryDoi} badgeClass="primary-doi" />
                <CategorySection title="SECONDARY DOI" citations={grouped.secondaryDoi} badgeClass="secondary-doi" />
                <CategorySection title="PRIMARY ID" citations={grouped.primaryId} badgeClass="primary-id" />
                <CategorySection title="SECONDARY ID" citations={grouped.secondaryId} badgeClass="secondary-id" />
                <CategorySection title="ARTICLES" citations={grouped.articles} badgeClass="article" />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
