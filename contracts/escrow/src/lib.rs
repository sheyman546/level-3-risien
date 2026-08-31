#![no_std]

//! StellarFlow escrow contract.
//!
//! Locks token funds on behalf of a depositor and a beneficiary. Funds can be
//! released to the beneficiary, refunded to the depositor, or frozen in a
//! dispute that the admin (dispute resolver) settles.

mod contract;
#[cfg(test)]
mod test;

pub use contract::*;
