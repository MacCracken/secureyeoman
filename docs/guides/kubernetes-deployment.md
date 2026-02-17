# Kubernetes Deployment Guide

Deploy SecureYeoman to a Kubernetes cluster using Helm.

## Prerequisites

- Kubernetes cluster (EKS, GKE, AKS, or local kind/k3d)
- [Helm 3](https://helm.sh/docs/intro/install/)
- kubectl configured for your cluster
- Managed PostgreSQL instance (RDS, Cloud SQL, Azure Database) or in-cluster PostgreSQL
- (Optional) cert-manager for TLS
- (Optional) Prometheus Operator for monitoring

## Quick Start

```bash
# Lint the chart
helm lint deploy/helm/friday

# Install with default values (dev mode)
helm install friday deploy/helm/friday \
  --namespace friday \
  --create-namespace \
  --set secrets.postgresPassword=your-password \
  --set database.host=your-db-host.example.com
```

## Environment-Specific Deployment

### Staging

```bash
helm install friday deploy/helm/friday \
  --namespace friday-staging \
  --create-namespace \
  -f deploy/helm/friday/values-staging.yaml \
  --set secrets.postgresPassword=your-password \
  --set database.host=staging-db.example.com \
  --set ingress.hosts[0].host=friday-staging.example.com
```

### Production

```bash
helm install friday deploy/helm/friday \
  --namespace friday-production \
  --create-namespace \
  -f deploy/helm/friday/values-production.yaml \
  --set secrets.postgresPassword=your-password \
  --set database.host=production-db.example.com \
  --set ingress.hosts[0].host=friday.example.com
```

## Image Pull from GHCR

Images are published to GHCR on tagged releases:

- `ghcr.io/maccracken/secureyeoman-core:<version>`
- `ghcr.io/maccracken/secureyeoman-mcp:<version>`
- `ghcr.io/maccracken/secureyeoman-dashboard:<version>`

For private repositories, create an image pull secret:

```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USER \
  --docker-password=YOUR_GITHUB_PAT \
  --namespace friday

# Then set in values:
# imagePullSecrets:
#   - name: ghcr-secret
```

## Configuration

### Values Overview

| Value | Description | Default |
|-------|-------------|---------|
| `core.replicaCount` | Core gateway replicas | 1 |
| `mcp.enabled` | Enable MCP server | true |
| `dashboard.enabled` | Enable dashboard | true |
| `ingress.enabled` | Enable ingress | false |
| `autoscaling.enabled` | Enable HPA | false |
| `networkPolicy.enabled` | Enable network policies | false |
| `monitoring.enabled` | Enable Prometheus CRDs | false |
| `externalSecrets.enabled` | Use External Secrets Operator | false |

### Database

SecureYeoman expects a PostgreSQL database with pgvector extension:

```yaml
database:
  host: your-rds-endpoint.amazonaws.com
  port: 5432
  name: friday
  user: friday

secrets:
  postgresPassword: your-secure-password
```

### OAuth Secrets

```bash
helm install friday deploy/helm/friday \
  --set secrets.githubOauthClientId=xxx \
  --set secrets.githubOauthClientSecret=xxx \
  --set secrets.googleOauthClientId=xxx \
  --set secrets.googleOauthClientSecret=xxx
```

### External Secrets (Production)

For production, use the External Secrets Operator instead of inline secrets:

```yaml
externalSecrets:
  enabled: true
  provider: aws  # aws | gcp | azure
  aws:
    region: us-east-1
    secretName: friday/production
```

## Cloud-Specific Notes

### AWS EKS

```yaml
ingress:
  className: alb
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...
```

### GCP GKE

```yaml
ingress:
  className: gce
  annotations:
    kubernetes.io/ingress.global-static-ip-name: friday-ip
    networking.gke.io/managed-certificates: friday-cert
```

### Azure AKS

```yaml
ingress:
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
```

## Monitoring Setup

When using the Prometheus Operator (e.g., kube-prometheus-stack):

```yaml
monitoring:
  enabled: true
  alerts:
    enabled: true
  grafana:
    enabled: true
```

This creates:
- **ServiceMonitor**: Auto-configures Prometheus to scrape `/metrics` on port 18789
- **PrometheusRule**: 9 alert rules (high error rate, latency, memory, audit chain, etc.)
- **Grafana Dashboard ConfigMap**: Auto-discovered by Grafana sidecar

## Upgrading

```bash
helm upgrade friday deploy/helm/friday \
  -f deploy/helm/friday/values-production.yaml \
  --set image.core.tag=2026.2.17
```

## Helm Tests

```bash
helm test friday --namespace friday
```

This runs a test pod that curls the core `/health` endpoint.

## Troubleshooting

```bash
# Check pod status
kubectl get pods -n friday -l app.kubernetes.io/part-of=friday

# View core logs
kubectl logs -n friday -l app.kubernetes.io/component=core

# Describe a failing pod
kubectl describe pod -n friday <pod-name>

# Port-forward to core for local debugging
kubectl port-forward -n friday svc/friday-core 18789:18789
```

## Related Documentation

- [Architecture Overview](../development/architecture.md)
- [Security Model](../security/security-model.md)
- [ADR 042: Kubernetes Deployment](../adr/042-kubernetes-deployment.md)
- [ADR 043: Kubernetes Observability](../adr/043-kubernetes-observability.md)
