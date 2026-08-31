use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String, Symbol};

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum DataKey {
    Admin,
    Entry(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct RegistryEntry {
    pub address: Address,
    pub registered_at: u64,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum Error {
    Unauthorized = 1,
    NotFound = 2,
    AlreadyRegistered = 3,
    AlreadyInitialized = 4,
    NotInitialized = 5,
}

#[contract]
pub struct Registry;

#[contractimpl]
impl Registry {
    /// One-time initialization. The caller becomes the admin.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.events().publish(
            (Symbol::new(&env, "registry_initialized"),),
            (admin,),
        );
        Ok(())
    }

    /// Register (or overwrite) a contract address under `key`.
    ///
    /// Authorization: `caller` must either be the admin or the contract
    /// itself (self-registration — the contract passes its own address).
    pub fn register(env: Env, caller: Address, key: String, address: Address) -> Result<(), Error> {
        caller.require_auth();
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        if caller != admin && caller != address {
            return Err(Error::Unauthorized);
        }
        if env.storage().instance().has(&DataKey::Entry(key.clone())) {
            return Err(Error::AlreadyRegistered);
        }
        let entry = RegistryEntry {
            address: address.clone(),
            registered_at: env.ledger().timestamp(),
        };
        env.storage().instance().set(&DataKey::Entry(key.clone()), &entry);
        env.events().publish(
            (Symbol::new(&env, "contract_registered"),),
            (key, address),
        );
        Ok(())
    }

    /// Remove a registration. Only the admin.
    pub fn remove(env: Env, caller: Address, key: String) -> Result<(), Error> {
        caller.require_auth();
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        if caller != admin {
            return Err(Error::Unauthorized);
        }
        if !env.storage().instance().has(&DataKey::Entry(key.clone())) {
            return Err(Error::NotFound);
        }
        env.storage().instance().remove(&DataKey::Entry(key.clone()));
        env.events().publish((Symbol::new(&env, "contract_removed"),), (key,));
        Ok(())
    }

    /// Look up a registered contract address.
    pub fn get_contract(env: Env, key: String) -> Result<Address, Error> {
        let entry: RegistryEntry = env
            .storage()
            .instance()
            .get(&DataKey::Entry(key))
            .ok_or(Error::NotFound)?;
        Ok(entry.address)
    }

    pub fn is_registered(env: Env, key: String) -> bool {
        env.storage().instance().has(&DataKey::Entry(key))
    }

    pub fn admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }
}
