//! Bhava personality engine — NAPI bindings for Node.js.
//!
//! Exposes bhava's personality, mood, spirit, archetype, and preset APIs
//! to the TypeScript layer via JSON serialization.

use napi::bindgen_prelude::*;
use napi_derive::napi;

use bhava::archetype::{self, IdentityContent, IdentityLayer};
use bhava::mood::{self, Emotion, EmotionalState};
use bhava::presets;
use bhava::sentiment;
use bhava::spirit::Spirit;
use bhava::traits::{PersonalityProfile, TraitGroup, TraitKind, TraitLevel};

// ── Trait Level Mapping ────────────────────────────────────────────────────
//
// SY stores trait levels as descriptive strings ("casual", "dry", "formal").
// Bhava uses normalized levels ("lowest", "low", "balanced", "high", "highest").
// This mapping converts SY descriptive names → bhava TraitLevel.

fn sy_level_to_bhava(trait_key: &str, level: &str) -> Option<TraitLevel> {
    let lower = level.to_lowercase();
    if lower == "balanced" {
        return Some(TraitLevel::Balanced);
    }
    // Map each trait's SY descriptive names to bhava levels (positional)
    match (trait_key, lower.as_str()) {
        // formality: street → casual → [balanced] → formal → ceremonial
        ("formality", "street") => Some(TraitLevel::Lowest),
        ("formality", "casual") => Some(TraitLevel::Low),
        ("formality", "formal") => Some(TraitLevel::High),
        ("formality", "ceremonial") => Some(TraitLevel::Highest),
        // humor: deadpan → dry → [balanced] → witty → comedic
        ("humor", "deadpan") => Some(TraitLevel::Lowest),
        ("humor", "dry") => Some(TraitLevel::Low),
        ("humor", "witty") => Some(TraitLevel::High),
        ("humor", "comedic") => Some(TraitLevel::Highest),
        // verbosity: terse → concise → [balanced] → detailed → exhaustive
        ("verbosity", "terse") => Some(TraitLevel::Lowest),
        ("verbosity", "concise") => Some(TraitLevel::Low),
        ("verbosity", "detailed") => Some(TraitLevel::High),
        ("verbosity", "exhaustive") => Some(TraitLevel::Highest),
        // directness: evasive → diplomatic → [balanced] → candid → blunt
        ("directness", "evasive") => Some(TraitLevel::Lowest),
        ("directness", "diplomatic") => Some(TraitLevel::Low),
        ("directness", "candid") => Some(TraitLevel::High),
        ("directness", "blunt") => Some(TraitLevel::Highest),
        // warmth: cold → reserved → [balanced] → friendly → effusive
        ("warmth", "cold") => Some(TraitLevel::Lowest),
        ("warmth", "reserved") => Some(TraitLevel::Low),
        ("warmth", "friendly") => Some(TraitLevel::High),
        ("warmth", "effusive") => Some(TraitLevel::Highest),
        // empathy: detached → analytical → [balanced] → empathetic → compassionate
        ("empathy", "detached") => Some(TraitLevel::Lowest),
        ("empathy", "analytical") => Some(TraitLevel::Low),
        ("empathy", "empathetic") => Some(TraitLevel::High),
        ("empathy", "compassionate") => Some(TraitLevel::Highest),
        // patience: brisk → efficient → [balanced] → patient → nurturing
        ("patience", "brisk") => Some(TraitLevel::Lowest),
        ("patience", "efficient") => Some(TraitLevel::Low),
        ("patience", "patient") => Some(TraitLevel::High),
        ("patience", "nurturing") => Some(TraitLevel::Highest),
        // confidence: humble → modest → [balanced] → assertive → authoritative
        ("confidence", "humble") => Some(TraitLevel::Lowest),
        ("confidence", "modest") => Some(TraitLevel::Low),
        ("confidence", "assertive") => Some(TraitLevel::High),
        ("confidence", "authoritative") => Some(TraitLevel::Highest),
        // creativity: rigid → conventional → [balanced] → imaginative → avant-garde
        ("creativity", "rigid") => Some(TraitLevel::Lowest),
        ("creativity", "conventional") => Some(TraitLevel::Low),
        ("creativity", "imaginative") => Some(TraitLevel::High),
        ("creativity", "avant-garde") => Some(TraitLevel::Highest),
        // risk_tolerance: risk-averse → cautious → [balanced] → bold → reckless
        ("risk_tolerance", "risk-averse") => Some(TraitLevel::Lowest),
        ("risk_tolerance", "cautious") => Some(TraitLevel::Low),
        ("risk_tolerance", "bold") => Some(TraitLevel::High),
        ("risk_tolerance", "reckless") => Some(TraitLevel::Highest),
        // curiosity: narrow → focused → [balanced] → curious → exploratory
        ("curiosity", "narrow") => Some(TraitLevel::Lowest),
        ("curiosity", "focused") => Some(TraitLevel::Low),
        ("curiosity", "curious") => Some(TraitLevel::High),
        ("curiosity", "exploratory") => Some(TraitLevel::Highest),
        // skepticism: gullible → trusting → [balanced] → skeptical → contrarian
        ("skepticism", "gullible") => Some(TraitLevel::Lowest),
        ("skepticism", "trusting") => Some(TraitLevel::Low),
        ("skepticism", "skeptical") => Some(TraitLevel::High),
        ("skepticism", "contrarian") => Some(TraitLevel::Highest),
        // autonomy: dependent → consultative → [balanced] → proactive → autonomous
        ("autonomy", "dependent") => Some(TraitLevel::Lowest),
        ("autonomy", "consultative") => Some(TraitLevel::Low),
        ("autonomy", "proactive") => Some(TraitLevel::High),
        ("autonomy", "autonomous") => Some(TraitLevel::Highest),
        // pedagogy: terse-answer → answer-focused → [balanced] → explanatory → socratic
        ("pedagogy", "terse-answer") => Some(TraitLevel::Lowest),
        ("pedagogy", "answer-focused") => Some(TraitLevel::Low),
        ("pedagogy", "explanatory") => Some(TraitLevel::High),
        ("pedagogy", "socratic") => Some(TraitLevel::Highest),
        // precision: approximate → loose → [balanced] → precise → meticulous
        ("precision", "approximate") => Some(TraitLevel::Lowest),
        ("precision", "loose") => Some(TraitLevel::Low),
        ("precision", "precise") => Some(TraitLevel::High),
        ("precision", "meticulous") => Some(TraitLevel::Highest),
        _ => None,
    }
}

