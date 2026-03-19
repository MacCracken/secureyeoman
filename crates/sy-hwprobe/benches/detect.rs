//! Benchmarks for hardware detection.

use criterion::{Criterion, criterion_group, criterion_main};
use sy_hwprobe::*;

fn bench_probe_all(c: &mut Criterion) {
    c.bench_function("probe_all", |b| b.iter(probe_all));
}

fn bench_probe_family_gpu(c: &mut Criterion) {
    c.bench_function("probe_family(gpu)", |b| b.iter(|| probe_family("gpu")));
}

fn bench_probe_family_tpu(c: &mut Criterion) {
    c.bench_function("probe_family(tpu)", |b| b.iter(|| probe_family("tpu")));
}

fn bench_probe_family_npu(c: &mut Criterion) {
    c.bench_function("probe_family(npu)", |b| b.iter(|| probe_family("npu")));
}

fn bench_device_new(c: &mut Criterion) {
    c.bench_function("AcceleratorDevice::new", |b| {
        b.iter(|| types::AcceleratorDevice::new("NVIDIA RTX 4090", "nvidia", "gpu"))
    });
}

fn bench_device_serialize(c: &mut Criterion) {
    let dev = types::AcceleratorDevice::new("NVIDIA RTX 4090", "nvidia", "gpu");
    c.bench_function("AcceleratorDevice serialize", |b| {
        b.iter(|| serde_json::to_string(&dev))
    });
}

fn bench_probe_all_serialize(c: &mut Criterion) {
    c.bench_function("probe_all + serialize", |b| {
        b.iter(|| {
            let devices = probe_all();
            serde_json::to_string(&devices)
        })
    });
}

criterion_group!(
    benches,
    bench_probe_all,
    bench_probe_family_gpu,
    bench_probe_family_tpu,
    bench_probe_family_npu,
    bench_device_new,
    bench_device_serialize,
    bench_probe_all_serialize,
);
criterion_main!(benches);
