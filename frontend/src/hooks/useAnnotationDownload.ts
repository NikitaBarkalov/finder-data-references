import { useState, useEffect, useCallback } from 'react';
import { set, del } from 'idb-keyval';
import { API_BASE_URL } from '../api/config';
import type { ExtractionResponse, ProgressCounter } from '../types';
import { getMarkClassAndTitle, hexToRgbNormalized, markClassToHex, resolveCitationUrl } from '../utils/citations';
type UseAnnotationDownloadArgs = {
  pdfUrl: string | null;
  pdfFilename: string | null;
  results: ExtractionResponse | null;
  hiddenCitations: Record<string, boolean>;
  generatedFileId: string | null;
  setGeneratedFileId: (id: string | null) => void;
};
export function useAnnotationDownload({
  pdfUrl,
  pdfFilename,
  results,
  hiddenCitations,
  generatedFileId,
  setGeneratedFileId,
}: UseAnnotationDownloadArgs) {
  const [currentDownloadTaskId, setCurrentDownloadTaskId] = useState<string | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<ProgressCounter | null>(null);
  const [isDownloadPaused, setIsDownloadPaused] = useState(false);
  useEffect(() => {
    if (!currentDownloadTaskId || !isDownloadingPdf || isDownloadPaused) return;
    const eventSource = new EventSource(`${API_BASE_URL}/api/v1/task/${currentDownloadTaskId}/stream`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'progress' && data.total) {
        setDownloadProgress({ current: data.current, total: data.total });
      } else if (data.type === 'complete') {
        eventSource.close();
        const fileId = data.result.file_id;
        setGeneratedFileId(fileId);
        set('savedGeneratedFileId', fileId);
        setIsDownloadingPdf(false);
        setDownloadProgress(null);
        setCurrentDownloadTaskId(null);
        del('savedDownloadTaskId');
      } else if (data.type === 'error') {
        eventSource.close();
        if (data.message !== 'Cancelled by user') {
          alert('Error: ' + data.message);
        }
        setIsDownloadingPdf(false);
        setDownloadProgress(null);
        setCurrentDownloadTaskId(null);
        del('savedDownloadTaskId');
      }
    };
    eventSource.onerror = () => {
      setIsDownloadingPdf(false);
      setDownloadProgress(null);
      setCurrentDownloadTaskId(null);
      del('savedDownloadTaskId');
    };
    return () => {
      eventSource.close();
    };
  }, [currentDownloadTaskId, isDownloadingPdf, isDownloadPaused, setGeneratedFileId]);
  useEffect(() => {
    if (downloadProgress) set('savedDownloadProgress', downloadProgress);
  }, [downloadProgress]);
  const handleDownloadAnnotatedPdf = useCallback(async () => {
    if (!pdfUrl || !results || !pdfFilename) return;
    setIsDownloadingPdf(true);
    setIsDownloadPaused(false);
    try {
      const response = await fetch(pdfUrl);
      const blob = await response.blob();
      const citationsToHighlight = results.citations
        .filter((cit) => !hiddenCitations[cit.citation || ''])
        .map((cit) => {
          const { className, title } = getMarkClassAndTitle(cit);
          const hexColor = markClassToHex(className);
          const [r, g, b] = hexToRgbNormalized(hexColor);
          const targetUrl = resolveCitationUrl(cit);
          return {
            ...cit,
            text: cit.citation,
            url: targetUrl,
            color: [r, g, b],
            title,
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
      setCurrentDownloadTaskId(task_id);
      set('savedDownloadTaskId', task_id);
    } catch (error) {
      console.error(error);
      alert('Failed to download annotated PDF.');
      setIsDownloadingPdf(false);
      setDownloadProgress(null);
      setCurrentDownloadTaskId(null);
    }
  }, [pdfUrl, results, pdfFilename, hiddenCitations]);
  const handleDownloadGeneratedFile = useCallback(() => {
    if (!generatedFileId) return;
    const a = document.createElement('a');
    a.href = `${API_BASE_URL}/api/v1/download-annotated/${generatedFileId}`;
    a.download = `annotated_${pdfFilename}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [generatedFileId, pdfFilename]);
  const handleCancelDownload = useCallback(async () => {
    if (!currentDownloadTaskId) return;
    try {
      await fetch(`${API_BASE_URL}/api/v1/task/${currentDownloadTaskId}/cancel`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to cancel task', e);
    }
    setIsDownloadingPdf(false);
    setDownloadProgress(null);
    setCurrentDownloadTaskId(null);
    setIsDownloadPaused(false);
    del('savedDownloadTaskId');
    del('savedIsDownloadPaused');
  }, [currentDownloadTaskId]);
  const handleToggleDownloadPause = useCallback(async () => {
    if (!currentDownloadTaskId) return;
    const action = isDownloadPaused ? 'resume' : 'pause';
    try {
      await fetch(`${API_BASE_URL}/api/v1/task/${currentDownloadTaskId}/${action}`, { method: 'POST' });
      const newStatus = !isDownloadPaused;
      setIsDownloadPaused(newStatus);
      if (newStatus) set('savedIsDownloadPaused', true);
      else del('savedIsDownloadPaused');
    } catch (e) {
      console.error(`Failed to ${action} download task`, e);
    }
  }, [currentDownloadTaskId, isDownloadPaused]);
  return {
    currentDownloadTaskId,
    setCurrentDownloadTaskId,
    isDownloadingPdf,
    setIsDownloadingPdf,
    downloadProgress,
    setDownloadProgress,
    isDownloadPaused,
    setIsDownloadPaused,
    handleDownloadAnnotatedPdf,
    handleDownloadGeneratedFile,
    handleCancelDownload,
    handleToggleDownloadPause,
  };
}
