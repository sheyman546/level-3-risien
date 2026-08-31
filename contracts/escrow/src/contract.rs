use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, Symbol, Vec,
};

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum EscrowStatus {
    Locked,
    Released,
    Refunded,
    Disputed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Escrow {
    pub id: u64,
    pub depositor: Address,
    pub beneficiary: Address,
    pub amount: i128,
    pub asset: Address,
    pub status: EscrowStatus,
    pub created_at: u64,
    pub timeout: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum DataKey {
    Admin,
    NextId,
    Escrow(u64),
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum Error {
    Unauthorized = 1,
    EscrowNotFound = 2,
    InvalidStatus = 3,
    InvalidAmount = 4,
    InsufficientBalance = 5,
    TransferFailed = 6,
    AlreadyInitialized = 7,
    NotInitialized = 8,
    InvalidDeadline = 9,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// One-time initialization. The admin also acts as the dispute resolver.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextId, &1u64);
        env.events().publish((Symbol::new(&env, "escrow_initialized"),), (admin,));
        Ok(())
    }

    /// Lock `amount` of `asset` from `depositor` into the contract.
    ///
    /// Transfers the tokens into the contract and records a `Locked` escrow.
    pub fn create_escrow(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        amount: i128,
        asset: Address,
        timeout: u64,
    ) -> Result<u64, Error> {
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::NotInitialized);
        }
        depositor.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if timeout <= env.ledger().timestamp() {
            return Err(Error::InvalidDeadline);
        }

        let token = token::Client::new(&env, &asset);
        let balance = token.balance(&depositor);
        if balance < amount {
            return Err(Error::InsufficientBalance);
        }

        let id = next_id(&env);
        let escrow = Escrow {
            id,
            depositor: depositor.clone(),
            beneficiary: beneficiary.clone(),
            amount,
            asset: asset.clone(),
            status: EscrowStatus::Locked,
            created_at: env.ledger().timestamp(),
            timeout,
        };
        env.storage().instance().set(&DataKey::Escrow(id), &escrow);

        // Pull the funds into the contract (auth covered by depositor.require_auth).
        token
            .try_transfer(&depositor, &env.current_contract_address(), &amount)
            .map_err(|_| Error::TransferFailed)?
            .map_err(|_| Error::TransferFailed)?;

        env.events().publish(
            (Symbol::new(&env, "escrow_created"), id),
            (depositor, beneficiary, amount),
        );
        Ok(id)
    }

    /// Pay out the escrowed funds to the beneficiary.
    /// The depositor or the beneficiary may release.
    pub fn release(env: Env, caller: Address, id: u64) -> Result<(), Error> {
        caller.require_auth();
        let mut escrow = load_escrow(&env, id)?;
        if caller != escrow.depositor && caller != escrow.beneficiary {
            return Err(Error::Unauthorized);
        }
        if escrow.status != EscrowStatus::Locked {
            return Err(Error::InvalidStatus);
        }
        let token = token::Client::new(&env, &escrow.asset);
        token
            .try_transfer(
                &env.current_contract_address(),
                &escrow.beneficiary,
                &escrow.amount,
            )
            .map_err(|_| Error::TransferFailed)?
            .map_err(|_| Error::TransferFailed)?;

        escrow.status = EscrowStatus::Released;
        env.storage().instance().set(&DataKey::Escrow(id), &escrow);
        env.events().publish(
            (Symbol::new(&env, "escrow_released"), id),
            (escrow.beneficiary.clone(), escrow.amount),
        );
        Ok(())
    }

    /// Return the escrowed funds to the depositor. Only the depositor.
    pub fn refund(env: Env, caller: Address, id: u64) -> Result<(), Error> {
        caller.require_auth();
        let mut escrow = load_escrow(&env, id)?;
        if caller != escrow.depositor {
            return Err(Error::Unauthorized);
        }
        if escrow.status != EscrowStatus::Locked {
            return Err(Error::InvalidStatus);
        }
        let token = token::Client::new(&env, &escrow.asset);
        token
            .try_transfer(
                &env.current_contract_address(),
                &escrow.depositor,
                &escrow.amount,
            )
            .map_err(|_| Error::TransferFailed)?
            .map_err(|_| Error::TransferFailed)?;

        escrow.status = EscrowStatus::Refunded;
        env.storage().instance().set(&DataKey::Escrow(id), &escrow);
        env.events().publish(
            (Symbol::new(&env, "escrow_refunded"), id),
            (escrow.depositor.clone(), escrow.amount),
        );
        Ok(())
    }

    /// Open a dispute. Either party. Funds stay locked until resolution.
    pub fn dispute(env: Env, caller: Address, id: u64) -> Result<(), Error> {
        caller.require_auth();
        let mut escrow = load_escrow(&env, id)?;
        if caller != escrow.depositor && caller != escrow.beneficiary {
            return Err(Error::Unauthorized);
        }
        if escrow.status != EscrowStatus::Locked {
            return Err(Error::InvalidStatus);
        }
        escrow.status = EscrowStatus::Disputed;
        env.storage().instance().set(&DataKey::Escrow(id), &escrow);
        env.events().publish((Symbol::new(&env, "escrow_disputed"), id), (caller,));
        Ok(())
    }

    /// Settle a disputed escrow. Only the admin (dispute resolver).
    /// `pay_beneficiary` decides who receives the funds.
    pub fn resolve_dispute(
        env: Env,
        caller: Address,
        id: u64,
        pay_beneficiary: bool,
    ) -> Result<(), Error> {
        caller.require_auth();
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        if caller != admin {
            return Err(Error::Unauthorized);
        }
        let mut escrow = load_escrow(&env, id)?;
        if escrow.status != EscrowStatus::Disputed {
            return Err(Error::InvalidStatus);
        }
        let token = token::Client::new(&env, &escrow.asset);
        if pay_beneficiary {
            token
                .try_transfer(
                    &env.current_contract_address(),
                    &escrow.beneficiary,
                    &escrow.amount,
                )
                .map_err(|_| Error::TransferFailed)?
                .map_err(|_| Error::TransferFailed)?;
            escrow.status = EscrowStatus::Released;
        } else {
            token
                .try_transfer(
                    &env.current_contract_address(),
                    &escrow.depositor,
                    &escrow.amount,
                )
                .map_err(|_| Error::TransferFailed)?
                .map_err(|_| Error::TransferFailed)?;
            escrow.status = EscrowStatus::Refunded;
        }
        env.storage().instance().set(&DataKey::Escrow(id), &escrow);
        env.events().publish(
            (Symbol::new(&env, "escrow_resolved"), id),
            (pay_beneficiary,),
        );
        Ok(())
    }

    pub fn get_escrow(env: Env, id: u64) -> Result<Escrow, Error> {
        load_escrow(&env, id)
    }

    pub fn escrows(env: Env) -> Vec<Escrow> {
        let next = current_next_id(&env);
        let mut out: Vec<Escrow> = Vec::new(&env);
        for i in 1..next {
            if let Some(escrow) = env.storage().instance().get(&DataKey::Escrow(i)) {
                out.push_back(escrow);
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
}

fn next_id(env: &Env) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextId)
        .unwrap_or(1u64);
    env.storage().instance().set(&DataKey::NextId, &(id + 1));
    id
}

fn current_next_id(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::NextId)
        .unwrap_or(1u64)
}

fn load_escrow(env: &Env, id: u64) -> Result<Escrow, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Escrow(id))
        .ok_or(Error::EscrowNotFound)
}
