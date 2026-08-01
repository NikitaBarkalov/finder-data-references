export const PIPELINE_STEPS = [
  { id: 'check_cache', label: 'Checking for embedded annotations' },
  { id: 'extract', label: 'Reading PDF & Extracting Authors' },
  { id: 'raw', label: 'Extracting Raw References' },
  { id: 'dedup', label: 'Deduplication & Clustering' },
  { id: 'verify', label: 'LLM Verification' },
  { id: 'classify', label: 'LLM Classification' },
  { id: 'format', label: 'Formatting Results' },
];

/** Map backend progress messages (shown in UI) to pipeline step index / details. */
export function mapProgressMessage(msgStr: string): {
  stepIndex?: number;
  detail?: { index: number; text: string; append?: boolean };
} {
  const msg = msgStr.toLowerCase();

  if (msg.includes('extracting dois')) {
    return { stepIndex: 2 };
  }
  if (msg.includes('raw citations before deduplication')) {
    const match = msgStr.match(/Found (\d+) raw citations/);
    return {
      stepIndex: 2,
      detail: match ? { index: 2, text: `${match[1]} raw references found` } : { index: 2, text: 'Extracting references' },
    };
  }
  if (msg.includes('after deduplication')) {
    const match = msgStr.match(/After deduplication:\s*(.*)/);
    return {
      stepIndex: 3,
      detail: match ? { index: 3, text: match[1] } : undefined,
    };
  }
  if (msg.includes('clustering')) {
    return { stepIndex: 3 };
  }
  if (msg.includes('verifying')) {
    return { stepIndex: 4 };
  }
  if (msg.includes('successfully verified')) {
    const match = msgStr.match(/Successfully verified (\d+) IDs/);
    return {
      stepIndex: 4,
      detail: match ? { index: 4, text: `${match[1]} IDs passed verification` } : undefined,
    };
  }
  if (msg.includes('skipping llm verification')) {
    return { detail: { index: 4, text: 'Skipped' } };
  }
  if (msg.includes('classifying verified') || msg.includes('sending')) {
    return { stepIndex: 5 };
  }
  if (msg.includes("classified as 'dataset'")) {
    const match = msgStr.match(/(\d+ out of \d+.*)/);
    return {
      stepIndex: 5,
      detail: match ? { index: 5, text: match[1], append: true } : undefined,
    };
  }
  if (msg.includes('identified') && msg.includes('prefix filter')) {
    const match = msgStr.match(/Identified (\d+) DOIs as Articles/);
    return {
      stepIndex: 5,
      detail: match
        ? { index: 5, text: `${match[1]} items passed via prefix match`, append: true }
        : undefined,
    };
  }
  if (msg.includes('formatting results') || msg.includes('processing complete')) {
    return { stepIndex: 6 };
  }

  return {};
}
