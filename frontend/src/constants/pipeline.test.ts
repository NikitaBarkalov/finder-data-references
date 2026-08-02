import { describe, expect, it } from 'vitest';
import { mapProgressMessage } from './pipeline';
describe('mapProgressMessage', () => {
  it('maps raw citations message to step 2 with detail', () => {
    const res = mapProgressMessage('Found 3 raw citations before deduplication');
    expect(res.stepIndex).toBe(2);
    expect(res.detail).toBeTruthy();
    expect(res.detail?.text).toContain('3 raw references');
  });
  it('maps after deduplication detail', () => {
    const res = mapProgressMessage('After deduplication: 2 clusters');
    expect(res.stepIndex).toBe(3);
    expect(res.detail?.text).toContain('2 clusters');
  });
  it('maps verification message with count', () => {
    const res = mapProgressMessage('Successfully verified 5 IDs');
    expect(res.stepIndex).toBe(4);
    expect(res.detail?.text).toContain('5 IDs passed verification');
  });
  it('maps skipping verification', () => {
    const res = mapProgressMessage('Skipping LLM verification due to config');
    expect(res.detail?.text).toBe('Skipped');
  });
  it('maps classified dataset append', () => {
    const res = mapProgressMessage("Classified as 'dataset' 2 out of 5 items");
    expect(res.stepIndex).toBe(5);
    expect(res.detail?.append).toBe(true);
  });
  it('maps identified DOIs prefix filter', () => {
    const res = mapProgressMessage('Identified 2 DOIs as Articles via prefix filter');
    expect(res.stepIndex).toBe(5);
    expect(res.detail?.text).toContain('2 items passed');
  });
  it('maps formatting results', () => {
    const res = mapProgressMessage('Formatting results complete');
    expect(res.stepIndex).toBe(6);
  });
  it('returns empty object for unknown message', () => {
    const res = mapProgressMessage('unrelated');
    expect(res).toEqual({});
  });
});
