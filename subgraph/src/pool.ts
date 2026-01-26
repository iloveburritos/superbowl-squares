import { BigInt, Address, Bytes, store } from "@graphprotocol/graph-ts";
import {
  SquarePurchased,
  PoolClosed,
  NumbersAssigned,
  ScoreSubmitted,
  ScoreSettled,
  PayoutClaimed,
} from "../generated/templates/SquaresPool/SquaresPool";
import { Pool, Square, Score, User, UserPool, Factory } from "../generated/schema";

const FACTORY_ID = "factory";

function getOrCreateUser(address: Address): User {
  let userId = address.toHexString();
  let user = User.load(userId);

  if (user == null) {
    user = new User(userId);
    user.squares = [];
    user.totalSquaresPurchased = 0;
    user.totalSpent = BigInt.fromI32(0);
    user.totalWon = BigInt.fromI32(0);
    user.save();
  }

  return user;
}

function getOrCreateUserPool(user: User, pool: Pool): UserPool {
  let userPoolId = user.id + "-" + pool.id;
  let userPool = UserPool.load(userPoolId);

  if (userPool == null) {
    userPool = new UserPool(userPoolId);
    userPool.user = user.id;
    userPool.pool = pool.id;
    userPool.squareCount = 0;
    userPool.squares = [];
    userPool.totalSpent = BigInt.fromI32(0);
    userPool.wonQuarters = [];
    userPool.totalWon = BigInt.fromI32(0);
    userPool.save();
  }

  return userPool;
}

export function handleSquarePurchased(event: SquarePurchased): void {
  let poolAddress = event.address.toHexString();
  let pool = Pool.load(poolAddress);

  if (pool == null) {
    return;
  }

  // Create square entity
  let squareId = poolAddress + "-" + event.params.position.toString();
  let square = new Square(squareId);
  square.pool = pool.id;
  square.position = event.params.position;
  square.owner = event.params.buyer;
  square.purchasedAt = event.block.timestamp;
  square.purchasedAtBlock = event.block.number;
  square.purchasedAtTransaction = event.transaction.hash;
  square.save();

  // Update pool
  pool.totalPot = pool.totalPot.plus(event.params.price);
  pool.squaresSold = pool.squaresSold + 1;
  pool.save();

  // Update factory totals
  let factory = Factory.load(FACTORY_ID);
  if (factory != null) {
    factory.totalPotValue = factory.totalPotValue.plus(event.params.price);
    factory.totalSquaresSold = factory.totalSquaresSold + 1;
    factory.save();
  }

  // Update user
  let user = getOrCreateUser(event.params.buyer);
  let userSquares = user.squares;
  userSquares.push(squareId);
  user.squares = userSquares;
  user.totalSquaresPurchased = user.totalSquaresPurchased + 1;
  user.totalSpent = user.totalSpent.plus(event.params.price);
  user.save();

  // Update user pool
  let userPool = getOrCreateUserPool(user, pool);
  userPool.squareCount = userPool.squareCount + 1;
  let squares = userPool.squares;
  squares.push(event.params.position);
  userPool.squares = squares;
  userPool.totalSpent = userPool.totalSpent.plus(event.params.price);
  userPool.save();
}

export function handlePoolClosed(event: PoolClosed): void {
  let poolAddress = event.address.toHexString();
  let pool = Pool.load(poolAddress);

  if (pool == null) {
    return;
  }

  pool.state = "CLOSED";
  pool.save();
}

export function handleNumbersAssigned(event: NumbersAssigned): void {
  let poolAddress = event.address.toHexString();
  let pool = Pool.load(poolAddress);

  if (pool == null) {
    return;
  }

  let rowNumbers: i32[] = [];
  let colNumbers: i32[] = [];

  for (let i = 0; i < 10; i++) {
    rowNumbers.push(event.params.rowNumbers[i] as i32);
    colNumbers.push(event.params.colNumbers[i] as i32);
  }

  pool.rowNumbers = rowNumbers;
  pool.colNumbers = colNumbers;
  pool.state = "NUMBERS_ASSIGNED";
  pool.save();
}

export function handleScoreSubmitted(event: ScoreSubmitted): void {
  let poolAddress = event.address.toHexString();
  let pool = Pool.load(poolAddress);

  if (pool == null) {
    return;
  }

  let quarter = event.params.quarter;
  let scoreId = poolAddress + "-" + quarter.toString();

  let score = Score.load(scoreId);
  if (score == null) {
    score = new Score(scoreId);
    score.pool = pool.id;
    score.quarter = quarter;
    score.settled = false;
  }

  score.teamAScore = event.params.teamAScore;
  score.teamBScore = event.params.teamBScore;
  score.submitted = true;
  score.assertionId = event.params.assertionId;
  score.submittedAt = event.block.timestamp;
  score.save();
}

export function handleScoreSettled(event: ScoreSettled): void {
  let poolAddress = event.address.toHexString();
  let pool = Pool.load(poolAddress);

  if (pool == null) {
    return;
  }

  let quarter = event.params.quarter;
  let scoreId = poolAddress + "-" + quarter.toString();

  let score = Score.load(scoreId);
  if (score == null) {
    return;
  }

  score.settled = true;
  score.winner = event.params.winner;
  score.payout = event.params.payout;
  score.settledAt = event.block.timestamp;
  score.save();

  // Update pool state based on quarter
  if (quarter == 0) {
    pool.state = "Q1_SCORED";
  } else if (quarter == 1) {
    pool.state = "Q2_SCORED";
  } else if (quarter == 2) {
    pool.state = "Q3_SCORED";
  } else if (quarter == 3) {
    pool.state = "FINAL_SCORED";
  }
  pool.save();

  // Update winner's user pool
  if (event.params.winner != Address.zero()) {
    let user = getOrCreateUser(event.params.winner);
    user.totalWon = user.totalWon.plus(event.params.payout);
    user.save();

    let userPool = getOrCreateUserPool(user, pool);
    let wonQuarters = userPool.wonQuarters;
    wonQuarters.push(quarter);
    userPool.wonQuarters = wonQuarters;
    userPool.totalWon = userPool.totalWon.plus(event.params.payout);
    userPool.save();
  }
}

export function handlePayoutClaimed(event: PayoutClaimed): void {
  // Payout claimed event - could track claimed status
  // The actual payout tracking is done in ScoreSettled
}
