// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISquaresPool {
    // Enums
    enum PoolState {
        OPEN,           // Squares can be purchased
        CLOSED,         // No more purchases, awaiting VRF randomness
        NUMBERS_ASSIGNED, // VRF fulfilled, game in progress
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
        uint256 vrfTriggerTime;     // When VRF should be triggered
        bytes32 passwordHash;       // keccak256(password) for private pools, bytes32(0) for public
    }

    struct Score {
        uint8 teamAScore;
        uint8 teamBScore;
        bool submitted;
        bool settled;
        bytes32 requestId;  // Reserved for compatibility
    }

    // Events
    event SquarePurchased(address indexed buyer, uint8 indexed position, uint256 price);
    event PoolClosed(uint256 timestamp);
    event VRFRequested(uint256 requestId);
    event NumbersAssigned(uint8[10] rowNumbers, uint8[10] colNumbers);
    event ScoreSubmitted(Quarter indexed quarter, uint8 teamAScore, uint8 teamBScore, bytes32 requestId);
    event ScoreSettled(Quarter indexed quarter, address winner, uint256 payout);
    event PayoutClaimed(address indexed winner, Quarter indexed quarter, uint256 amount);
    event UnclaimedWinningsRolled(Quarter indexed quarter, uint256 amount, uint256 newTotalRolled);
    event FinalDistributionCalculated(uint256 totalAmount, uint256 squaresSold);
    event FinalDistributionClaimed(address indexed user, uint256 amount, uint256 squaresOwned);

    // Player functions
    function buySquares(uint8[] calldata positions, string calldata password) external payable;
    function claimPayout(Quarter quarter) external;

    // VRF functions
    function closePoolAndRequestVRF() external;
    function closePoolAndRequestVRFFromFactory() external;

    // Score functions
    function submitScore(Quarter quarter, uint8 teamAScore, uint8 teamBScore) external;
    function submitScoreFromFactory(uint8 quarter, uint8 teamAScore, uint8 teamBScore) external;

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
    function getVRFStatus() external view returns (
        uint256 vrfTriggerTime,
        bool vrfRequested,
        uint256 vrfRequestId,
        bool numbersAssigned
    );
    function getFinalDistributionShare(address user) external view returns (uint256 share, bool claimed);
    function getUnclaimedInfo() external view returns (
        uint256 rolledAmount,
        uint256 distributionPool,
        bool distributionReady
    );
}