fn bhava_level_to_sy(trait_key: &str, level: TraitLevel) -> &'static str {
    match level {
        TraitLevel::Balanced => "balanced",
        _ => match (trait_key, level) {
            ("formality", TraitLevel::Lowest) => "street",
            ("formality", TraitLevel::Low) => "casual",
            ("formality", TraitLevel::High) => "formal",
            ("formality", TraitLevel::Highest) => "ceremonial",
            ("humor", TraitLevel::Lowest) => "deadpan",
            ("humor", TraitLevel::Low) => "dry",
            ("humor", TraitLevel::High) => "witty",
            ("humor", TraitLevel::Highest) => "comedic",
            ("verbosity", TraitLevel::Lowest) => "terse",
            ("verbosity", TraitLevel::Low) => "concise",
            ("verbosity", TraitLevel::High) => "detailed",
            ("verbosity", TraitLevel::Highest) => "exhaustive",
            ("directness", TraitLevel::Lowest) => "evasive",
            ("directness", TraitLevel::Low) => "diplomatic",
            ("directness", TraitLevel::High) => "candid",
            ("directness", TraitLevel::Highest) => "blunt",
            ("warmth", TraitLevel::Lowest) => "cold",
            ("warmth", TraitLevel::Low) => "reserved",
            ("warmth", TraitLevel::High) => "friendly",
            ("warmth", TraitLevel::Highest) => "effusive",
            ("empathy", TraitLevel::Lowest) => "detached",
            ("empathy", TraitLevel::Low) => "analytical",
            ("empathy", TraitLevel::High) => "empathetic",
            ("empathy", TraitLevel::Highest) => "compassionate",
            ("patience", TraitLevel::Lowest) => "brisk",
            ("patience", TraitLevel::Low) => "efficient",
            ("patience", TraitLevel::High) => "patient",
            ("patience", TraitLevel::Highest) => "nurturing",
            ("confidence", TraitLevel::Lowest) => "humble",
            ("confidence", TraitLevel::Low) => "modest",
            ("confidence", TraitLevel::High) => "assertive",
            ("confidence", TraitLevel::Highest) => "authoritative",
            ("creativity", TraitLevel::Lowest) => "rigid",
            ("creativity", TraitLevel::Low) => "conventional",
            ("creativity", TraitLevel::High) => "imaginative",
            ("creativity", TraitLevel::Highest) => "avant-garde",
            ("risk_tolerance", TraitLevel::Lowest) => "risk-averse",
            ("risk_tolerance", TraitLevel::Low) => "cautious",
            ("risk_tolerance", TraitLevel::High) => "bold",
            ("risk_tolerance", TraitLevel::Highest) => "reckless",
            ("curiosity", TraitLevel::Lowest) => "narrow",
            ("curiosity", TraitLevel::Low) => "focused",
            ("curiosity", TraitLevel::High) => "curious",
            ("curiosity", TraitLevel::Highest) => "exploratory",
            ("skepticism", TraitLevel::Lowest) => "gullible",
            ("skepticism", TraitLevel::Low) => "trusting",
            ("skepticism", TraitLevel::High) => "skeptical",
            ("skepticism", TraitLevel::Highest) => "contrarian",
            ("autonomy", TraitLevel::Lowest) => "dependent",
            ("autonomy", TraitLevel::Low) => "consultative",
            ("autonomy", TraitLevel::High) => "proactive",
            ("autonomy", TraitLevel::Highest) => "autonomous",
            ("pedagogy", TraitLevel::Lowest) => "terse-answer",
            ("pedagogy", TraitLevel::Low) => "answer-focused",
            ("pedagogy", TraitLevel::High) => "explanatory",
            ("pedagogy", TraitLevel::Highest) => "socratic",
            ("precision", TraitLevel::Lowest) => "approximate",
            ("precision", TraitLevel::Low) => "loose",
            ("precision", TraitLevel::High) => "precise",
            ("precision", TraitLevel::Highest) => "meticulous",
            _ => "balanced",
        },
    }
}

