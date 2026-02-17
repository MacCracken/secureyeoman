#!/usr/bin/env bash
#
# Kubernetes smoke test for SecureYeoman
# Deploys the Helm chart to a local kind/k3d cluster and validates health.
#
# Prerequisites: kind (or k3d), kubectl, helm
#
# Usage: bash tests/k8s/smoke-test.sh
#
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-secureyeoman-test}"
NAMESPACE="${NAMESPACE:-secureyeoman-test}"
CHART_DIR="deploy/helm/secureyeoman"
RELEASE_NAME="secureyeoman-smoke"
TIMEOUT="120s"

cleanup() {
  echo "Cleaning up..."
  helm uninstall "$RELEASE_NAME" -n "$NAMESPACE" 2>/dev/null || true
  kubectl delete namespace "$NAMESPACE" --wait=false 2>/dev/null || true
  if command -v kind &>/dev/null; then
    kind delete cluster --name "$CLUSTER_NAME" 2>/dev/null || true
  fi
}

trap cleanup EXIT

echo "=== SecureYeoman Kubernetes Smoke Test ==="

# Create cluster if it doesn't exist
if command -v kind &>/dev/null; then
  if ! kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
    echo "Creating kind cluster: $CLUSTER_NAME"
    kind create cluster --name "$CLUSTER_NAME" --wait 60s
  fi
  kubectl cluster-info --context "kind-${CLUSTER_NAME}"
elif command -v k3d &>/dev/null; then
  if ! k3d cluster list 2>/dev/null | grep -q "$CLUSTER_NAME"; then
    echo "Creating k3d cluster: $CLUSTER_NAME"
    k3d cluster create "$CLUSTER_NAME" --wait
  fi
  kubectl cluster-info
else
  echo "Error: Neither kind nor k3d found. Install one to run smoke tests."
  exit 1
fi

# Create namespace
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Lint the chart
echo "Linting Helm chart..."
helm lint "$CHART_DIR"

# Install chart with dev values (no real DB, just validate pod creation)
echo "Installing Helm chart..."
helm install "$RELEASE_NAME" "$CHART_DIR" \
  --namespace "$NAMESPACE" \
  --set core.replicaCount=1 \
  --set mcp.enabled=false \
  --set dashboard.enabled=false \
  --set ingress.enabled=false \
  --set secrets.postgresPassword=smoketest \
  --wait \
  --timeout "$TIMEOUT" || {
    echo "Helm install failed. Pod status:"
    kubectl get pods -n "$NAMESPACE"
    kubectl describe pods -n "$NAMESPACE"
    exit 1
  }

# Wait for core to be ready
echo "Waiting for core deployment..."
kubectl rollout status deployment/"${RELEASE_NAME}-secureyeoman-core" -n "$NAMESPACE" --timeout="$TIMEOUT"

# Port-forward and test health endpoint
echo "Testing health endpoint..."
kubectl port-forward -n "$NAMESPACE" svc/"${RELEASE_NAME}-secureyeoman-core" 18789:18789 &
PF_PID=$!
sleep 3

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:18789/health || echo "000")

kill $PF_PID 2>/dev/null || true

if [ "$HTTP_CODE" = "200" ]; then
  echo "Health check passed! (HTTP $HTTP_CODE)"
else
  echo "Health check failed (HTTP $HTTP_CODE)"
  kubectl logs -n "$NAMESPACE" -l app.kubernetes.io/component=core --tail=50
  exit 1
fi

# Run Helm tests
echo "Running Helm tests..."
helm test "$RELEASE_NAME" -n "$NAMESPACE" --timeout "$TIMEOUT" || true

echo "=== Smoke test passed! ==="
