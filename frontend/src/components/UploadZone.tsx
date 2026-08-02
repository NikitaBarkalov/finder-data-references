import { useRef, type ChangeEvent, type DragEvent } from 'react';
type UploadZoneProps = {
  dragActive: boolean;
  error: string | null;
  onDrag: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onFileSelected: (file: File) => void;
};
export function UploadZone({ dragActive, error, onDrag, onDrop, onFileSelected }: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      await onFileSelected(e.target.files[0]);
    }
  };
  return (
    <div
      className={`upload-container ${dragActive ? 'drag-active' : ''}`}
      onDragEnter={onDrag}
      onDragLeave={onDrag}
      onDragOver={onDrag}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
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
      <div className="upload-icon" style={{ display: 'flex', justifyContent: 'center' }}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent-color)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="12" y1="18" x2="12" y2="12"></line>
          <line x1="9" y1="15" x2="15" y2="15"></line>
        </svg>
      </div>
      <div className="upload-text">Drag & drop a scientific article PDF here</div>
      <div className="upload-subtext">or click to browse</div>
      {error && <div style={{ color: '#ef4444', marginTop: '1rem' }}>{error}</div>}
    </div>
  );
}
