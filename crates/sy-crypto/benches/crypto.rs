//! Benchmarks for sy-crypto primitives.

use criterion::{Criterion, black_box, criterion_group, criterion_main};
use sy_crypto::*;

fn bench_sha256(c: &mut Criterion) {
    let data_64 = vec![0xABu8; 64];
    let data_1k = vec![0xABu8; 1024];
    let data_1m = vec![0xABu8; 1_048_576];

    c.bench_function("sha256 64B", |b| b.iter(|| sha256(black_box(&data_64))));
    c.bench_function("sha256 1KB", |b| b.iter(|| sha256(black_box(&data_1k))));
    c.bench_function("sha256 1MB", |b| b.iter(|| sha256(black_box(&data_1m))));
}

fn bench_md5(c: &mut Criterion) {
    let data = vec![0xABu8; 1024];
    c.bench_function("md5 1KB", |b| b.iter(|| md5(black_box(&data))));
}

fn bench_hmac_sha256(c: &mut Criterion) {
    let data = vec![0xABu8; 256];
    let key = b"benchmark-signing-key-32-bytes!!";
    c.bench_function("hmac_sha256 256B", |b| {
        b.iter(|| hmac_sha256(black_box(&data), black_box(key)))
    });
}

fn bench_secure_compare(c: &mut Criterion) {
    let a = vec![0xAAu8; 64];
    let b_eq = a.clone();
    let b_ne = vec![0xBBu8; 64];

    c.bench_function("secure_compare 64B (equal)", |b| {
        b.iter(|| secure_compare(black_box(&a), black_box(&b_eq)))
    });
    c.bench_function("secure_compare 64B (not equal)", |b| {
        b.iter(|| secure_compare(black_box(&a), black_box(&b_ne)))
    });
}

fn bench_aes_256_gcm(c: &mut Criterion) {
    let key = random_bytes(32);
    let iv = random_bytes(12);
    let plaintext_256 = vec![0xABu8; 256];
    let plaintext_4k = vec![0xABu8; 4096];
    let ciphertext_256 = aes_256_gcm_encrypt(&plaintext_256, &key, &iv).unwrap();
    let ciphertext_4k = aes_256_gcm_encrypt(&plaintext_4k, &key, &iv).unwrap();

    c.bench_function("aes_256_gcm_encrypt 256B", |b| {
        b.iter(|| aes_256_gcm_encrypt(black_box(&plaintext_256), &key, &iv))
    });
    c.bench_function("aes_256_gcm_encrypt 4KB", |b| {
        b.iter(|| aes_256_gcm_encrypt(black_box(&plaintext_4k), &key, &iv))
    });
    c.bench_function("aes_256_gcm_decrypt 256B", |b| {
        b.iter(|| aes_256_gcm_decrypt(black_box(&ciphertext_256), &key, &iv))
    });
    c.bench_function("aes_256_gcm_decrypt 4KB", |b| {
        b.iter(|| aes_256_gcm_decrypt(black_box(&ciphertext_4k), &key, &iv))
    });
}

fn bench_x25519(c: &mut Criterion) {
    c.bench_function("x25519_keypair", |b| b.iter(x25519_keypair));

    let (sk_a, _) = x25519_keypair();
    let (_, pk_b) = x25519_keypair();
    c.bench_function("x25519_diffie_hellman", |b| {
        b.iter(|| x25519_diffie_hellman(black_box(&sk_a), black_box(&pk_b)))
    });
}

fn bench_ed25519(c: &mut Criterion) {
    c.bench_function("ed25519_keypair", |b| b.iter(ed25519_keypair));

    let (sk, pk) = ed25519_keypair();
    let msg = b"SecureYeoman benchmark message for Ed25519 signing";
    let sig = ed25519_sign(msg, &sk).unwrap();

    c.bench_function("ed25519_sign", |b| {
        b.iter(|| ed25519_sign(black_box(msg), black_box(&sk)))
    });
    c.bench_function("ed25519_verify", |b| {
        b.iter(|| ed25519_verify(black_box(msg), black_box(&sig), black_box(&pk)))
    });
}

fn bench_hkdf(c: &mut Criterion) {
    let ikm = random_bytes(32);
    let salt = random_bytes(16);
    let info = b"secureyeoman-bench";

    c.bench_function("hkdf_sha256 32B output", |b| {
        b.iter(|| hkdf_sha256(black_box(&ikm), black_box(&salt), black_box(info), 32))
    });
}

fn bench_random_bytes(c: &mut Criterion) {
    c.bench_function("random_bytes 32", |b| b.iter(|| random_bytes(32)));
    c.bench_function("random_bytes 256", |b| b.iter(|| random_bytes(256)));
}

criterion_group!(
    benches,
    bench_sha256,
    bench_md5,
    bench_hmac_sha256,
    bench_secure_compare,
    bench_aes_256_gcm,
    bench_x25519,
    bench_ed25519,
    bench_hkdf,
    bench_random_bytes,
);
criterion_main!(benches);
