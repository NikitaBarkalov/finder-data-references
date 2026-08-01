import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { set, del } from 'idb-keyval';
import { API_BASE_URL } from '../api/config';
import { PIPELINE_STEPS, mapProgressMessage } from '../constants/pipeline';
import type { Citation, ExtractionResponse, HighlightRect, PipelineStatus, ProgressCounter } from '../types';
import { defaultVisibleCategories, repairCitations } from '../utils/citations';

type UseExtractionArgs = {
  pdfFilename: string | null;
  setPdfUrl: (url: string | null) => void;
  setPdfFilename: (name: string | null) => void;
  setHighlightRects: Dispatch<SetStateAction<HighlightRect[]>>;
  setVisibleCategories: Dispatch<SetStateAction<Record<string, boolean>>>;
  setHiddenCitations: Dispatch<SetStateAction<Record<string, boolean>>>;
};

export function useExtraction({
  pdfFilename,
  setPdfUrl,
  setPdfFilename,
  setHighlightRects,
  setVisibleCategories,
  setHiddenCitations,
}: UseExtractionArgs) {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('idle');
  const [results, setResults] = useState<ExtractionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [stepDetails, setStepDetails] = useState<Record<number, string>>({});
  const [currentExtractionTaskId, setCurrentExtractionTaskId] = useState<string | null>(null);
  const [isExtractionPaused, setIsExtractionPaused] = useState(false);
  const [isCachedFile, setIsCachedFile] = useState(false);
  const [llmProgress, setLlmProgress] = useState<ProgressCounter | null>(null);
  const [rateLimitDelay, setRateLimitDelay] = useState<number | null>(null);
  const [generatedFileId, setGeneratedFileId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentExtractionTaskId || pipelineStatus !== 'loading' || isExtractionPaused) return;

    const eventSource = new EventSource(`${API_BASE_URL}/api/v1/task/${currentExtractionTaskId}/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'rate_limit') {
        setRateLimitDelay(data.delay);
      } else if (data.type === 'progress_counter') {
        setLlmProgress({ current: data.current, total: data.total });
      } else if (data.type === 'progress') {
        setLlmProgress(null);
        setRateLimitDelay(null);
        const mapped = mapProgressMessage(data.message || '');
        if (mapped.stepIndex !== undefined) {
          setActiveStepIndex(mapped.stepIndex);
        }
        if (mapped.detail) {
          const { index, text, append } = mapped.detail;
          setStepDetails(prev => {
            if (append && prev[index]) {
              return { ...prev, [index]: prev[index] + '\n' + text };
            }
            return { ...prev, [index]: text };
          });
        }
      } else if (data.type === 'complete') {
        eventSource.close();
        const resultData = data.result;
        if (pdfFilename && pdfFilename.startsWith('10.')) {
          const selfDoi = pdfFilename.replace(/\.pdf$/i, '').replace(/_/g, '/');
          if (resultData && resultData.citations) {
            resultData.citations = resultData.citations.filter(
              (cit: Citation) => !(cit.citation || '').includes(selfDoi),
            );
          }
        }
        setTimeout(() => {
          setResults(resultData);
          set('savedResults', resultData);

          setTimeout(() => {
            setActiveStepIndex(PIPELINE_STEPS.length);

            setTimeout(() => {
              setPipelineStatus('success');
              set('savedPipelineStatus', 'success');
              setCurrentExtractionTaskId(null);
            }, 250);
          }, 1000);
        }, 500);
      } else if (data.type === 'error') {
        eventSource.close();
        if (data.message === 'Cancelled by user') {
          setPipelineStatus('cancelled');
        } else {
          setError(data.message);
          setPipelineStatus('idle');
        }
        setCurrentExtractionTaskId(null);
      }
    };

    eventSource.onerror = () => {
      setError('Connection to server lost.');
      setPipelineStatus('idle');
      setCurrentExtractionTaskId(null);
    };

    return () => {
      eventSource.close();
    };
  }, [currentExtractionTaskId, pipelineStatus, isExtractionPaused, pdfFilename]);

  useEffect(() => {
    if (activeStepIndex !== 0) set('savedActiveStepIndex', activeStepIndex);
  }, [activeStepIndex]);

  useEffect(() => {
    if (Object.keys(stepDetails).length > 0) set('savedStepDetails', stepDetails);
  }, [stepDetails]);

  useEffect(() => {
    if (llmProgress) set('savedLlmProgress', llmProgress);
  }, [llmProgress]);

  useEffect(() => {
    if (rateLimitDelay === null || rateLimitDelay <= 0) return;
    const timer = setInterval(() => {
      setRateLimitDelay(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitDelay]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (pipelineStatus === 'success') {
      timer = setTimeout(() => {
        setPipelineStatus('results');
      }, 1500);
    }
    return () => clearTimeout(timer);
  }, [pipelineStatus]);

  const handleCancelExtraction = useCallback(async () => {
    if (!currentExtractionTaskId) return;
    try {
      await fetch(`${API_BASE_URL}/api/v1/task/${currentExtractionTaskId}/cancel`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to cancel extraction', e);
    }
    setPipelineStatus('cancelled');
    set('savedPipelineStatus', 'cancelled');
    setCurrentExtractionTaskId(null);
    setIsExtractionPaused(false);
    del('savedIsExtractionPaused');
    setGeneratedFileId(null);
    del('savedGeneratedFileId');
  }, [currentExtractionTaskId]);

  const handleToggleExtractionPause = useCallback(async () => {
    if (!currentExtractionTaskId) return;
    const action = isExtractionPaused ? 'resume' : 'pause';
    try {
      await fetch(`${API_BASE_URL}/api/v1/task/${currentExtractionTaskId}/${action}`, { method: 'POST' });
      const newStatus = !isExtractionPaused;
      setIsExtractionPaused(newStatus);
      if (newStatus) set('savedIsExtractionPaused', true);
      else del('savedIsExtractionPaused');
    } catch (e) {
      console.error(`Failed to ${action} extraction`, e);
    }
  }, [currentExtractionTaskId, isExtractionPaused]);

  const processFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      return;
    }

    setPdfUrl(URL.createObjectURL(file));
    setPdfFilename(file.name);
    set('savedPdfFile', file);
    set('savedPdfFilename', file.name);
    del('savedResults');
    set('savedPipelineStatus', 'loading');

    setPipelineStatus('loading');
    setIsExtractionPaused(false);
    del('savedIsExtractionPaused');
    del('savedActiveStepIndex');
    del('savedStepDetails');
    setGeneratedFileId(null);
    del('savedGeneratedFileId');
    setRateLimitDelay(null);
    setActiveStepIndex(0);
    setStepDetails({});
    setError(null);
    setResults(null);
    setHighlightRects([]);
    setVisibleCategories(defaultVisibleCategories());
    setHiddenCitations({});
    setLlmProgress(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/extract`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = errText;
        try {
          errMsg = JSON.parse(errText).detail || errText;
        } catch { /* keep errText */ }
        throw new Error(`API returned ${response.status}: ${errMsg}`);
      }

      const data = await response.json();

      if (data.cached_result) {
        setIsCachedFile(true);
        set('savedIsCachedFile', true);
        setPipelineStatus('loading');
        setActiveStepIndex(0);

        setTimeout(() => {
          setActiveStepIndex(PIPELINE_STEPS.length);
          setStepDetails({
            0: 'Found embedded annotations in PDF metadata.',
            1: 'Skipped',
            2: 'Skipped',
            3: 'Skipped',
            4: 'Skipped',
            5: 'Skipped',
            6: 'Skipped',
          });

          setTimeout(() => {
            setPipelineStatus('success');
            set('savedPipelineStatus', 'success');
            setTimeout(() => {
              const repairedResults = repairCitations(data.cached_result);
              setResults(repairedResults);
              set('savedResults', repairedResults);
              setPipelineStatus('results');
              set('savedPipelineStatus', 'results');
            }, 800);
          }, 300);
        }, 500);
        return;
      }

      setIsCachedFile(false);
      set('savedIsCachedFile', false);
      setStepDetails(prev => ({ ...prev, 0: 'No embedded annotations found.' }));
      setActiveStepIndex(1);
      setCurrentExtractionTaskId(data.task_id);
      set('savedExtractionTaskId', data.task_id);
      set('savedPipelineStatus', 'loading');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process PDF.';
      setError(message);
      setPipelineStatus('idle');
      setCurrentExtractionTaskId(null);
    }
  }, [
    setPdfUrl,
    setPdfFilename,
    setHighlightRects,
    setVisibleCategories,
    setHiddenCitations,
  ]);

  return {
    pipelineStatus,
    setPipelineStatus,
    results,
    setResults,
    error,
    setError,
    activeStepIndex,
    setActiveStepIndex,
    stepDetails,
    setStepDetails,
    currentExtractionTaskId,
    setCurrentExtractionTaskId,
    isExtractionPaused,
    setIsExtractionPaused,
    isCachedFile,
    setIsCachedFile,
    llmProgress,
    setLlmProgress,
    rateLimitDelay,
    setRateLimitDelay,
    generatedFileId,
    setGeneratedFileId,
    processFile,
    handleCancelExtraction,
    handleToggleExtractionPause,
  };
}
