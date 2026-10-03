/** Keep the last derived structure while callers edit live source records. */
export function holdRowProcessing<T>(
  options: { rowProcessingPaused?: boolean },
  compute: () => T,
): () => T {
  let initialized = false
  let value: T
  return () => {
    const paused = options.rowProcessingPaused
    if (!paused || !initialized) {
      value = compute()
      initialized = true
    }
    return value
  }
}
