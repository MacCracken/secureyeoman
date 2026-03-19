//! Benchmarks for hardware detection via ai-hwaccel.

use criterion::{Criterion, criterion_group, criterion_main};
use sy_hwprobe::*;

fn bench_probe_all(c: &mut Criterion) {
    c.bench_function("probe_all (ai-hwaccel)", |b| b.iter(probe_all));
}

fn bench_probe_family_gpu(c: &mut Criterion) {
    c.bench_function("probe_family(gpu)", |b| b.iter(|| probe_family("gpu")));
}

fn bench_probe_family_tpu(c: &mut Criterion) {
    c.bench_function("probe_family(tpu)", |b| b.iter(|| probe_family("tpu")));
}

fn bench_detect_registry(c: &mut Criterion) {
    c.bench_function("detect_registry (full)", |b| b.iter(detect_registry));
}

fn bench_device_serialize(c: &mut Criterion) {
    let dev = types::AcceleratorDevice::new("NVIDIA RTX 4090", "nvidia", "gpu");
    c.bench_function("AcceleratorDevice serialize", |b| {
        b.iter(|| serde_json::to_string(&dev))
    });
}

fn bench_quantization_suggest(c: &mut Criterion) {
    let registry = detect_registry();
    c.bench_function("suggest_quantization 7B", |b| {
        b.iter(|| registry.suggest_quantization(7_000_000_000))
    });
}

fn bench_sharding_plan(c: &mut Criterion) {
    let registry = detect_registry();
    c.bench_function("plan_sharding 70B BF16", |b| {
        b.iter(|| {
            registry.plan_sharding(
                70_000_000_000,
                &ai_hwaccel::QuantizationLevel::BFloat16,
            )
        })
    });
}

criterion_group!(
    benches,
    bench_probe_all,
    bench_probe_family_gpu,
    bench_probe_family_tpu,
    bench_detect_registry,
    bench_device_serialize,
    bench_quantization_suggest,
    bench_sharding_plan,
);
criterion_main!(benches);
