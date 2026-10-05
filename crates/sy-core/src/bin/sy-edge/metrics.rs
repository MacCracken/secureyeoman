//! System metrics collector — CPU, memory, disk usage, uptime.

use serde::Serialize;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use tokio::task::JoinHandle;

const SAMPLE_INTERVAL: Duration = Duration::from_secs(10);
const MAX_HISTORY: usize = 360; // 1 hour at 10s intervals

#[derive(Debug, Clone, Serialize)]
pub struct MetricsSample {
    pub cpu_percent: f32,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub disk_used_percent: f32,
    pub uptime_seconds: u64,
    pub timestamp: String,
}

pub struct MetricsCollector {
    history: Arc<RwLock<Vec<MetricsSample>>>,
    started_at: Instant,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            history: Arc::new(RwLock::new(Vec::with_capacity(MAX_HISTORY))),
            started_at: Instant::now(),
        }
    }

    /// Sample every `SAMPLE_INTERVAL` into the history. Requests read the
    /// latest sample; nothing samples on the request path, where a full
    /// system scan per call let anyone reaching the public Prometheus route
    /// keep the device busy.
    pub fn start(&self) -> JoinHandle<()> {
        let history = self.history.clone();
        let started_at = self.started_at;

        tokio::spawn(async move {
            let mut sampler = Some(Sampler::new());
            loop {
                // Reading /proc and statvfs can block (a hung network mount),
                // so it runs off the async workers.
                let Some(mut s) = sampler.take() else { break };
                let Ok((s, sample)) = tokio::task::spawn_blocking(move || {
                    let sample = s.sample(started_at);
                    (s, sample)
                })
                .await
                else {
                    break;
                };
                sampler = Some(s);
                if let Ok(mut h) = history.write() {
                    if h.len() >= MAX_HISTORY {
                        h.remove(0);
                    }
                    h.push(sample);
                }
                tokio::time::sleep(SAMPLE_INTERVAL).await;
            }
        })
    }

    /// Take a sample now, on this thread (tests drive the routes without the
    /// sampler task).
    #[cfg(test)]
    pub fn record_now(&self) {
        let sample = Sampler::new().sample(self.started_at);
        self.history.write().unwrap().push(sample);
    }

    /// The latest sample (zeros, but a live uptime, before the first one).
    fn latest(&self) -> MetricsSample {
        let mut sample = self
            .history
            .read()
            .ok()
            .and_then(|h| h.last().cloned())
            .unwrap_or_else(|| MetricsSample {
                cpu_percent: 0.0,
                memory_used_mb: 0,
                memory_total_mb: 0,
                disk_used_percent: 0.0,
                uptime_seconds: 0,
                timestamp: now_rfc3339(),
            });
        sample.uptime_seconds = self.started_at.elapsed().as_secs();
        sample
    }

    pub fn current(&self) -> serde_json::Value {
        serde_json::to_value(self.latest()).unwrap_or_default()
    }

    pub fn history(&self, minutes: u32) -> serde_json::Value {
        let Ok(h) = self.history.read() else {
            return serde_json::Value::Array(Vec::new());
        };
        let samples_needed = (minutes as usize * 6).min(h.len()); // 6 samples per minute
        let start = h.len().saturating_sub(samples_needed);
        serde_json::to_value(&h[start..]).unwrap_or_default()
    }

    pub fn prometheus(&self) -> String {
        let sample = self.latest();
        format!(
            "# HELP sy_edge_cpu_percent CPU usage percentage\n\
             # TYPE sy_edge_cpu_percent gauge\n\
             sy_edge_cpu_percent {:.1}\n\
             # HELP sy_edge_memory_used_mb Memory used in MB\n\
             # TYPE sy_edge_memory_used_mb gauge\n\
             sy_edge_memory_used_mb {}\n\
             # HELP sy_edge_memory_total_mb Total memory in MB\n\
             # TYPE sy_edge_memory_total_mb gauge\n\
             sy_edge_memory_total_mb {}\n\
             # HELP sy_edge_uptime_seconds Uptime in seconds\n\
             # TYPE sy_edge_uptime_seconds counter\n\
             sy_edge_uptime_seconds {}\n",
            sample.cpu_percent,
            sample.memory_used_mb,
            sample.memory_total_mb,
            sample.uptime_seconds,
        )
    }
}

/// Long-lived sysinfo handles: CPU usage is the change between two
/// refreshes, so a fresh `System` per sample always read 0%.
struct Sampler {
    sys: sysinfo::System,
    disks: sysinfo::Disks,
}

impl Sampler {
    fn new() -> Self {
        let mut sys = sysinfo::System::new();
        sys.refresh_cpu_usage();
        // The first reading needs an interval behind it.
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        Self {
            sys,
            disks: sysinfo::Disks::new_with_refreshed_list(),
        }
    }

    fn sample(&mut self, started_at: Instant) -> MetricsSample {
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();
        self.disks.refresh(true);
        let disk_percent = self
            .disks
            .list()
            .first()
            .map(|d| {
                let total = d.total_space() as f64;
                if total > 0.0 {
                    ((total - d.available_space() as f64) / total * 100.0) as f32
                } else {
                    0.0
                }
            })
            .unwrap_or(0.0);

        MetricsSample {
            cpu_percent: self.sys.global_cpu_usage(),
            memory_used_mb: self.sys.used_memory() / (1024 * 1024),
            memory_total_mb: self.sys.total_memory() / (1024 * 1024),
            disk_used_percent: disk_percent,
            uptime_seconds: started_at.elapsed().as_secs(),
            timestamp: now_rfc3339(),
        }
    }
}

/// The sample time as RFC 3339 (it was Unix seconds with a stray `Z`, which
/// no date parser reads).
fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}
