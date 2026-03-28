//! Route handlers — organized by domain.
//!
//! Each domain module (auth, brain, soul, etc.) will get its own submodule
//! as routes are migrated from TypeScript.

pub mod brain;
pub mod health;
pub mod soul;
