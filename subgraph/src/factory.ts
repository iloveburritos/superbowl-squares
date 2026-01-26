import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import { PoolCreated } from "../generated/SquaresFactory/SquaresFactory";
import { SquaresPool as SquaresPoolTemplate } from "../generated/templates";
import { SquaresPool } from "../generated/templates/SquaresPool/SquaresPool";
import { Factory, Pool } from "../generated/schema";

const FACTORY_ID = "factory";

export function handlePoolCreated(event: PoolCreated): void {
  // Create or update factory entity
  let factory = Factory.load(FACTORY_ID);
  if (factory == null) {
    factory = new Factory(FACTORY_ID);
    factory.poolCount = 0;
    factory.totalPotValue = BigInt.fromI32(0);
    factory.totalSquaresSold = 0;
  }
  factory.poolCount = factory.poolCount + 1;
  factory.save();

  // Create pool entity
  let poolAddress = event.params.pool;
  let pool = new Pool(poolAddress.toHexString());

  pool.creator = event.params.creator;
  pool.name = event.params.name;
  pool.squarePrice = event.params.squarePrice;
  pool.paymentToken = event.params.paymentToken;

  // Fetch additional data from contract
  let poolContract = SquaresPool.bind(poolAddress);

  let maxSquaresResult = poolContract.try_maxSquaresPerUser();
  pool.maxSquaresPerUser = maxSquaresResult.reverted ? 0 : maxSquaresResult.value;

  let payoutResult = poolContract.try_getPayoutPercentages();
  if (!payoutResult.reverted) {
    let payouts: i32[] = [];
    for (let i = 0; i < 4; i++) {
      payouts.push(payoutResult.value[i] as i32);
    }
    pool.payoutPercentages = payouts;
  } else {
    pool.payoutPercentages = [25, 25, 25, 25];
  }

  let infoResult = poolContract.try_getPoolInfo();
  if (!infoResult.reverted) {
    pool.teamAName = infoResult.value.getTeamAName();
    pool.teamBName = infoResult.value.getTeamBName();
  } else {
    pool.teamAName = "";
    pool.teamBName = "";
  }

  let purchaseDeadlineResult = poolContract.try_purchaseDeadline();
  pool.purchaseDeadline = purchaseDeadlineResult.reverted
    ? BigInt.fromI32(0)
    : purchaseDeadlineResult.value;

  let vrfDeadlineResult = poolContract.try_vrfDeadline();
  pool.vrfDeadline = vrfDeadlineResult.reverted
    ? BigInt.fromI32(0)
    : vrfDeadlineResult.value;

  pool.state = "OPEN";
  pool.rowNumbers = null;
  pool.colNumbers = null;
  pool.totalPot = BigInt.fromI32(0);
  pool.squaresSold = 0;
  pool.createdAt = event.block.timestamp;
  pool.createdAtBlock = event.block.number;
  pool.createdAtTransaction = event.transaction.hash;

  pool.save();

  // Create template to track pool events
  SquaresPoolTemplate.create(poolAddress);
}
