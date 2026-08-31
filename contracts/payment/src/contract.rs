use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, String, Symbol, Vec,
};

use stellarflow_escrow::EscrowContractClient;
use stellarflow_registry::RegistryClient;

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum PaymentStatus {
    Created,
    Approved,
    Executed,
    Cancelled,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Payment {
    pub id: u32,
    pub creator: Address,
    pub recipient: Address,
    pub amount: i128,
    pub asset: Address,
    pub deadline: u64,
    pub status: PaymentStatus,
    pub escrow_id: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum DataKey {
    Admin,
    Registry,
    NextId,
    Payment(u32),
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum Error {
    Unauthorized = 1,
    PaymentNotFound = 2,
    InvalidStatus = 3,
    InvalidAmount = 4,
    InvalidDeadline = 5,
    RegistryNotFound = 6,
    EscrowCallFailed = 7,
    AlreadyInitialized = 8,
    NotInitialized = 9,
}

#[contract]
pub struct PaymentContract;

#[contractimpl]
impl PaymentContract {
    /// One-time initialization. `admin` manages the contract, `registry` is
    /// the service registry used to discover the escrow contract.
    pub fn initialize(env: Env, admin: Address, registry: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage().instance().set(&DataKey::NextId, &1u32);
        env.events().publish((Symbol::new(&env, "payment_initialized"),), (admin,));
        Ok(())
    }

    /// Create a payment. `creator` must sign; funds are not moved yet.
    pub fn create_payment(
        env: Env,
        creator: Address,
        recipient: Address,
        amount: i128,
        asset: Address,
        deadline: u64,
    ) -> Result<u32, Error> {
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::NotInitialized);
        }
        creator.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(Error::InvalidDeadline);
        }

        let id = next_id(&env);
        let payment = Payment {
            id,
            creator: creator.clone(),
            recipient: recipient.clone(),
            amount,
            asset: asset.clone(),
            deadline,
            status: PaymentStatus::Created,
            escrow_id: 0,
        };
        env.storage().instance().set(&DataKey::Payment(id), &payment);
        env.events().publish(
            (Symbol::new(&env, "payment_created"), id),
            (creator, recipient, amount),
        );
        Ok(id)
    }

    /// Approve a pending payment. The creator or the admin may approve.
    pub fn approve_payment(env: Env, caller: Address, id: u32) -> Result<(), Error> {
        caller.require_auth();
        let mut payment = load_payment(&env, id)?;
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        if caller != payment.creator && caller != admin {
            return Err(Error::Unauthorized);
        }
        if payment.status != PaymentStatus::Created {
            return Err(Error::InvalidStatus);
        }
        payment.status = PaymentStatus::Approved;
        env.storage().instance().set(&DataKey::Payment(id), &payment);
        env.events().publish((Symbol::new(&env, "payment_approved"), id), ());
        Ok(())
    }

    /// Execute an approved payment:
    /// 1. Look up the escrow contract through the registry.
    /// 2. Ask the escrow contract to lock the funds (cross-contract call).
    ///
    /// Returns the escrow id created by the escrow contract.
    pub fn execute_payment(env: Env, caller: Address, id: u32) -> Result<u64, Error> {
        caller.require_auth();
        let mut payment = load_payment(&env, id)?;
        if caller != payment.creator {
            return Err(Error::Unauthorized);
        }
        if payment.status != PaymentStatus::Approved {
            return Err(Error::InvalidStatus);
        }
        if env.ledger().timestamp() > payment.deadline {
            return Err(Error::InvalidDeadline);
        }

        let registry_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::Registry)
            .ok_or(Error::NotInitialized)?;
        let registry_client = RegistryClient::new(&env, &registry_address);
        let escrow_address: Address =
            match registry_client.try_get_contract(&String::from_str(&env, "escrow")) {
                Ok(Ok(addr)) => addr,
                _ => return Err(Error::RegistryNotFound),
            };

        let escrow_client = EscrowContractClient::new(&env, &escrow_address);
        let escrow_id: u64 =
            match escrow_client.try_create_escrow(
                &payment.creator,
                &payment.recipient,
                &payment.amount,
                &payment.asset,
                &payment.deadline,
            ) {
                Ok(Ok(id)) => id,
                _ => return Err(Error::EscrowCallFailed),
            };

        payment.status = PaymentStatus::Executed;
        payment.escrow_id = escrow_id;
        env.storage().instance().set(&DataKey::Payment(id), &payment);
        env.events().publish(
            (Symbol::new(&env, "payment_completed"), id),
            (escrow_id, payment.recipient.clone(), payment.amount),
        );
        Ok(escrow_id)
    }

    /// Cancel a payment that has not been executed yet. Only the creator.
    pub fn cancel_payment(env: Env, caller: Address, id: u32) -> Result<(), Error> {
        caller.require_auth();
        let mut payment = load_payment(&env, id)?;
        if caller != payment.creator {
            return Err(Error::Unauthorized);
        }
        if payment.status != PaymentStatus::Created && payment.status != PaymentStatus::Approved {
            return Err(Error::InvalidStatus);
        }
        payment.status = PaymentStatus::Cancelled;
        env.storage().instance().set(&DataKey::Payment(id), &payment);
        env.events().publish((Symbol::new(&env, "payment_cancelled"), id), ());
        Ok(())
    }

    pub fn get_payment(env: Env, id: u32) -> Result<Payment, Error> {
        load_payment(&env, id)
    }

    pub fn payments(env: Env) -> Vec<Payment> {
        let next = current_next_id(&env);
        let mut out: Vec<Payment> = Vec::new(&env);
        for i in 1..next {
            if let Some(payment) = env.storage().instance().get(&DataKey::Payment(i)) {
                out.push_back(payment);
            }
        }
        out
    }

    pub fn admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    pub fn registry(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Registry)
            .ok_or(Error::NotInitialized)
    }
}

fn next_id(env: &Env) -> u32 {
    let id: u32 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1u32);
    env.storage().instance().set(&DataKey::NextId, &(id + 1));
    id
}

fn current_next_id(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::NextId)
        .unwrap_or(1u32)
}

fn load_payment(env: &Env, id: u32) -> Result<Payment, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Payment(id))
        .ok_or(Error::PaymentNotFound)
}
