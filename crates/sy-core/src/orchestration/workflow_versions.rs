//! Workflow versioning — record snapshots on change, tag releases, diff,
//! roll back and detect drift. A port of the TS `WorkflowVersionManager`;
//! storage is `workflow.versions` (see [`crate::db::workflow`]).

use sqlx::PgPool;

use crate::db::workflow::{self, NewVersion, WorkflowUpdate, WorkflowVersionRow};

/// Definition fields compared between snapshots (the TS `TRACKED_FIELDS`).
const TRACKED_FIELDS: &[&str] = &[
    "name",
    "description",
    "steps",
    "edges",
    "triggers",
    "isEnabled",
    "autonomyLevel",
    "triggerMode",
];

/// Tracked fields whose values differ between two snapshots.
pub fn changed_fields(a: &serde_json::Value, b: &serde_json::Value) -> Vec<String> {
    let null = serde_json::Value::Null;
    TRACKED_FIELDS
        .iter()
        .filter(|f| a.get(**f).unwrap_or(&null) != b.get(**f).unwrap_or(&null))
        .map(|f| f.to_string())
        .collect()
}

fn snapshot_text(snapshot: &serde_json::Value) -> String {
    serde_json::to_string_pretty(snapshot).unwrap_or_default()
}

/// Upper bound on the LCS table (lines × lines) before [`unified_diff`] gives
/// up on a minimal diff: the table is O(m·n) memory, and an allocation failure
/// under `panic = "abort"` would take the server down.
const MAX_LCS_CELLS: usize = 4_000_000;

#[derive(Clone, Copy, PartialEq)]
enum Op {
    Same,
    Add,
    Remove,
}

/// A unified diff (3 lines of context) between two texts, as the TS
/// `computeUnifiedDiff` produced it. Empty when they are identical.
pub fn unified_diff(a: &str, b: &str, label_a: &str, label_b: &str) -> String {
    if a == b {
        return String::new();
    }
    let la: Vec<&str> = a.split('\n').collect();
    let lb: Vec<&str> = b.split('\n').collect();
    let (m, n) = (la.len(), lb.len());

    // (op, line, line number in a, line number in b) — 1-based, 0 = n/a.
    let mut entries: Vec<(Op, &str, usize, usize)> = Vec::with_capacity(m + n);
    if (m + 1).saturating_mul(n + 1) > MAX_LCS_CELLS {
        entries.extend(
            la.iter()
                .enumerate()
                .map(|(i, l)| (Op::Remove, *l, i + 1, 0)),
        );
        entries.extend(lb.iter().enumerate().map(|(j, l)| (Op::Add, *l, 0, j + 1)));
    } else {
        let width = n + 1;
        let mut dp = vec![0u32; (m + 1) * width];
        for i in 1..=m {
            for j in 1..=n {
                dp[i * width + j] = if la[i - 1] == lb[j - 1] {
                    dp[(i - 1) * width + j - 1] + 1
                } else {
                    dp[(i - 1) * width + j].max(dp[i * width + j - 1])
                };
            }
        }
        let (mut i, mut j) = (m, n);
        while i > 0 || j > 0 {
            if i > 0 && j > 0 && la[i - 1] == lb[j - 1] {
                entries.push((Op::Same, la[i - 1], i, j));
                i -= 1;
                j -= 1;
            } else if j > 0 && (i == 0 || dp[i * width + j - 1] >= dp[(i - 1) * width + j]) {
                entries.push((Op::Add, lb[j - 1], 0, j));
                j -= 1;
            } else {
                entries.push((Op::Remove, la[i - 1], i, 0));
                i -= 1;
            }
        }
        entries.reverse();
    }

    let mut out = vec![format!("--- {label_a}"), format!("+++ {label_b}")];
    const CONTEXT: usize = 3;
    let mut hunk: Option<(usize, usize)> = None;
    for (idx, e) in entries.iter().enumerate() {
        if e.0 == Op::Same {
            continue;
        }
        let start = idx.saturating_sub(CONTEXT);
        let end = (idx + CONTEXT).min(entries.len() - 1);
        hunk = match hunk {
            Some((s, e_end)) if start <= e_end + 1 => Some((s, end)),
            Some((s, e_end)) => {
                emit_hunk(&entries[s..=e_end], &mut out);
                Some((start, end))
            }
            None => Some((start, end)),
        };
    }
    if let Some((s, e)) = hunk {
        emit_hunk(&entries[s..=e], &mut out);
    }
    out.join("\n")
}

