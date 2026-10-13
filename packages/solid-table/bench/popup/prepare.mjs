import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Keep the existing runner stage, but never download runtime source.
execFileSync(
  process.execPath,
  [
    fileURLToPath(
      new URL(
        '../../../solid-ui-core/scripts/check-vendor.mjs',
        import.meta.url,
      ),
    ),
  ],
  { stdio: 'inherit' },
)
