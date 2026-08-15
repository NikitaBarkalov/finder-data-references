import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategorySection } from './CategorySection';
describe('CategorySection', () => {
  it('expands and exposes citation actions', () => {
    const onSearch = vi.fn();
    const onToggleHide = vi.fn();
    render(
      <main>
        <CategorySection
          title="PRIMARY DOI"
          citations={[
            {
              citation: 'https://doi.org/10.1/a',
              context: 'context',
              category: 'Primary',
              url: 'https://doi.org/10.1/a',
            },
          ]}
          badgeClass="primary-doi"
          onSearch={onSearch}
          activeSearch={{ text: 'https://doi.org/10.1/a', index: 0 }}
          counts={{ 'https://doi.org/10.1/a': 2 }}
          hiddenCitations={{}}
          onToggleHide={onToggleHide}
          isCachedFile={false}
        />
      </main>,
    );
    fireEvent.click(screen.getByText('PRIMARY DOI'));
    expect(screen.getByRole('link', { name: 'https://doi.org/10.1/a' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /find \(1\/2\)/i })).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/hide in pdf/i));
    fireEvent.click(screen.getByTitle(/find in document/i));
    expect(onToggleHide).toHaveBeenCalledWith('https://doi.org/10.1/a');
    expect(onSearch).toHaveBeenCalledWith('https://doi.org/10.1/a');

    const link = screen.getByRole('link', { name: 'https://doi.org/10.1/a' });
    fireEvent.mouseOver(link);
    fireEvent.mouseOut(link);
    const findBtn = screen.getByTitle(/find in document/i);
    fireEvent.mouseOver(findBtn);
    fireEvent.mouseOut(findBtn);
  });
  it('handles scroll restoration when toggling open/close', async () => {
    vi.useFakeTimers();
    const mockScrollTo = vi.fn();
    Element.prototype.scrollTo = mockScrollTo;
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 200,
      left: 0,
      right: 0,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    }));

    render(
      <main>
        <CategorySection
          title="PRIMARY DOI"
          citations={[]}
          badgeClass="primary-doi"
          onSearch={vi.fn()}
          activeSearch={null}
          counts={{}}
          hiddenCitations={{}}
          onToggleHide={vi.fn()}
          isCachedFile={false}
        />
      </main>,
    );

    const header = screen.getByText('PRIMARY DOI');
    fireEvent.click(header);
    fireEvent.click(header);
    vi.advanceTimersByTime(200);
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
});