fn parse_trait_kind(s: &str) -> Option<TraitKind> {
    match s {
        "formality" => Some(TraitKind::Formality),
        "humor" => Some(TraitKind::Humor),
        "verbosity" => Some(TraitKind::Verbosity),
        "directness" => Some(TraitKind::Directness),
        "warmth" => Some(TraitKind::Warmth),
        "empathy" => Some(TraitKind::Empathy),
        "patience" => Some(TraitKind::Patience),
        "confidence" => Some(TraitKind::Confidence),
        "creativity" => Some(TraitKind::Creativity),
        "risk_tolerance" => Some(TraitKind::RiskTolerance),
        "curiosity" => Some(TraitKind::Curiosity),
        "skepticism" => Some(TraitKind::Skepticism),
        "autonomy" => Some(TraitKind::Autonomy),
        "pedagogy" => Some(TraitKind::Pedagogy),
        "precision" => Some(TraitKind::Precision),
        _ => None,
    }
}

fn trait_kind_to_str(k: TraitKind) -> &'static str {
    match k {
        TraitKind::Formality => "formality",
        TraitKind::Humor => "humor",
        TraitKind::Verbosity => "verbosity",
        TraitKind::Directness => "directness",
        TraitKind::Warmth => "warmth",
        TraitKind::Empathy => "empathy",
        TraitKind::Patience => "patience",
        TraitKind::Confidence => "confidence",
        TraitKind::Creativity => "creativity",
        TraitKind::RiskTolerance => "risk_tolerance",
        TraitKind::Curiosity => "curiosity",
        TraitKind::Skepticism => "skepticism",
        TraitKind::Autonomy => "autonomy",
        TraitKind::Pedagogy => "pedagogy",
        TraitKind::Precision => "precision",
        _ => "unknown",
    }
}

/// Build a PersonalityProfile from SY's trait map (Record<string, string>).
fn profile_from_sy_traits(
    name: &str,
    traits: &serde_json::Map<String, serde_json::Value>,
) -> PersonalityProfile {
    let mut profile = PersonalityProfile::new(name);
    for (key, value) in traits {
        if let Some(level_str) = value.as_str() {
            if let Some(kind) = parse_trait_kind(key) {
                if let Some(level) = sy_level_to_bhava(key, level_str) {
                    profile.set_trait(kind, level);
                }
            }
        }
    }
    profile
}

