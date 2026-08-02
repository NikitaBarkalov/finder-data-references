import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UploadZone } from './UploadZone';

describe('UploadZone', () => {
  it('forwards selected PDF files', async () => {
    const onFileSelected = vi.fn();
    const user = userEvent.setup();
    render(
      <UploadZone
        dragActive={false}
        error={null}
        onDrag={vi.fn()}
        onDrop={vi.fn()}
        onFileSelected={onFileSelected}
      />,
    );

    const input = document.querySelector('input[type="file"]');
    const file = new File(['pdf'], 'paper.pdf', { type: 'application/pdf' });

    await user.upload(input as HTMLInputElement, file);

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('renders the error message when validation fails', () => {
    render(
      <UploadZone
        dragActive
        error="Please upload a valid PDF file."
        onDrag={vi.fn()}
        onDrop={vi.fn()}
        onFileSelected={vi.fn()}
      />,
    );

    expect(screen.getByText(/please upload a valid pdf file/i)).toBeInTheDocument();
  });

  it('clicks the hidden file input when the drop zone is activated', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
    render(
      <UploadZone
        dragActive={false}
        error={null}
        onDrag={vi.fn()}
        onDrop={vi.fn()}
        onFileSelected={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/drag & drop/i));

    expect(clickSpy).toHaveBeenCalled();
  });
});