fn emit_hunk(entries: &[(Op, &str, usize, usize)], out: &mut Vec<String>) {
    let a_lines = entries.iter().filter(|e| e.0 != Op::Add);
    let b_lines = entries.iter().filter(|e| e.0 != Op::Remove);
    let a_start = a_lines.clone().find(|e| e.2 > 0).map_or(0, |e| e.2);
    let b_start = b_lines.clone().find(|e| e.3 > 0).map_or(0, |e| e.3);
    out.push(format!(
        "@@ -{a_start},{} +{b_start},{} @@",
        a_lines.count(),
        b_lines.count()
    ));
    for (op, line, _, _) in entries {
        let sign = match op {
            Op::Same => ' ',
            Op::Add => '+',
            Op::Remove => '-',
        };
        out.push(format!("{sign}{line}"));
    }
}

/// The next release tag for `base` (a `Y.M.D` date): `base`, then `base-2`,
/// `base-3`, … — the TS `generateNextTag` scheme.
pub fn next_tag(base: &str, existing: &[String]) -> String {
    let mut max_suffix = 0u64;
    let mut any = false;
    for tag in existing.iter().filter(|t| t.starts_with(base)) {
        any = true;
        if tag == base {
            max_suffix = max_suffix.max(1);
        } else if let Some(n) = tag
            .rsplit_once('-')
            .and_then(|(_, n)| n.parse::<u64>().ok())
        {
            max_suffix = max_suffix.max(n + 1);
        }
    }
    if !any || max_suffix == 0 {
        base.to_string()
    } else {
        format!("{base}-{max_suffix}")
    }
}

fn label(v: &WorkflowVersionRow) -> String {
    v.version_tag
        .clone()
        .unwrap_or_else(|| v.id.chars().take(8).collect())
}

/// Snapshot the workflow's current state as a new version, with a diff and
/// the changed fields against the previous version. `None` if the workflow
/// does not exist.
pub async fn record_version(
    pool: &PgPool,
    workflow_id: uuid::Uuid,
    author: &str,
) -> Result<Option<WorkflowVersionRow>, sqlx::Error> {
    let Some(definition) = workflow::get_workflow(pool, workflow_id).await? else {
        return Ok(None);
    };
    let snapshot = definition.to_definition();
    let previous = workflow::latest_version(pool, workflow_id, false).await?;
    let (diff, changed) = match &previous {
        Some(prev) => (
            Some(unified_diff(
                &snapshot_text(&prev.snapshot),
                &snapshot_text(&snapshot),
                "previous",
                "current",
            )),
            changed_fields(&prev.snapshot, &snapshot),
        ),
        None => (None, Vec::new()),
    };
    let version = workflow::create_version(
        pool,
        &NewVersion {
            workflow_id,
            snapshot: &snapshot,
            diff_summary: diff.as_deref(),
            changed_fields: &changed,
            author,
        },
    )
    .await?;
    Ok(Some(version))
}

/// Record a version and tag it as a release (a generated `Y.M.D[-n]` tag
/// unless one is given). `None` if the workflow does not exist.
pub async fn tag_release(
    pool: &PgPool,
    workflow_id: uuid::Uuid,
    custom_tag: Option<&str>,
    author: &str,
) -> Result<Option<WorkflowVersionRow>, sqlx::Error> {
    let Some(version) = record_version(pool, workflow_id, author).await? else {
        return Ok(None);
    };
    let tag = match custom_tag {
        Some(t) => t.to_string(),
        None => {
            let base = chrono::Utc::now().format("%Y.%-m.%-d").to_string();
            let existing = workflow::tags_with_prefix(pool, workflow_id, &base).await?;
            next_tag(&base, &existing)
        }
    };
    Ok(Some(
        workflow::tag_version(pool, &version.id, &tag)
            .await?
            .unwrap_or(version),
    ))
}

/// Restore the tracked fields of `version_id` and record the result as a new
/// version. `None` if the version does not belong to the workflow.
pub async fn rollback(
    pool: &PgPool,
    workflow_id: uuid::Uuid,
    version_id: &str,
    author: &str,
) -> Result<Option<WorkflowVersionRow>, sqlx::Error> {
    let Some(target) = workflow::get_version(pool, workflow_id, version_id).await? else {
        return Ok(None);
    };
    let update = WorkflowUpdate::from_snapshot(&target.snapshot);
    if workflow::update_workflow(pool, workflow_id, &update)
        .await?
        .is_none()
    {
        return Ok(None);
    }
    record_version(pool, workflow_id, author).await
}