/// Serialize a PersonalityProfile to SY-compatible JSON with descriptive trait names.
fn profile_to_sy_json(profile: &PersonalityProfile) -> serde_json::Value {
    let mut traits = serde_json::Map::new();
    for &kind in TraitKind::ALL {
        let key = trait_kind_to_str(kind);
        let level = profile.get_trait(kind);
        let sy_name = bhava_level_to_sy(key, level);
        traits.insert(key.to_string(), serde_json::Value::String(sy_name.to_string()));
    }

    serde_json::json!({
        "name": profile.name,
        "description": profile.description,
        "traits": traits,
    })
}

// ── Personality Profile ────────────────────────────────────────────────────

/// Create a bhava PersonalityProfile from SY's trait map.
/// Input: name (string), traits_json (JSON object: { "formality": "casual", ... })
/// Returns: JSON profile with SY-compatible trait names.
#[napi]
pub fn bhava_create_profile(name: String, traits_json: String) -> Result<String> {
    let traits: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&traits_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    let profile = profile_from_sy_traits(&name, &traits);
    serde_json::to_string(&profile_to_sy_json(&profile))
        .map_err(|e| Error::from_reason(format!("{e}")))
}

/// Compose trait disposition prompt from SY trait map.
/// Returns: the "## Personality" section text from bhava's trait engine.
#[napi]
pub fn bhava_compose_trait_prompt(traits_json: String) -> Result<String> {
    let traits: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&traits_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    let profile = profile_from_sy_traits("_", &traits);
    Ok(profile.compose_prompt())
}

/// Compute personality compatibility (0.0-1.0) between two SY trait maps.
#[napi]
pub fn bhava_profile_compatibility(a_json: String, b_json: String) -> Result<f64> {
    let a: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&a_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    let b: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&b_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    let pa = profile_from_sy_traits("a", &a);
    let pb = profile_from_sy_traits("b", &b);
    Ok(pa.compatibility(&pb) as f64)
}

/// Export a personality profile as markdown.
#[napi]
pub fn bhava_profile_to_markdown(name: String, traits_json: String) -> Result<String> {
    let traits: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&traits_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    let profile = profile_from_sy_traits(&name, &traits);
    Ok(profile.to_markdown())
}

/// Import a personality profile from markdown. Returns JSON profile or error.
#[napi]
pub fn bhava_profile_from_markdown(markdown: String) -> Result<String> {
    let profile = PersonalityProfile::from_markdown(&markdown)
        .ok_or_else(|| Error::from_reason("Failed to parse personality markdown"))?;
    serde_json::to_string(&profile_to_sy_json(&profile))
        .map_err(|e| Error::from_reason(format!("{e}")))
}

// ── Presets ────────────────────────────────────────────────────────────────

/// List all available bhava preset IDs.
#[napi]
pub fn bhava_list_presets() -> String {
    serde_json::to_string(presets::list_presets()).unwrap_or_else(|_| "[]".to_string())
}

/// Get a preset by ID. Returns JSON { profile, identity } or error.
#[napi]
pub fn bhava_get_preset(id: String) -> Result<String> {
    let preset = presets::get_preset(&id)
        .ok_or_else(|| Error::from_reason(format!("Unknown preset: {id}")))?;

    let profile_json = profile_to_sy_json(&preset.profile);
    let identity_json = serde_json::json!({
        "soul": preset.identity.get(IdentityLayer::Soul),
        "spirit": preset.identity.get(IdentityLayer::Spirit),
        "brain": preset.identity.get(IdentityLayer::Brain),
        "body": preset.identity.get(IdentityLayer::Body),
        "heart": preset.identity.get(IdentityLayer::Heart),
    });

    let result = serde_json::json!({
        "id": preset.id,
        "name": preset.name,
        "summary": preset.summary,
        "profile": profile_json,
        "identity": identity_json,
    });

    serde_json::to_string(&result).map_err(|e| Error::from_reason(format!("{e}")))
}

// ── Archetypes / Identity ──────────────────────────────────────────────────

