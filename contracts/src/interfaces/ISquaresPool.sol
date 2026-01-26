// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISquaresPool {
    // Enums
    enum PoolState {
        OPEN,           // Squares can be purchased
        CLOSED,         // No more purchases, awaiting VRF
        NUMBERS_ASSIGNED, // VRF complete, game in progress
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
        uint256 vrfDeadline;
        uint64 vrfSubscriptionId;
        bytes32 vrfKeyHash;
        uint256 umaDisputePeriod;
        uint256 umaBondAmount;
    }

    struct Score {
        uint8 teamAScore;
        uint8 teamBScore;
        bool submitted;
        bool settled;
        bytes32 assertionId;
    }

    // Events
    event SquarePurchased(address indexed buyer, uint8 indexed position, uint256 price);
    event PoolClosed(uint256 timestamp);
    event NumbersAssigned(uint8[10] rowNumbers, uint8[10] colNumbers);
    event ScoreSubmitted(Quarter indexed quarter, uint8 teamAScore, uint8 teamBScore, bytes32 assertionId);
    event ScoreSettled(Quarter indexed quarter, address winner, uint256 payout);
    event PayoutClaimed(address indexed winner, Quarter indexed quarter, uint256 amount);

    // Player functions
    function buySquares(uint8[] calldata positions) external payable;
    function claimPayout(Quarter quarter) external;

    // Operator functions
    function closePool() external;
    function requestRandomNumbers() external returns (uint256 requestId);

    // Oracle functions
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
