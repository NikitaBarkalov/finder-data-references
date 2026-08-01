import { useEffect } from 'react';
import { get, del } from 'idb-keyval';
import type { ExtractionResponse, PipelineStatus, ProgressCounter } from '../types';
import { PIPELINE_STEPS } from '../constants/pipeline';
import { repairCitations } from '../utils/citations';

export type RestoredSession = {
  pdfUrl: string | null;
  pdfFilename: string | null;
  isCachedFile: boolean;
  generatedFileId: string | null;
  isDownloadingPdf: boolean;
  currentDownloadTaskId: string | null;
  isDownloadPaused: boolean;
  downloadProgress: ProgressCounter | null;
  pipelineStatus: PipelineStatus;
  currentExtractionTaskId: string | null;
  isExtractionPaused: boolean;
  activeStepIndex: number;
  stepDetails: Record<number, string>;
  llmProgress: ProgressCounter | null;
  results: ExtractionResponse | null;
};

type SessionSetters = {
  setPdfUrl: (url: string | null) => void;
  setPdfFilename: (name: string | null) => void;
  setIsCachedFile: (v: boolean) => void;
  setGeneratedFileId: (id: string | null) => void;
  setIsDownloadingPdf: (v: boolean) => void;
  setCurrentDownloadTaskId: (id: string | null) => void;
  setIsDownloadPaused: (v: boolean) => void;
  setDownloadProgress: (p: ProgressCounter | null) => void;
  setPipelineStatus: (s: PipelineStatus) => void;
  setCurrentExtractionTaskId: (id: string | null) => void;
  setIsExtractionPaused: (v: boolean) => void;
  setActiveStepIndex: (i: number) => void;
  setStepDetails: (d: Record<number, string>) => void;
  setLlmProgress: (p: ProgressCounter | null) => void;
  setResults: (r: ExtractionResponse | null) => void;
};

export async function clearPersistedSession(): Promise<void> {
  await Promise.all([
    del('savedPdfFile'),
    del('savedPdfFilename'),
    del('savedResults'),
    del('savedPipelineStatus'),
    del('savedExtractionTaskId'),
    del('savedDownloadTaskId'),
    del('savedIsExtractionPaused'),
    del('savedIsDownloadPaused'),
    del('savedActiveStepIndex'),
    del('savedStepDetails'),
    del('savedDownloadProgress'),
    del('savedLlmProgress'),
    del('savedIsCachedFile'),
    del('savedGeneratedFileId'),
  ]);
}

export function usePersistedSession(setters: SessionSetters) {
  useEffect(() => {
    async function loadSavedState() {
      try {
        const savedFile = await get<File>('savedPdfFile');
        const savedFilename = await get<string>('savedPdfFilename');
        const savedResults = await get<ExtractionResponse>('savedResults');
        const savedStatus = await get<string>('savedPipelineStatus');
        const savedTaskId = await get<string>('savedExtractionTaskId');
        const savedDownloadTaskId = await get<string>('savedDownloadTaskId');
        const savedIsExtractionPaused = await get<boolean>('savedIsExtractionPaused');
        const savedIsDownloadPaused = await get<boolean>('savedIsDownloadPaused');
        const savedActiveStepIndex = await get<number>('savedActiveStepIndex');
        const savedStepDetails = await get<Record<number, string>>('savedStepDetails');
        const savedDownloadProgress = await get<ProgressCounter>('savedDownloadProgress');
        const savedLlmProgress = await get<ProgressCounter>('savedLlmProgress');
        const savedIsCachedFile = await get<boolean>('savedIsCachedFile');
        const savedGeneratedFileId = await get<string>('savedGeneratedFileId');

        if (savedIsCachedFile) setters.setIsCachedFile(true);
        if (savedGeneratedFileId) setters.setGeneratedFileId(savedGeneratedFileId);

        if (savedFile && savedFilename) {
          setters.setPdfUrl(URL.createObjectURL(savedFile));
          setters.setPdfFilename(savedFilename);
        }

        if (savedDownloadTaskId) {
          setters.setIsDownloadingPdf(true);
          setters.setCurrentDownloadTaskId(savedDownloadTaskId);
          if (savedIsDownloadPaused) setters.setIsDownloadPaused(true);
          if (savedDownloadProgress) setters.setDownloadProgress(savedDownloadProgress);
        }

        if ((savedStatus === 'loading' || (!savedStatus && savedTaskId)) && savedTaskId) {
          setters.setPipelineStatus('loading');
          setters.setCurrentExtractionTaskId(savedTaskId);
          if (savedIsExtractionPaused) setters.setIsExtractionPaused(true);
          if (savedActiveStepIndex !== undefined) setters.setActiveStepIndex(savedActiveStepIndex);
          if (savedStepDetails) setters.setStepDetails(savedStepDetails);
          if (savedLlmProgress) setters.setLlmProgress(savedLlmProgress);
        } else if (savedStatus === 'cancelled') {
          setters.setPipelineStatus('cancelled');
          if (savedActiveStepIndex !== undefined) setters.setActiveStepIndex(savedActiveStepIndex);
          if (savedStepDetails) setters.setStepDetails(savedStepDetails);
          if (savedLlmProgress) setters.setLlmProgress(savedLlmProgress);
        } else if (savedResults) {
          const repairedResults = repairCitations(savedResults);
          setters.setResults(repairedResults);
          setters.setActiveStepIndex(PIPELINE_STEPS.length);
          if (savedStatus === 'results' || savedStatus === 'success' || !savedStatus) {
            setters.setPipelineStatus('results');
          } else {
            setters.setPipelineStatus(savedStatus as PipelineStatus);
          }
        }
      } catch (e) {
        console.error('Error loading saved state:', e);
      }
    }
    loadSavedState();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount
  }, []);
}
