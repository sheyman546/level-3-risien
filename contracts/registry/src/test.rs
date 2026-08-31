use soroban_sdk::{testutils::Address as _, testutils::Events, Address, Env, String};

use crate::contract::{Error, Registry, RegistryClient};

fn key(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

/// Deploy + initialize the registry; returns (env, registry_id, admin).
fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register_contract(None, Registry);
    let client = RegistryClient::new(&env, &id);
    client.initialize(&admin);
    (env, id, admin)
}

#[test]
fn initialize_and_read_admin() {
    let (env, id, admin) = setup();
    let client = RegistryClient::new(&env, &id);
    assert_eq!(client.admin(), admin.clone());
    assert_eq!(env.events().all().len(), 1);
}

#[test]
fn initialize_only_once() {
    let (env, id, _admin) = setup();
    let client = RegistryClient::new(&env, &id);
    assert_eq!(
        client.try_initialize(&Address::generate(&env)),
        Err(Ok(Error::AlreadyInitialized))
    );
}

#[test]
fn register_get_remove_cycle() {
    let (env, id, admin) = setup();
    let client = RegistryClient::new(&env, &id);
    let escrow = Address::generate(&env);
    let payment = Address::generate(&env);

    client.register(&admin, &key(&env, "escrow"), &escrow);
    client.register(&admin, &key(&env, "payment"), &payment);

    assert!(client.is_registered(&key(&env, "escrow")));
    assert_eq!(client.get_contract(&key(&env, "escrow")), escrow.clone());
    assert_eq!(client.get_contract(&key(&env, "payment")), payment.clone());

    // duplicate registration is rejected
    assert_eq!(
        client.try_register(&admin, &key(&env, "escrow"), &escrow),
        Err(Ok(Error::AlreadyRegistered))
    );

    // admin can remove
    client.remove(&admin, &key(&env, "escrow"));
    assert!(!client.is_registered(&key(&env, "escrow")));
    assert_eq!(
        client.try_get_contract(&key(&env, "escrow")),
        Err(Ok(Error::NotFound))
    );

    // initialized + 2 registered + 1 removed = 4 events
    assert_eq!(env.events().all().len(), 4);
}

#[test]
fn only_admin_can_register() {
    let (env, id, _admin) = setup();
    let client = RegistryClient::new(&env, &id);
    let attacker = Address::generate(&env);
    let victim = Address::generate(&env);

    assert_eq!(
        client.try_register(&attacker, &key(&env, "escrow"), &victim),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn unregistered_key_not_found() {
    let (env, id, _admin) = setup();
    let client = RegistryClient::new(&env, &id);
    assert_eq!(
        client.try_get_contract(&key(&env, "missing")),
        Err(Ok(Error::NotFound))
    );
}
