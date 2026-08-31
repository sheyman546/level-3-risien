#![no_std]

//! StellarFlow payment contract.
//!
//! Coordinates the payment lifecycle (created -> approved -> executed /
//! cancelled). Execution delegates to the escrow contract — discovered at
//! runtime through the registry contract — which actually moves the funds,
//! demonstrating cross-contract communication.

mod contract;
#[cfg(test)]
mod test;

pub use contract::*;