/// Compose the "In Our Image" cosmological preamble.
#[napi]
pub fn bhava_compose_preamble() -> String {
    archetype::compose_preamble()
}

/// Compose identity prompt from identity JSON.
/// Input: JSON { soul?: string, spirit?: string, brain?: string, body?: string, heart?: string }
#[napi]
pub fn bhava_compose_identity_prompt(identity_json: String) -> Result<String> {
    let identity = parse_identity(&identity_json)?;
    Ok(archetype::compose_identity_prompt(&identity))
}

fn parse_identity(json: &str) -> Result<IdentityContent> {
    let v: serde_json::Value =
        serde_json::from_str(json).map_err(|e| Error::from_reason(format!("{e}")))?;
    let mut identity = IdentityContent::default();
    if let Some(s) = v.get("soul").and_then(|v| v.as_str()) {
        identity.set(IdentityLayer::Soul, s);
    }
    if let Some(s) = v.get("spirit").and_then(|v| v.as_str()) {
        identity.set(IdentityLayer::Spirit, s);
    }
    if let Some(s) = v.get("brain").and_then(|v| v.as_str()) {
        identity.set(IdentityLayer::Brain, s);
    }
    if let Some(s) = v.get("body").and_then(|v| v.as_str()) {
        identity.set(IdentityLayer::Body, s);
    }
    if let Some(s) = v.get("heart").and_then(|v| v.as_str()) {
        identity.set(IdentityLayer::Heart, s);
    }
    Ok(identity)
}

// ── Emotional State / Mood ─────────────────────────────────────────────────

/// Create a new neutral emotional state. Returns JSON.
#[napi]
pub fn bhava_create_emotional_state() -> String {
    let state = EmotionalState::new();
    serde_json::to_string(&state).unwrap_or_else(|_| "{}".to_string())
}

/// Create an emotional state with baseline derived from personality traits.
/// Input: SY traits JSON { "formality": "casual", ... }
#[napi]
pub fn bhava_create_emotional_state_with_baseline(traits_json: String) -> Result<String> {
    let traits: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&traits_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    let profile = profile_from_sy_traits("_", &traits);
    let baseline = mood::derive_mood_baseline(&profile);
    let state = EmotionalState::with_baseline(baseline);
    serde_json::to_string(&state).map_err(|e| Error::from_reason(format!("{e}")))
}

/// Derive mood baseline from SY traits. Returns JSON { joy, arousal, dominance, trust, interest, frustration }.
#[napi]
pub fn bhava_derive_baseline(traits_json: String) -> Result<String> {
    let traits: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&traits_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    let profile = profile_from_sy_traits("_", &traits);
    let baseline = mood::derive_mood_baseline(&profile);
    serde_json::to_string(&baseline).map_err(|e| Error::from_reason(format!("{e}")))
}

