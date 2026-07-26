import React, { useState, useRef } from 'react';
import './index.css';

interface Citation {
  citation: string;
  context: string;
  category: string;
}

interface ExtractionResponse {
  authors: string;
  citations: Citation[];
}

function App() {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ExtractionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    setLoading(true);
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
        throw new Error(`API returned ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      setResults(data);
    } catch (err: any) {
      setError(err.message || "Failed to process PDF.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Make Data Count</h1>
        <p>AI-powered Data Reference Extraction & Classification</p>
      </header>

      <main>
        {!results && !loading && (
          <div 
            className={`upload-container ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={onButtonClick}
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
            {error && <div style={{color: '#ef4444', marginTop: '1rem'}}>{error}</div>}
          </div>
        )}

        {loading && (
          <div style={{textAlign: 'center'}}>
            <div className="loader"></div>
            <p style={{color: 'var(--text-secondary)'}}>Extracting and analyzing citations via LLM...</p>
          </div>
        )}

        {results && !loading && (
          <div className="results-container">
            <div className="results-header">
              <h2>Extracted References</h2>
              <p style={{color: 'var(--text-secondary)', marginTop: '0.5rem'}}>
                Authors: {results.authors}
              </p>
              <button 
                onClick={() => setResults(null)}
                style={{
                  marginTop: '1rem',
                  background: 'var(--surface-color)', 
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Upload another PDF
              </button>
            </div>
            
            {results.citations.length === 0 ? (
              <p>No citations found.</p>
            ) : (
              results.citations.map((cit, idx) => (
                <div key={idx} className="card">
                  <div className="card-header">
                    <span className="citation-id">{cit.citation}</span>
                    <span className={`badge ${cit.category.toLowerCase()}`}>
                      {cit.category}
                    </span>
                  </div>
                  <div className="context-block">
                    {cit.context.split(';\\n').map((ctx, i) => (
                      <div key={i} style={{marginBottom: '0.5rem'}}>{ctx}</div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
