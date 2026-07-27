import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
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

  const colorVar = badgeClass === 'primary' ? 'var(--primary-data)' : badgeClass === 'secondary' ? 'var(--secondary-data)' : 'var(--article)';
  const bgVar = badgeClass === 'primary' ? 'rgba(16, 185, 129, 0.15)' : badgeClass === 'secondary' ? 'rgba(14, 165, 233, 0.15)' : 'rgba(139, 92, 246, 0.15)';

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

function App() {
  const [dragActive, setDragActive] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<'idle' | 'loading' | 'success' | 'results'>('idle');
  const [results, setResults] = useState<ExtractionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [stepDetails, setStepDetails] = useState<Record<number, string>>({});
  const [numPages, setNumPages] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          setResults(data.result);
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
            <Document
              file={pdfUrl}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              loading={<div className="pdf-placeholder">Loading PDF...</div>}
              error={<div className="pdf-placeholder" style={{ color: '#ef4444' }}>Failed to load PDF.</div>}
            >
              {Array.from(new Array(numPages || 0), (_, index) => (
                <div key={`page_${index + 1}`} className="pdf-page-wrapper">
                  <Page
                    pageNumber={index + 1}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="pdf-page"
                  />
                </div>
              ))}
            </Document>
          </div>
        )}
      </div>

      {/* Right side: Content */}
      <div className="content-section">
        <header className="header">
          <div>
            <h1>Finder Data References</h1>
            <p>AI-powered Data Reference Extractor & Classificator</p>
          </div>
          {pipelineStatus === 'results' && results && (
            <button
              className="upload-another-btn"
              onClick={() => {
                setResults(null);
                setPdfUrl(null);
                setPipelineStatus('idle');
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>📄</span>
              Upload New PDF
            </button>
          )}
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
                <CategorySection title="PRIMARY DOI" citations={grouped.primaryDoi} badgeClass="primary" />
                <CategorySection title="SECONDARY DOI" citations={grouped.secondaryDoi} badgeClass="secondary" />
                <CategorySection title="PRIMARY ID" citations={grouped.primaryId} badgeClass="primary" />
                <CategorySection title="SECONDARY ID" citations={grouped.secondaryId} badgeClass="secondary" />
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
