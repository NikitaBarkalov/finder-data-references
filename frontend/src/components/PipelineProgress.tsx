import { PIPELINE_STEPS } from '../constants/pipeline';
import type { PipelineStatus, ProgressCounter } from '../types';

type PipelineProgressProps = {
  pipelineStatus: PipelineStatus;
  activeStepIndex: number;
  stepDetails: Record<number, string>;
  isExtractionPaused: boolean;
  llmProgress: ProgressCounter | null;
  rateLimitDelay: number | null;
};

export function PipelineProgress({
  pipelineStatus,
  activeStepIndex,
  stepDetails,
  isExtractionPaused,
  llmProgress,
  rateLimitDelay,
}: PipelineProgressProps) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {rateLimitDelay !== null && rateLimitDelay > 0 && pipelineStatus === 'loading' && (
        <div style={{
          margin: '0 auto 0.5rem auto',
          maxWidth: '600px',
          background: 'rgba(234, 179, 8, 0.1)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          color: '#eab308',
          padding: '0.5rem 0.75rem',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8rem',
          animation: 'fade-up 0.3s ease-out',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span style={{ lineHeight: 1.4 }}>
            The third-party AI provider has enforced a temporary rate limit.
            <br />
            Processing is paused and will automatically resume in <strong>{Math.ceil(rateLimitDelay)}</strong> seconds...
          </span>
        </div>
      )}
      <div className="stepper-container">
        {PIPELINE_STEPS.map((step, index) => {
          const isCompleted = pipelineStatus === 'success' || index < activeStepIndex;
          const isActive = pipelineStatus === 'loading' && index === activeStepIndex;
          const isCancelled = pipelineStatus === 'cancelled' && index >= activeStepIndex;

          let stepStatusClass = 'pending';
          const isSkipped = stepDetails[index] === 'Skipped';
          if (isCompleted || isSkipped) stepStatusClass = 'completed';
          if (isActive) stepStatusClass = 'active';
          if (isCancelled) stepStatusClass = 'cancelled';

          const isPaused = isExtractionPaused && isActive;
          return (
            <div key={step.id} className={`step-item ${stepStatusClass}`}>
              <div
                className={`step-icon ${stepStatusClass}`}
                style={
                  isCancelled
                    ? { background: '#f3f4f6', color: '#9ca3af', border: '2px solid #e5e7eb' }
                    : isPaused
                      ? { background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', border: '2px solid rgba(234, 179, 8, 0.5)', animation: 'none' }
                      : {}
                }
              >
                {isSkipped ? '⏭' : (isCompleted ? '✓' : (isCancelled ? '—' : (isPaused ? '⏸' : index + 1)))}
              </div>
              <div className="step-content-col">
                <div className={`step-label ${stepStatusClass}`}>
                  {step.label}
                  {isSkipped && <span style={{ marginLeft: '8px', fontSize: '0.8em', color: 'var(--accent-color)', fontWeight: '600' }}>(Skipped)</span>}
                </div>
                {stepDetails[index] && !isSkipped && (
                  <div className={`step-detail ${stepStatusClass}`}>
                    {stepDetails[index].split('\n').map((line, i) => <div key={i}>{line}</div>)}
                  </div>
                )}
                {isActive && llmProgress && (
                  <div className="step-detail active" style={{ marginTop: stepDetails[index] ? '0.4rem' : '0', fontWeight: 600, color: 'var(--accent-color)', fontSize: '0.85rem' }}>
                    Processed {llmProgress.current} of {llmProgress.total} items...
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
