export interface Citation {
  citation: string;
  context: string;
  category: string;
  url?: string;
}

export interface ExtractionResponse {
  authors: string;
  citations: Citation[];
}

export type PipelineStatus = 'idle' | 'loading' | 'success' | 'results' | 'cancelled';

export type ProgressCounter = { current: number; total: number };

export type ActiveCitationSearch = { text: string; index: number } | null;

export type HighlightRect = { top: number; left: number; width: number; height: number };
