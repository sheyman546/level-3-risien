use soroban_sdk::{
    testutils::{Address as _, Events, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env,
};

use crate::contract::{Error, EscrowContract, EscrowContractClient, EscrowStatus};

const ONE_XLM: i128 = 10_000_000; // 1 XLM in stroops
const NOW: u64 = 1_700_000_000;
const LATER: u64 = 1_700_100_000;

/// Deploy + initialize the escrow contract with a funded SAC token.
/// Returns (env, client, admin, depositor, beneficiary, token).
/// Count events emitted by the escrow contract itself (the SAC also emits).
fn escrow_events(env: &Env, contract_id: &Address) -> usize {
    env.events()
        .all()
        .iter()
        .filter(|(addr, _, _)| addr == contract_id)
        .count()
}

fn setup() -> (
    Env,
    EscrowContractClient<'static>,
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
    let depositor = Address::generate(&env);
    let beneficiary = Address::generate(&env);

    // SAC token, minted to the depositor (and a little to the beneficiary)
    let token = env.register_stellar_asset_contract(admin.clone());
    let sac = StellarAssetClient::new(&env, &token);
    sac.mint(&depositor, &(100 * ONE_XLM));
    sac.mint(&beneficiary, &(100 * ONE_XLM));

    let id = env.register_contract(None, EscrowContract);
    let client = EscrowContractClient::new(&env, &id);
    client.initialize(&admin);

    (env, client, admin, depositor, beneficiary, token, id)
}

#[test]
fn create_escrow_locks_funds() {
    let (env, client, _admin, depositor, beneficiary, token, contract_id) = setup();

    let id = client.create_escrow(&depositor, &beneficiary, &(10 * ONE_XLM), &token, &LATER);
    assert_eq!(id, 1);

    let escrow = client.get_escrow(&id);
    assert_eq!(escrow.status, EscrowStatus::Locked);
    assert_eq!(escrow.depositor, depositor);
    assert_eq!(escrow.beneficiary, beneficiary);
    assert_eq!(escrow.amount, 10 * ONE_XLM);

    // funds moved into the contract
    let token_client = TokenClient::new(&env, &token);
    assert_eq!(token_client.balance(&contract_id), 10 * ONE_XLM);
    assert_eq!(token_client.balance(&depositor), 90 * ONE_XLM);

    // initialized + escrow_created
    assert_eq!(escrow_events(&env, &contract_id), 2);
}

#[test]
fn release_pays_beneficiary() {
    let (env, client, _admin, depositor, beneficiary, token, contract_id) = setup();
    let id = client.create_escrow(&depositor, &beneficiary, &(5 * ONE_XLM), &token, &LATER);

    client.release(&beneficiary, &id);

    let escrow = client.get_escrow(&id);
    assert_eq!(escrow.status, EscrowStatus::Released);

    let token_client = TokenClient::new(&env, &token);
    assert_eq!(token_client.balance(&beneficiary), (100 + 5) * ONE_XLM);
    assert_eq!(token_client.balance(&contract_id), 0);

    // initialized + created + released
    assert_eq!(escrow_events(&env, &contract_id), 3);
}

#[test]
fn refund_returns_to_depositor() {
    let (env, client, _admin, depositor, beneficiary, token, contract_id) = setup();
    let id = client.create_escrow(&depositor, &beneficiary, &(5 * ONE_XLM), &token, &LATER);

    client.refund(&depositor, &id);

    let escrow = client.get_escrow(&id);
    assert_eq!(escrow.status, EscrowStatus::Refunded);

    let token_client = TokenClient::new(&env, &token);
    assert_eq!(token_client.balance(&depositor), 100 * ONE_XLM);
    assert_eq!(token_client.balance(&contract_id), 0);
}

#[test]
fn cannot_release_twice_or_after_refund() {
    let (env, client, _admin, depositor, beneficiary, token, _contract_id) = setup();
    let id = client.create_escrow(&depositor, &beneficiary, &(5 * ONE_XLM), &token, &LATER);

    client.release(&beneficiary, &id);
    assert_eq!(
        client.try_release(&beneficiary, &id),
        Err(Ok(Error::InvalidStatus))
    );
    assert_eq!(
        client.try_refund(&depositor, &id),
        Err(Ok(Error::InvalidStatus))
    );
}

#[test]
fn unauthorized_caller_rejected() {
    let (env, client, _admin, depositor, beneficiary, token, _contract_id) = setup();
    let id = client.create_escrow(&depositor, &beneficiary, &(5 * ONE_XLM), &token, &LATER);

    let stranger = Address::generate(&env);
    assert_eq!(
        client.try_release(&stranger, &id),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        client.try_refund(&stranger, &id),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        client.try_dispute(&stranger, &id),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn invalid_amount_rejected() {
    let (_env, client, _admin, depositor, beneficiary, token, _contract_id) = setup();

    assert_eq!(
        client.try_create_escrow(&depositor, &beneficiary, &0, &token, &LATER),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        client.try_create_escrow(&depositor, &beneficiary, &(-1), &token, &LATER),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn insufficient_balance_rejected() {
    let (_env, client, _admin, depositor, beneficiary, token, _contract_id) = setup();

    assert_eq!(
        client.try_create_escrow(&depositor, &beneficiary, &(1000 * ONE_XLM), &token, &LATER),
        Err(Ok(Error::InsufficientBalance))
    );
}

#[test]
fn dispute_and_resolve_to_beneficiary() {
    let (env, client, admin, depositor, beneficiary, token, _contract_id) = setup();
    let id = client.create_escrow(&depositor, &beneficiary, &(5 * ONE_XLM), &token, &LATER);

    client.dispute(&depositor, &id);
    assert_eq!(
        client.get_escrow(&id).status,
        EscrowStatus::Disputed
    );

    // only admin can resolve
    assert_eq!(
        client.try_resolve_dispute(&depositor, &id, &true),
        Err(Ok(Error::Unauthorized))
    );

    client.resolve_dispute(&admin, &id, &true);
    assert_eq!(
        client.get_escrow(&id).status,
        EscrowStatus::Released
    );

    let token_client = TokenClient::new(&env, &token);
    assert_eq!(token_client.balance(&beneficiary), (100 + 5) * ONE_XLM);
}

#[test]
fn dispute_and_resolve_to_depositor() {
    let (env, client, admin, depositor, beneficiary, token, _contract_id) = setup();
    let id = client.create_escrow(&depositor, &beneficiary, &(5 * ONE_XLM), &token, &LATER);

    client.dispute(&beneficiary, &id);
    client.resolve_dispute(&admin, &id, &false);

    assert_eq!(
        client.get_escrow(&id).status,
        EscrowStatus::Refunded
    );
    let token_client = TokenClient::new(&env, &token);
    assert_eq!(token_client.balance(&depositor), 100 * ONE_XLM);
}

#[test]
fn escrows_list_returns_all() {
    let (_env, client, _admin, depositor, beneficiary, token, _contract_id) = setup();

    client.create_escrow(&depositor, &beneficiary, &(1 * ONE_XLM), &token, &LATER);
    client.create_escrow(&beneficiary, &depositor, &(2 * ONE_XLM), &token, &LATER);

    let all = client.escrows();
    assert_eq!(all.len(), 2);
    assert_eq!(all.get(0).unwrap().amount, 1 * ONE_XLM);
    assert_eq!(all.get(1).unwrap().amount, 2 * ONE_XLM);
}

#[test]
fn get_missing_escrow_errors() {
    let (_env, client, _admin, _depositor, _beneficiary, _token, _contract_id) = setup();
    assert_eq!(
        client.try_get_escrow(&999),
        Err(Ok(Error::EscrowNotFound))
    );
}
