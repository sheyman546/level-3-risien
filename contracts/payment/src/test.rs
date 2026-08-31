use soroban_sdk::{
    testutils::{Address as _, Events, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env, String,
};

use stellarflow_escrow::{EscrowContract, EscrowContractClient, EscrowStatus};
use stellarflow_registry::{Registry, RegistryClient};

use crate::contract::{Error, PaymentContract, PaymentContractClient, PaymentStatus};

const ONE_XLM: i128 = 10_000_000;
const NOW: u64 = 1_700_000_000;
const LATER: u64 = 1_700_100_000;

/// Deploy + wire the full contract set:
/// registry (with "escrow" registered) <- payment -> escrow.
/// Returns (env, payment client, admin, creator, recipient, token, escrow_id).
fn setup() -> (
    Env,
    PaymentContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set(LedgerInfo {
        timestamp: NOW,
        protocol_version: 22,
        sequence_number: 10,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 4096,
        max_entry_ttl: 6_312_000,
    });

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);

    // token funded to the creator
    let token = env.register_stellar_asset_contract(admin.clone());
    let sac = StellarAssetClient::new(&env, &token);
    sac.mint(&creator, &(100 * ONE_XLM));

    // deploy all three contracts
    let registry_id = env.register_contract(None, Registry);
    let escrow_id = env.register_contract(None, EscrowContract);
    let payment_id = env.register_contract(None, PaymentContract);

    // wire them together
    let registry = RegistryClient::new(&env, &registry_id);
    registry.initialize(&admin);
    registry.register(&admin, &String::from_str(&env, "escrow"), &escrow_id);

    let escrow = EscrowContractClient::new(&env, &escrow_id);
    escrow.initialize(&admin);

    let client = PaymentContractClient::new(&env, &payment_id);
    client.initialize(&admin, &registry_id);

    (env, client, admin, creator, recipient, token, escrow_id, payment_id)
}

/// Count events emitted by the payment contract (excludes SAC + escrow noise).
fn payment_events(env: &Env, payment_id: &Address) -> usize {
    env.events()
        .all()
        .iter()
        .filter(|(addr, _, _)| addr == payment_id)
        .count()
}

fn make_payment(client: &PaymentContractClient<'_>, creator: &Address, recipient: &Address, token: &Address) -> u32 {
    client.create_payment(creator, recipient, &(10 * ONE_XLM), token, &LATER)
}

#[test]
fn full_payment_flow_locks_funds_in_escrow() {
    let (env, client, _admin, creator, recipient, token, escrow_id, payment_id) = setup();

    let id = make_payment(&client, &creator, &recipient, &token);
    assert_eq!(id, 1);
    assert_eq!(
        client.get_payment(&id).status,
        PaymentStatus::Created
    );

    client.approve_payment(&creator, &id);
    assert_eq!(
        client.get_payment(&id).status,
        PaymentStatus::Approved
    );

    // execute -> cross-contract call creates an escrow and moves the funds
    let created_escrow_id = client.execute_payment(&creator, &id);
    assert_eq!(created_escrow_id, 1);

    let payment = client.get_payment(&id);
    assert_eq!(payment.status, PaymentStatus::Executed);
    assert_eq!(payment.escrow_id, 1);

    // the escrow contract now holds the funds
    let escrow = EscrowContractClient::new(&env, &escrow_id);
    let escrow_data = escrow.get_escrow(&created_escrow_id);
    assert_eq!(escrow_data.status, EscrowStatus::Locked);
    assert_eq!(escrow_data.depositor, creator);
    assert_eq!(escrow_data.beneficiary, recipient);

    let token_client = TokenClient::new(&env, &token);
    assert_eq!(token_client.balance(&escrow_id), 10 * ONE_XLM);
    assert_eq!(token_client.balance(&creator), 90 * ONE_XLM);

    // payment(initialized, created, approved, completed)
    assert_eq!(payment_events(&env, &payment_id), 4);
}

#[test]
fn admin_can_approve() {
    let (env, client, admin, creator, recipient, token, _escrow_id, payment_id) = setup();
    let id = make_payment(&client, &creator, &recipient, &token);

    client.approve_payment(&admin, &id);
    assert_eq!(
        client.get_payment(&id).status,
        PaymentStatus::Approved
    );
    // payment(initialized, created, approved)
    assert_eq!(payment_events(&env, &payment_id), 3);
}

