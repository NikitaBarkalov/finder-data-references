import { useState, useRef } from 'react';
import type { Citation, ActiveCitationSearch } from '../types';
import { getBadgeColor, getBadgeBg } from '../utils/citations';
type CategorySectionProps = {
  title: string;
  citations: Citation[];
  badgeClass: string;
  onSearch: (text: string) => void;
  activeSearch: ActiveCitationSearch;
  counts: Record<string, number>;
  hiddenCitations: Record<string, boolean>;
  onToggleHide: (citText: string) => void;
  isCachedFile?: boolean;
};
export function CategorySection({
  title,
  citations,
  badgeClass,
  onSearch,
  activeSearch,
  counts,
  hiddenCitations,
  onToggleHide,
  isCachedFile,
}: CategorySectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [savedOffset, setSavedOffset] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const isRestoringRef = useRef(false);
  const handleToggle = () => {
    const mainContainer = containerRef.current?.closest('main');
    if (mainContainer && containerRef.current && headerRef.current) {
      if (isOpen) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const mainRect = mainContainer.getBoundingClientRect();
        if (containerRect.top < mainRect.top) {
          setSavedOffset(mainRect.top - containerRect.top);
          setTimeout(() => {
            headerRef.current?.scrollIntoView({ block: 'start' });
          }, 10);
        } else {
          setSavedOffset(0);
        }
      } else {
        if (savedOffset > 0) {
          isRestoringRef.current = true;
          setTimeout(() => {
            if (containerRef.current) {
              const cRect = containerRef.current.getBoundingClientRect();
              const mRect = mainContainer.getBoundingClientRect();
              mainContainer.scrollTo({
                top: mainContainer.scrollTop + (cRect.top - mRect.top) + savedOffset,
                behavior: 'auto',
              });
            }
            isRestoringRef.current = false;
          }, 150);
        }
      }
    }
    setIsOpen(!isOpen);
  };
  const colorVar = getBadgeColor(badgeClass);
  const bgVar = getBadgeBg(badgeClass);
  return (
    <div
      ref={containerRef}
      style={{
        marginBottom: '1rem',
        border: `1px solid ${bgVar}`,
        borderRadius: '12px',
        background: 'var(--surface-color)',
      }}
    >
      <div
        ref={headerRef}
        onClick={handleToggle}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: isOpen ? '11px 11px 0 0' : '11px',
          cursor: 'pointer',
          padding: '1rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: bgVar,
          transition: 'background 0.2s ease, border-radius 0.3s ease',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: '1.1rem',
            color: colorVar,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          {title}
          <span
            style={{
              background: colorVar,
              color: '#fff',
              fontSize: '0.8rem',
              padding: '0.1rem 0.6rem',
              borderRadius: '9999px',
              minWidth: '24px',
              textAlign: 'center',
            }}
          >
            {citations.length}
          </span>
        </span>
        <span
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s ease',
            color: colorVar,
            fontSize: '0.8em',
          }}
        >
          ▼
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition:
            isOpen && isRestoringRef.current
              ? 'grid-template-rows 0.15s ease-in-out'
              : 'grid-template-rows 0.3s ease-in-out',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div style={{ padding: citations.length > 0 ? '1.5rem' : '1rem 1.5rem' }}>
            {citations.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontStyle: 'italic' }}>No citations found.</p>
            ) : (
              citations.map((cit, idx) => (
                <div
                  key={idx}
                  className="card"
                  style={{
                    padding: '1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: idx === citations.length - 1 ? 0 : '1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      paddingRight: '1rem',
                      wordBreak: 'break-all',
                    }}
                  >
                    <span
                      style={{
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        marginTop: '1px',
                        userSelect: 'none',
                        minWidth: '1.2rem',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}.
                    </span>
                    <span className="citation-id">
                      {cit.url || (cit.citation || '').startsWith('http') ? (
                        <a
                          href={cit.url || cit.citation}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent-color)', textDecoration: 'none' }}
                          onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                        >
                          {cit.citation}
                        </a>
                      ) : (
                        cit.citation
                      )}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 'max-content' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleHide(cit.citation || '');
                      }}
                      title={hiddenCitations[cit.citation || ''] ? 'Show in PDF' : 'Hide in PDF'}
                      disabled={isCachedFile}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: isCachedFile ? 'not-allowed' : 'pointer',
                        opacity: hiddenCitations[cit.citation || ''] || isCachedFile ? 0.4 : 1,
                        fontSize: '1.2rem',
                        padding: '0.2rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'opacity 0.2s',
                        filter: hiddenCitations[cit.citation || ''] ? 'grayscale(100%)' : 'none',
                      }}
                    >
                      {hiddenCitations[cit.citation || ''] ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={colorVar}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={colorVar}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
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
                          onClick={(e) => {
                            e.stopPropagation();
                            onSearch(cit.citation);
                          }}
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
                            transition: 'all 0.2s ease',
                          }}
                          onMouseOver={(e) => {
                            if (!isActive) e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                          }}
                          onMouseOut={(e) => {
                            if (!isActive) e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                          </svg>
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
}
