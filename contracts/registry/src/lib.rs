#![no_std]

//! StellarFlow registry contract.
//!
//! A simple on-chain service registry. Contracts (or the admin) register
//! their addresses under human-readable keys so other contracts can discover
//! them at runtime instead of hard-coding addresses.

mod contract;
#[cfg(test)]
mod test;

pub use contract::*;