#[test]
fn unauthorized_caller_rejected() {
    let (env, client, _admin, creator, recipient, token, _escrow_id, _payment_id) = setup();
    let id = make_payment(&client, &creator, &recipient, &token);
    let stranger = Address::generate(&env);

    // only creator or admin may approve
    assert_eq!(
        client.try_approve_payment(&stranger, &id),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        client.try_approve_payment(&recipient, &id),
        Err(Ok(Error::Unauthorized))
    );
    // only creator may cancel / execute
    assert_eq!(
        client.try_cancel_payment(&stranger, &id),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn cannot_execute_before_approval() {
    let (env, client, _admin, creator, recipient, token, _escrow_id, _payment_id) = setup();
    let id = make_payment(&client, &creator, &recipient, &token);

    assert_eq!(
        client.try_execute_payment(&creator, &id),
        Err(Ok(Error::InvalidStatus))
    );
}

#[test]
fn cancel_payment() {
    let (env, client, _admin, creator, recipient, token, _escrow_id, payment_id) = setup();
    let id = make_payment(&client, &creator, &recipient, &token);

    client.cancel_payment(&creator, &id);
    assert_eq!(
        client.get_payment(&id).status,
        PaymentStatus::Cancelled
    );

    // cannot execute a cancelled payment
    assert_eq!(
        client.try_execute_payment(&creator, &id),
        Err(Ok(Error::InvalidStatus))
    );
    // payment(initialized, created, cancelled)
    assert_eq!(payment_events(&env, &payment_id), 3);
}

#[test]
fn invalid_amount_rejected() {
    let (env, client, _admin, creator, recipient, token, _escrow_id, _payment_id) = setup();

    assert_eq!(
        client.try_create_payment(&creator, &recipient, &0, &token, &LATER),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        client.try_create_payment(&creator, &recipient, &(-5), &token, &LATER),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn expired_deadline_rejected() {
    let (env, client, _admin, creator, recipient, token, _escrow_id, _payment_id) = setup();
    let id = make_payment(&client, &creator, &recipient, &token);
    client.approve_payment(&creator, &id);

    // move the ledger clock past the deadline
    env.ledger().set(LedgerInfo {
        timestamp: LATER + 1,
        protocol_version: 22,
        sequence_number: 11,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 4096,
        max_entry_ttl: 6_312_000,
    });

    assert_eq!(
        client.try_execute_payment(&creator, &id),
        Err(Ok(Error::InvalidDeadline))
    );
}

#[test]
fn registry_missing_escrow_errors() {
    let (env, client, admin, creator, recipient, token, _escrow_id, _payment_id) = setup();
    let id = make_payment(&client, &creator, &recipient, &token);
    client.approve_payment(&creator, &id);

    // remove the escrow registration -> execute fails cleanly
    let registry_id = client.registry();
    let registry = RegistryClient::new(&env, &registry_id);
    registry.remove(&admin, &String::from_str(&env, "escrow"));

    assert_eq!(
        client.try_execute_payment(&creator, &id),
        Err(Ok(Error::RegistryNotFound))
    );
}

#[test]
fn escrow_failure_surfaces_as_error() {
    let (env, client, _admin, creator, recipient, token, _escrow_id, _payment_id) = setup();
    // creator has only 100 XLM; a huge payment passes the payment contract's
    // checks but fails inside the escrow contract (insufficient balance)
    let id = client.create_payment(&creator, &recipient, &(1000 * ONE_XLM), &token, &LATER);
    client.approve_payment(&creator, &id);

    assert_eq!(
        client.try_execute_payment(&creator, &id),
        Err(Ok(Error::EscrowCallFailed))
    );
}

#[test]
fn released_escrow_pays_recipient() {
    let (env, client, _admin, creator, recipient, token, escrow_id, _payment_id) = setup();
    let id = make_payment(&client, &creator, &recipient, &token);
    client.approve_payment(&creator, &id);
    let created_escrow_id = client.execute_payment(&creator, &id);

    // beneficiary releases the escrow directly through the escrow contract
    let escrow = EscrowContractClient::new(&env, &escrow_id);
    escrow.release(&recipient, &created_escrow_id);

    let token_client = TokenClient::new(&env, &token);
    assert_eq!(token_client.balance(&recipient), 10 * ONE_XLM);
    assert_eq!(token_client.balance(&escrow_id), 0);
}

#[test]
fn payments_list_returns_all() {
    let (_env, client, _admin, creator, recipient, token, _escrow_id, _payment_id) = setup();

    client.create_payment(&creator, &recipient, &(1 * ONE_XLM), &token, &LATER);
    client.create_payment(&recipient, &creator, &(2 * ONE_XLM), &token, &LATER);

    let all = client.payments();
    assert_eq!(all.len(), 2);
    assert_eq!(all.get(0).unwrap().amount, 1 * ONE_XLM);
    assert_eq!(all.get(1).unwrap().amount, 2 * ONE_XLM);
}

#[test]
fn get_missing_payment_errors() {
    let (_env, client, _admin, _creator, _recipient, _token, _escrow_id, _payment_id) = setup();
    assert_eq!(
        client.try_get_payment(&42),
        Err(Ok(Error::PaymentNotFound))
    );
}
