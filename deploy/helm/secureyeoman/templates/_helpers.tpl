{{/*
Expand the name of the chart.
*/}}
{{- define "secureyeoman.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "secureyeoman.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "secureyeoman.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "secureyeoman.labels" -}}
helm.sh/chart: {{ include "secureyeoman.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/part-of: secureyeoman
{{- end }}

{{/*
Component labels — call with (dict "context" $ "component" "core")
*/}}
{{- define "secureyeoman.componentLabels" -}}
{{ include "secureyeoman.labels" .context }}
app.kubernetes.io/name: {{ include "secureyeoman.name" .context }}-{{ .component }}
app.kubernetes.io/instance: {{ .context.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Component selector labels
*/}}
{{- define "secureyeoman.selectorLabels" -}}
app.kubernetes.io/name: {{ include "secureyeoman.name" .context }}-{{ .component }}
app.kubernetes.io/instance: {{ .context.Release.Name }}
{{- end }}

{{/*
Service account name
*/}}
{{- define "secureyeoman.serviceAccountName" -}}
{{- if .Values.serviceAccount.name }}
{{- .Values.serviceAccount.name }}
{{- else }}
{{- include "secureyeoman.fullname" . }}
{{- end }}
{{- end }}

{{/*
Namespace
*/}}
{{- define "secureyeoman.namespace" -}}
{{- default .Release.Namespace .Values.namespace }}
{{- end }}
