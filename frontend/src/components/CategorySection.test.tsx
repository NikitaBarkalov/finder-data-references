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
  });
});
