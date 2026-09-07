# Releases

## Supported runtime

Maia Chat supports Node.js 20 and 22. The CI matrix verifies both versions.
Use Node 22 for new deployments; `.nvmrc` records that default. The currently
verified Ollama baseline is 0.32.0. Upgrade Ollama in staging before treating a
new version as supported in production.

## Versioning

Releases use semantic versioning:

- **MAJOR**: incompatible changes to `/v1/*`, browser data migrations that need
  manual intervention, or changed deployment requirements.
- **MINOR**: backward-compatible features, endpoints, configuration, or UI
  workflows.
- **PATCH**: backward-compatible fixes, security patches, dependency updates,
  and documentation improvements.

`package.json` and `MAIA_VERSION` must match the released version.

## Release checklist

1. Update `CHANGELOG.md`, `package.json`, `.env.example`, and deployment docs.
2. Run `npm ci`, `npm run format:check`, `npm run lint`, `npm run security:check`,
   and `npm test` with Node 20 and Node 22. Run `npm run test:browser` with
   Playwright Chromium.
3. Deploy to staging with the intended Ollama version and configuration.
4. Verify `/api/health/live`, `/api/health/ready` with
   `MAIA_OPERATIONS_TOKEN`, a streamed chat, API-key scope enforcement, and
   `/api/metrics` with `MAIA_METRICS_TOKEN` when enabled.
5. Verify Nginx has TLS enabled, buffering disabled for streams, matching idle
   timeouts, `TimeoutStopSec` greater than `MAIA_SHUTDOWN_TIMEOUT_MS`, and
   `MAIA_TRUSTED_PROXY` restricted to the ingress address.
6. Create the signed release tag and deploy the exact tag or immutable artifact.
7. Monitor request IDs, error rate, generation latency, queue gauges, and model
   readiness after deployment.

## Rollback

Keep the previous immutable release artifact and its matching environment file.
On a failed deployment, return traffic to that release, restart the service,
then verify liveness, readiness, and a streamed chat before investigating the
failed version. Do not roll back browser IndexedDB schema changes without a
documented forward-compatible migration plan.
