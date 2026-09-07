# Operations

## Prometheus scrape

Set `MAIA_METRICS_TOKEN` and scrape `GET /api/metrics` with a Bearer
authorization header. Scrape readiness separately through Prometheus HTTP SD or
Blackbox Exporter at `GET /api/health/ready`; its `probe_success` series is used
by the readiness alert.

Load `deploy/prometheus/maia-alerts.yml` through the Prometheus `rule_files`
configuration. Adjust thresholds to observed hardware capacity and expected
traffic before paging an operator.

## Dashboard queries

Use these PromQL queries as panels in Grafana or another Prometheus dashboard.

| Panel                        | PromQL                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Readiness                    | `probe_success{job="maia-readiness"}`                                                                                      |
| Requests per second          | `sum(rate(maia_http_requests_total[5m]))`                                                                                  |
| HTTP errors per second       | `sum(rate(maia_http_requests_total{status=~"5.."}[5m]))`                                                                   |
| Generation failure rate      | `sum(rate(maia_generations_total{outcome="failed"}[5m])) / clamp_min(sum(rate(maia_generations_total[5m])), 0.01)`         |
| Average generation seconds   | `rate(maia_generation_duration_seconds_sum[5m]) / clamp_min(rate(maia_generation_duration_seconds_count[5m]), 0.01)`       |
| Average first token seconds  | `rate(maia_generation_first_token_seconds_sum[5m]) / clamp_min(rate(maia_generation_first_token_seconds_count[5m]), 0.01)` |
| Active and queued            | `maia_active_generations` and `maia_queued_generations`                                                                    |
| Completion tokens per second | `rate(maia_completion_tokens_total[5m])`                                                                                   |

## Triage

1. Use the request ID from an affected response to find the correlated log
   events.
2. Check readiness. A failing probe usually distinguishes Maia/Ollama capacity
   or connectivity from a browser-side problem.
3. Check queue and active-generation gauges. Sustained queue growth indicates
   capacity saturation.
4. Compare first-token and total-duration panels. A high first-token time often
   indicates model loading or upstream contention; high total duration after the
   first token points to inference throughput.
5. Review `generation_failed` event codes without collecting prompt content.

## Backup

Maia Chat does not retain browser conversations or attachments on the server.
Users are responsible for exporting local history as versioned JSON before
clearing browser data or moving devices.

Back up only operator-controlled deployment material: the immutable release
artifact or Git tag, `.env` encrypted at rest, Nginx site configuration, systemd
unit, WireGuard configuration, Prometheus configuration, and alert rules. Do
not copy API tokens or unencrypted `.env` files into source control, logs, or
ticket systems. Test restoration on an isolated host before relying on a backup.

## Upgrade

1. Read the changelog and release notes, then back up deployment material.
2. Run `npm ci`, formatting, lint, security, and test checks for the release
   artifact.
3. Apply the release to staging with copied, sanitized configuration.
4. Verify liveness, readiness, streamed chat, queue behavior, API-key scopes,
   and metrics scrape.
5. Deploy the exact versioned artifact to production and restart the systemd
   service. Active streams drain for `MAIA_SHUTDOWN_TIMEOUT_MS` before exit.
6. Monitor readiness, errors, latency, queue depth, and request IDs. Roll back
   using the release procedure if verification fails.

## Incident response

1. Record the time window, affected endpoint, and request IDs. Avoid recording
   prompts, attachments, API tokens, or user-identifying content.
2. Classify the incident using readiness, Nginx/WireGuard connectivity, Ollama
   availability, capacity gauges, and structured error codes.
3. Contain impact: disable compromised API-key records, rotate metrics tokens,
   restrict ingress, or reduce traffic at Nginx as appropriate.
4. Restore service from a known-good artifact if the current release is unsafe
   or unavailable, then verify liveness, readiness, and a streamed request.
5. Document cause, scope, remediation, and follow-up checks without retaining
   prompt content.