/// Stimulate an emotion on an emotional state.
/// Input: state_json, emotion ("joy"|"arousal"|"dominance"|"trust"|"interest"|"frustration"), intensity (f64)
#[napi]
pub fn bhava_stimulate(state_json: String, emotion: String, intensity: f64) -> Result<String> {
    let mut state: EmotionalState =
        serde_json::from_str(&state_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    let emo = parse_emotion(&emotion)?;
    state.stimulate(emo, intensity as f32);
    serde_json::to_string(&state).map_err(|e| Error::from_reason(format!("{e}")))
}

/// Apply time-based mood decay toward baseline. Returns updated state JSON.
#[napi]
pub fn bhava_apply_decay(state_json: String) -> Result<String> {
    let mut state: EmotionalState =
        serde_json::from_str(&state_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    state.apply_decay(chrono::Utc::now());
    serde_json::to_string(&state).map_err(|e| Error::from_reason(format!("{e}")))
}

/// Classify current mood state. Returns mood label string.
#[napi]
pub fn bhava_classify_mood(state_json: String) -> Result<String> {
    let state: EmotionalState =
        serde_json::from_str(&state_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    Ok(state.classify().to_string())
}

/// Get mood deviation from baseline. Returns f64.
#[napi]
pub fn bhava_mood_deviation(state_json: String) -> Result<f64> {
    let state: EmotionalState =
        serde_json::from_str(&state_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    Ok(state.deviation() as f64)
}

/// Compose mood prompt fragment for system prompt injection.
#[napi]
pub fn bhava_compose_mood_prompt(state_json: String) -> Result<String> {
    let state: EmotionalState =
        serde_json::from_str(&state_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    Ok(mood::compose_mood_prompt(&state))
}

/// Compute action tendency from mood vector. Returns JSON.
#[napi]
pub fn bhava_action_tendency(state_json: String) -> Result<String> {
    let state: EmotionalState =
        serde_json::from_str(&state_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    let tendency = mood::action_tendency(&state.mood);
    let result = format!("{tendency:?}");
    Ok(result)
}

fn parse_emotion(s: &str) -> Result<Emotion> {
    match s.to_lowercase().as_str() {
        "joy" => Ok(Emotion::Joy),
        "arousal" => Ok(Emotion::Arousal),
        "dominance" => Ok(Emotion::Dominance),
        "trust" => Ok(Emotion::Trust),
        "interest" => Ok(Emotion::Interest),
        "frustration" => Ok(Emotion::Frustration),
        _ => Err(Error::from_reason(format!("Unknown emotion: {s}"))),
    }
}

// ── Spirit ─────────────────────────────────────────────────────────────────

/// Create a new empty spirit. Returns JSON.
#[napi]
pub fn bhava_create_spirit() -> String {
    let spirit = Spirit::new();
    serde_json::to_string(&spirit).unwrap_or_else(|_| "{}".to_string())
}

/// Build a spirit from SY passion/inspiration/pain data arrays.
/// Each input is a JSON array: [{ name/source/trigger, description, intensity/impact/severity }]
#[napi]
pub fn bhava_spirit_from_data(
    passions_json: String,
    inspirations_json: String,
    pains_json: String,
) -> Result<String> {
    let mut spirit = Spirit::new();

    // Parse passions
    if let Ok(passions) = serde_json::from_str::<Vec<serde_json::Value>>(&passions_json) {
        for p in passions {
            let name = p.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let desc = p.get("description").and_then(|v| v.as_str()).unwrap_or("");
            let intensity = p.get("intensity").and_then(|v| v.as_f64()).unwrap_or(0.5) as f32;
            if !name.is_empty() {
                spirit.add_passion(name, desc, intensity);
            }
        }
    }

    // Parse inspirations
    if let Ok(inspirations) = serde_json::from_str::<Vec<serde_json::Value>>(&inspirations_json) {
        for i in inspirations {
            let source = i.get("source").and_then(|v| v.as_str()).unwrap_or("");
            let desc = i.get("description").and_then(|v| v.as_str()).unwrap_or("");
            let impact = i.get("impact").and_then(|v| v.as_f64()).unwrap_or(0.5) as f32;
            if !source.is_empty() {
                spirit.add_inspiration(source, desc, impact);
            }
        }
    }

    // Parse pains
    if let Ok(pains) = serde_json::from_str::<Vec<serde_json::Value>>(&pains_json) {
        for p in pains {
            let trigger = p
                .get("trigger")
                .or_else(|| p.get("trigger_name"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let desc = p.get("description").and_then(|v| v.as_str()).unwrap_or("");
            let severity = p.get("severity").and_then(|v| v.as_f64()).unwrap_or(0.5) as f32;
            if !trigger.is_empty() {
                spirit.add_pain(trigger, desc, severity);
            }
        }
    }

    serde_json::to_string(&spirit).map_err(|e| Error::from_reason(format!("{e}")))
}

/// Compose spirit prompt section from spirit JSON.
#[napi]
pub fn bhava_compose_spirit_prompt(spirit_json: String) -> Result<String> {
    let spirit: Spirit =
        serde_json::from_str(&spirit_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    Ok(spirit.compose_prompt())
}

// ── Sentiment Feedback ─────────────────────────────────────────────────────

/// Analyze text sentiment and apply feedback to emotional state.
/// Returns JSON { state: EmotionalState, valence: f32, confidence: f32 }.
#[napi]
pub fn bhava_apply_sentiment_feedback(
    text: String,
    state_json: String,
    scale: f64,
) -> Result<String> {
    let mut state: EmotionalState =
        serde_json::from_str(&state_json).map_err(|e| Error::from_reason(format!("{e}")))?;

    let result = sentiment::analyze(&text);
    let scale = (scale as f32).clamp(0.0, 1.0);
    for &(emotion, intensity) in &result.emotions {
        state.stimulate(emotion, intensity * scale);
    }

    let output = serde_json::json!({
        "state": state,
        "valence": result.valence,
        "confidence": result.confidence,
        "is_positive": result.is_positive(),
        "is_negative": result.is_negative(),
    });

    serde_json::to_string(&output).map_err(|e| Error::from_reason(format!("{e}")))
}

/// Apply a mood trigger from interaction outcome.
/// outcome: "praised"|"criticized"|"surprised"|"threatened"|"neutral"
#[napi]
pub fn bhava_feedback_from_outcome(state_json: String, outcome: String) -> Result<String> {
    let mut state: EmotionalState =
        serde_json::from_str(&state_json).map_err(|e| Error::from_reason(format!("{e}")))?;

    match outcome.to_lowercase().as_str() {
        "praised" => state.apply_trigger(&mood::trigger_praised()),
        "criticized" => state.apply_trigger(&mood::trigger_criticized()),
        "surprised" => state.apply_trigger(&mood::trigger_surprised()),
        "threatened" => state.apply_trigger(&mood::trigger_threatened()),
        "neutral" => {}
        _ => return Err(Error::from_reason(format!("Unknown outcome: {outcome}"))),
    }

    serde_json::to_string(&state).map_err(|e| Error::from_reason(format!("{e}")))
}

// ── Full System Prompt Composition ─────────────────────────────────────────

/// Compose the complete personality section of a system prompt.
/// Combines identity preamble + trait disposition + mood + spirit.
/// Input: traits_json, identity_json, state_json (optional "null"), spirit_text (optional "")
#[napi]
pub fn bhava_compose_system_prompt(
    traits_json: String,
    identity_json: String,
    state_json: String,
    spirit_text: String,
) -> Result<String> {
    let traits: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&traits_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    let profile = profile_from_sy_traits("_", &traits);
    let identity = parse_identity(&identity_json)?;

    let mood: Option<EmotionalState> = if state_json == "null" || state_json.is_empty() {
        None
    } else {
        serde_json::from_str(&state_json).ok()
    };

    // Build prompt in the same order as bhava::ai::compose_system_prompt
    let mut prompt = archetype::compose_identity_prompt(&identity);

    let disposition = profile.compose_prompt();
    if !disposition.is_empty() {
        prompt.push('\n');
        prompt.push_str(&disposition);
    }

    if let Some(ref state) = mood {
        prompt.push('\n');
        prompt.push_str(&mood::compose_mood_prompt(state));
    }

    let spirit_trimmed = spirit_text.trim();
    if !spirit_trimmed.is_empty() {
        prompt.push_str("\n## Spirit\n\n");
        prompt.push_str(spirit_trimmed);
        prompt.push('\n');
    }

    Ok(prompt)
}

// ── Metadata ───────────────────────────────────────────────────────────────

/// Build personality metadata for agent registration.
/// Returns JSON { name, description, active_traits, mood_state, group_averages }.
#[napi]
pub fn bhava_build_metadata(name: String, traits_json: String, state_json: String) -> Result<String> {
    let traits: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&traits_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    let profile = profile_from_sy_traits(&name, &traits);

    let mood: Option<EmotionalState> = if state_json == "null" || state_json.is_empty() {
        None
    } else {
        serde_json::from_str(&state_json).ok()
    };

    let active_traits: Vec<serde_json::Value> = profile
        .active_traits()
        .into_iter()
        .map(|tv| {
            let key = trait_kind_to_str(tv.trait_name);
            let sy_level = bhava_level_to_sy(key, tv.level);
            serde_json::json!([key, sy_level])
        })
        .collect();

    let group_averages: Vec<serde_json::Value> = TraitGroup::ALL
        .iter()
        .map(|&g| serde_json::json!([g.to_string(), profile.group_average(g)]))
        .collect();

    let mood_state = mood.map(|s| s.classify().to_string());

    let result = serde_json::json!({
        "name": name,
        "description": profile.description,
        "active_traits": active_traits,
        "mood_state": mood_state,
        "group_averages": group_averages,
    });

    serde_json::to_string(&result).map_err(|e| Error::from_reason(format!("{e}")))
}
