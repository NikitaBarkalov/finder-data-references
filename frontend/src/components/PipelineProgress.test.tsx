import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PipelineProgress } from './PipelineProgress';
describe('PipelineProgress', () => {
  it('shows the rate limit banner while loading', () => {
    render(
      <PipelineProgress
        pipelineStatus="loading"
        activeStepIndex={4}
        stepDetails={{ 4: 'Skipped', 5: 'Classifying', 6: 'Formatting' }}
        isExtractionPaused={false}
        llmProgress={{ current: 2, total: 5 }}
        rateLimitDelay={12}
      />,
    );
    expect(screen.getByText(/temporary rate limit/i)).toBeInTheDocument();
    expect(screen.getByText(/processed 2 of 5 items/i)).toBeInTheDocument();
    expect(screen.getByText(/skipped/i)).toBeInTheDocument();
  });
  it('renders cancelled steps without the banner', () => {
    render(
      <PipelineProgress
        pipelineStatus="cancelled"
        activeStepIndex={2}
        stepDetails={{}}
        isExtractionPaused={false}
        llmProgress={null}
        rateLimitDelay={null}
      />,
    );
    expect(screen.queryByText(/temporary rate limit/i)).not.toBeInTheDocument();
    expect(screen.getByText(/checking for embedded annotations/i)).toBeInTheDocument();
  });
});
