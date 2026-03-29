//! Route handlers — organized by domain.
//!
//! Each domain module (auth, brain, soul, etc.) will get its own submodule
//! as routes are migrated from TypeScript.

pub mod agents;
pub mod alerts;
pub mod audit;
pub mod brain;
pub mod chat;
pub mod health;
pub mod integrations;
pub mod marketplace;
pub mod soul;
pub mod spirit;
pub mod tasks;
pub mod workflow;
