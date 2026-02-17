# ADR 043: Kubernetes Observability

## Status

Accepted

## Date

2026-02-17

## Context

SecureYeoman already has a comprehensive observability stack for Docker deployments (Prometheus, Grafana, Loki/Promtail with 9 alert rules and a custom dashboard). When deploying to Kubernetes, we need to integrate with the Kubernetes-native observability ecosystem.

## Decision

### Prometheus Operator CRDs

We use `ServiceMonitor` and `PrometheusRule` CRDs (from the Prometheus Operator) because:
- **Auto-discovery**: ServiceMonitor automatically configures Prometheus to scrape `secureyeoman-core` pods — no manual target configuration
- **Lifecycle**: Rules and monitors are managed alongside the application via Helm
- **Standard**: The Prometheus Operator is the de facto standard for Kubernetes monitoring

All 9 existing alert rules from `deploy/prometheus/alert-rules.yml` are migrated to a `PrometheusRule` CRD.

### Grafana Sidecar Dashboard

The existing Grafana dashboard JSON is mounted as a ConfigMap with the label `grafana_dashboard: "1"`. The Grafana sidecar (standard in kube-prometheus-stack) automatically discovers and loads it.

### Pod Annotations for Legacy Scraping

For clusters without the Prometheus Operator, standard pod annotations are added:
- `prometheus.io/scrape: "true"`
- `prometheus.io/port: "18789"`
- `prometheus.io/path: "/metrics"`

### Conditional Enablement

All observability resources are gated behind `.Values.monitoring.enabled` to avoid CRD errors on clusters without the Prometheus Operator installed.

## Alternatives Considered

| Alternative | Reason for Rejection |
|------------|---------------------|
| Static Prometheus config | Doesn't scale with pod count; no auto-discovery |
| OpenTelemetry Collector | Additional complexity; can be added later alongside Prometheus |
| Datadog / New Relic agents | Vendor lock-in; not cloud-agnostic |

## Consequences

### Positive
- Zero-config monitoring when Prometheus Operator is installed
- Dashboard auto-loads in Grafana
- All 9 alert rules carry over from Docker setup
- Graceful degradation: annotations work without Operator

### Negative
- Requires Prometheus Operator CRDs to be installed for ServiceMonitor/PrometheusRule
- Grafana sidecar must be configured for dashboard auto-discovery

## References

- ServiceMonitor: `deploy/helm/secureyeoman/templates/servicemonitor.yaml`
- PrometheusRule: `deploy/helm/secureyeoman/templates/prometheusrule.yaml`
- Grafana ConfigMap: `deploy/helm/secureyeoman/templates/grafana-dashboard-configmap.yaml`
- Source alerts: `deploy/prometheus/alert-rules.yml`
- Source dashboard: `deploy/grafana/secureyeoman-dashboard.json`
