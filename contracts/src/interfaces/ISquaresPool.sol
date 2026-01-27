// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISquaresPool {
    // Enums
    enum PoolState {
        OPEN,           // Squares can be purchased
        CLOSED,         // No more purchases, awaiting randomness reveal
        NUMBERS_ASSIGNED, // Randomness revealed, game in progress
        Q1_SCORED,      // Quarter 1 score settled
        Q2_SCORED,      // Quarter 2 score settled
        Q3_SCORED,      // Quarter 3 score settled
        FINAL_SCORED    // Final score settled, game complete
    }

    enum Quarter {
        Q1,
        Q2,
        Q3,
        FINAL
    }

    // Structs
    struct PoolParams {
        string name;
        uint256 squarePrice;
        address paymentToken;       // address(0) for ETH
        uint8 maxSquaresPerUser;    // 0 = unlimited
        uint8[4] payoutPercentages; // [Q1, Q2, Q3, Final] must sum to 100
        string teamAName;
        string teamBName;
        uint256 purchaseDeadline;
        uint256 revealDeadline;
        bytes32 passwordHash;       // keccak256(password) for private pools, bytes32(0) for public
    }

    struct Score {
        uint8 teamAScore;
        uint8 teamBScore;
        bool submitted;
        bool settled;
        bytes32 requestId;  // Chainlink Functions request ID
    }

    // Events
    event SquarePurchased(address indexed buyer, uint8 indexed position, uint256 price);
    event PoolClosed(uint256 timestamp);
    event RandomnessCommitted(bytes32 commitment, uint256 commitBlock);
    event RandomnessRevealed(uint256 seed, bytes32 blockhash_);
    event NumbersAssigned(uint8[10] rowNumbers, uint8[10] colNumbers);
    event ScoreFetchRequested(Quarter indexed quarter, bytes32 requestId);
    event ScoreVerified(Quarter indexed quarter, uint8 teamAScore, uint8 teamBScore, bool verified);
    event ScoreSubmitted(Quarter indexed quarter, uint8 teamAScore, uint8 teamBScore, bytes32 requestId);
    event ScoreSettled(Quarter indexed quarter, address winner, uint256 payout);
    event PayoutClaimed(address indexed winner, Quarter indexed quarter, uint256 amount);

    // Player functions
    function buySquares(uint8[] calldata positions, string calldata password) external payable;
    function claimPayout(Quarter quarter) external;

    // Operator functions
    function closePool() external;
    function commitRandomness(bytes32 _commitment) external;
    function revealRandomness(uint256 seed) external;

    // Score functions (Chainlink Functions)
    function fetchScore(Quarter quarter) external returns (bytes32 requestId);
    function submitScore(Quarter quarter, uint8 teamAScore, uint8 teamBScore) external;
    function settleScore(Quarter quarter) external;

    // View functions
    function getGrid() external view returns (address[100] memory);
    function getNumbers() external view returns (uint8[10] memory rows, uint8[10] memory cols);
    function getWinner(Quarter quarter) external view returns (address winner, uint256 payout);
    function getPoolInfo() external view returns (
        string memory name,
        PoolState state,
        uint256 squarePrice,
        address paymentToken,
        uint256 totalPot,
        uint256 squaresSold,
        string memory teamAName,
        string memory teamBName
    );
    function getScore(Quarter quarter) external view returns (Score memory);
}