/// Unified diff between two versions of a workflow (by id or tag). `None` if
/// either is missing.
pub async fn diff_versions(
    pool: &PgPool,
    workflow_id: uuid::Uuid,
    a: &str,
    b: &str,
) -> Result<Option<String>, sqlx::Error> {
    let (Some(va), Some(vb)) = (
        workflow::get_version(pool, workflow_id, a).await?,
        workflow::get_version(pool, workflow_id, b).await?,
    ) else {
        return Ok(None);
    };
    Ok(Some(unified_diff(
        &snapshot_text(&va.snapshot),
        &snapshot_text(&vb.snapshot),
        &label(&va),
        &label(&vb),
    )))
}

/// Changes since the last tagged release (the TS `DriftSummary`). `None` if
/// the workflow does not exist.
pub async fn drift(
    pool: &PgPool,
    workflow_id: uuid::Uuid,
) -> Result<Option<serde_json::Value>, sqlx::Error> {
    let Some(definition) = workflow::get_workflow(pool, workflow_id).await? else {
        return Ok(None);
    };
    let Some(tagged) = workflow::latest_version(pool, workflow_id, true).await? else {
        return Ok(Some(serde_json::json!({
            "lastTaggedVersion": null,
            "lastTaggedAt": null,
            "uncommittedChanges": 0,
            "changedFields": [],
            "diffSummary": "",
        })));
    };
    let current = definition.to_definition();
    let changed = changed_fields(&tagged.snapshot, &current);
    let diff = unified_diff(
        &snapshot_text(&tagged.snapshot),
        &snapshot_text(&current),
        tagged.version_tag.as_deref().unwrap_or("tagged"),
        "current",
    );
    Ok(Some(serde_json::json!({
        "lastTaggedVersion": tagged.version_tag,
        "lastTaggedAt": tagged.created_at,
        "uncommittedChanges": changed.len(),
        "changedFields": changed,
        "diffSummary": diff,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_texts_have_no_diff() {
        assert_eq!(unified_diff("a\nb", "a\nb", "x", "y"), "");
    }

    #[test]
    fn diff_matches_the_ts_format() {
        let a = "one\ntwo\nthree\nfour\nfive";
        let b = "one\ntwo\n3\nfour\nfive";
        assert_eq!(
            unified_diff(a, b, "previous", "current"),
            "--- previous\n+++ current\n@@ -1,5 +1,5 @@\n one\n two\n-three\n+3\n four\n five"
        );
    }

    #[test]
    fn distant_changes_make_separate_hunks() {
        let a: Vec<String> = (1..=20).map(|i| i.to_string()).collect();
        let mut b = a.clone();
        b[1] = "two".into();
        b[18] = "nineteen".into();
        let diff = unified_diff(&a.join("\n"), &b.join("\n"), "a", "b");
        assert_eq!(diff.matches("@@ ").count(), 2, "{diff}");
    }

    #[test]
    fn oversized_inputs_fall_back_to_a_full_replacement() {
        let a = (0..2100)
            .map(|i| format!("a{i}"))
            .collect::<Vec<_>>()
            .join("\n");
        let b = (0..2100)
            .map(|i| format!("b{i}"))
            .collect::<Vec<_>>()
            .join("\n");
        let diff = unified_diff(&a, &b, "a", "b");
        assert!(diff.starts_with("--- a\n+++ b\n@@ -1,2100 +1,2100 @@"));
    }

    #[test]
    fn changed_fields_only_tracks_definition_content() {
        let a = serde_json::json!({"name": "x", "steps": [1], "updatedAt": 1});
        let b = serde_json::json!({"name": "x", "steps": [2], "updatedAt": 2});
        assert_eq!(changed_fields(&a, &b), vec!["steps".to_string()]);
    }

    #[test]
    fn tags_count_up_within_a_day() {
        assert_eq!(next_tag("2026.9.25", &[]), "2026.9.25");
        assert_eq!(next_tag("2026.9.25", &["2026.9.25".into()]), "2026.9.25-1");
        assert_eq!(
            next_tag("2026.9.25", &["2026.9.25".into(), "2026.9.25-1".into()]),
            "2026.9.25-2"
        );
    }
}
