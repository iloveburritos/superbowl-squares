// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISquaresPool} from "./interfaces/ISquaresPool.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IVRFCoordinatorV2Plus, VRFConsumerBaseV2Plus, VRFV2PlusClient} from "./interfaces/IVRFCoordinatorV2Plus.sol";
import {SquaresLib} from "./libraries/SquaresLib.sol";

/// @title SquaresPool
/// @notice Super Bowl Squares with Chainlink VRF for randomness and admin score submission
contract SquaresPool is ISquaresPool, VRFConsumerBaseV2Plus {
    // ============ Constants ============
    uint16 private constant VRF_REQUEST_CONFIRMATIONS = 3;
    uint32 private constant VRF_NUM_WORDS = 1;
    uint32 private constant VRF_CALLBACK_GAS_LIMIT = 500000;

    // ============ Immutables ============
    address public immutable factory;
    address public immutable operator;

    // ============ Pool Configuration ============
    string public name;
    uint256 public squarePrice;
    address public paymentToken;
    uint8 public maxSquaresPerUser;
    uint8[4] public payoutPercentages;
    string public teamAName;
    string public teamBName;
    uint256 public purchaseDeadline;
    uint256 public vrfTriggerTime;

    // Chainlink VRF Configuration
    uint256 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;

    // ============ State ============
    PoolState public state;
    bytes32 public passwordHash;
    address[100] public grid;
    uint8[10] public rowNumbers;
    uint8[10] public colNumbers;
    bool public numbersSet;
    uint256 public totalPot;
    uint256 public squaresSold;

    // VRF state
    uint256 public vrfRequestId;
    bool public vrfRequested;

    // Score tracking
    mapping(Quarter => Score) public scores;

    // User tracking
    mapping(address => uint8) public userSquareCount;
    mapping(address => mapping(Quarter => bool)) public payoutClaimed;

    // Unclaimed winnings tracking
    uint256 public unclaimedRolledAmount;
    uint256 public finalDistributionPool;
    bool public finalDistributionCalculated;
    mapping(address => bool) public finalDistributionClaimed;

    // ============ Errors ============
    error InvalidState(PoolState current, PoolState required);
    error SquareAlreadyOwned(uint8 position);
    error InvalidPosition(uint8 position);
    error MaxSquaresExceeded(address user, uint8 current, uint8 max);
    error InsufficientPayment(uint256 sent, uint256 required);
    error TransferFailed();
    error PurchaseDeadlinePassed();
    error VRFTriggerTimeNotReached();
    error VRFAlreadyRequested();
    error OnlyOperator();
    error OnlyFactory();
    error PayoutAlreadyClaimed();
    error NotWinner();
    error ScoreNotSettled();
    error InvalidPayoutPercentages();
    error InvalidQuarterProgression();
    error InvalidPassword();
    error NoSquaresSold();

    // ============ Modifiers ============
    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    modifier inState(PoolState required) {
        if (state != required) revert InvalidState(state, required);
        _;
    }

    // ============ Constructor ============
    constructor(
        address _vrfCoordinator,
        address _operator
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        factory = msg.sender;
        operator = _operator;
        state = PoolState.OPEN;
    }

    // ============ Initialization ============
    function initialize(PoolParams calldata params) external onlyFactory {
        if (!SquaresLib.validatePayoutPercentages(params.payoutPercentages)) {
            revert InvalidPayoutPercentages();
        }

        name = params.name;
        squarePrice = params.squarePrice;
        paymentToken = params.paymentToken;
        maxSquaresPerUser = params.maxSquaresPerUser;
        payoutPercentages = params.payoutPercentages;
        teamAName = params.teamAName;
        teamBName = params.teamBName;
        purchaseDeadline = params.purchaseDeadline;
        vrfTriggerTime = params.vrfTriggerTime;
        passwordHash = params.passwordHash;
    }

    /// @notice Set Chainlink VRF configuration (called by factory)
    function setVRFConfig(
        uint256 _subscriptionId,
        bytes32 _keyHash
    ) external onlyFactory {
        vrfSubscriptionId = _subscriptionId;
        vrfKeyHash = _keyHash;
    }

    // ============ Player Functions ============

    function buySquares(uint8[] calldata positions, string calldata password) external payable inState(PoolState.OPEN) {
        if (block.timestamp > purchaseDeadline) revert PurchaseDeadlinePassed();

        // Verify password for private pools
        if (passwordHash != bytes32(0)) {
            if (keccak256(bytes(password)) != passwordHash) revert InvalidPassword();
        }

        uint256 totalCost = squarePrice * positions.length;

        // Always track user square count for final distribution
        uint8 newCount = userSquareCount[msg.sender] + uint8(positions.length);

        // Check max squares limit if set
        if (maxSquaresPerUser > 0 && newCount > maxSquaresPerUser) {
            revert MaxSquaresExceeded(msg.sender, userSquareCount[msg.sender], maxSquaresPerUser);
        }
        userSquareCount[msg.sender] = newCount;

        if (paymentToken == address(0)) {
            if (msg.value < totalCost) revert InsufficientPayment(msg.value, totalCost);
            if (msg.value > totalCost) {
                (bool success,) = msg.sender.call{value: msg.value - totalCost}("");
                if (!success) revert TransferFailed();
            }
        } else {
            bool success = IERC20(paymentToken).transferFrom(msg.sender, address(this), totalCost);
            if (!success) revert TransferFailed();
        }

        for (uint256 i = 0; i < positions.length; i++) {
            uint8 pos = positions[i];
            if (pos >= 100) revert InvalidPosition(pos);
            if (grid[pos] != address(0)) revert SquareAlreadyOwned(pos);

            grid[pos] = msg.sender;
            emit SquarePurchased(msg.sender, pos, squarePrice);
        }

        totalPot += totalCost;
        squaresSold += positions.length;
    }

    function claimPayout(Quarter quarter) external {
        if (uint8(quarter) == 0 && state < PoolState.Q1_SCORED) revert ScoreNotSettled();
        if (uint8(quarter) == 1 && state < PoolState.Q2_SCORED) revert ScoreNotSettled();
        if (uint8(quarter) == 2 && state < PoolState.Q3_SCORED) revert ScoreNotSettled();
        if (uint8(quarter) == 3 && state < PoolState.FINAL_SCORED) revert ScoreNotSettled();

        if (payoutClaimed[msg.sender][quarter]) revert PayoutAlreadyClaimed();

        (address winner, uint256 payout) = getWinner(quarter);
        if (msg.sender != winner) revert NotWinner();

        payoutClaimed[msg.sender][quarter] = true;

        if (paymentToken == address(0)) {
            (bool success,) = msg.sender.call{value: payout}("");
            if (!success) revert TransferFailed();
        } else {
            bool success = IERC20(paymentToken).transfer(msg.sender, payout);
            if (!success) revert TransferFailed();
        }

        emit PayoutClaimed(msg.sender, quarter, payout);
    }


    // ============ VRF Trigger Functions ============

    /// @notice Close pool and request VRF (called by factory for batch trigger)
    /// @dev Only the factory can call this (triggered by admin/scoreAdmin via triggerVRFForAllPools)
    function closePoolAndRequestVRFFromFactory() external onlyFactory inState(PoolState.OPEN) {
        if (squaresSold == 0) revert NoSquaresSold();
        if (vrfRequested) revert VRFAlreadyRequested();
        _closeAndRequestVRF();
    }

    /// @notice Internal function to close pool and request VRF
    function _closeAndRequestVRF() internal {
        state = PoolState.CLOSED;
        emit PoolClosed(block.timestamp);

        // Request VRF randomness with native payment
        vrfRequestId = vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: vrfKeyHash,
                subId: vrfSubscriptionId,
                requestConfirmations: VRF_REQUEST_CONFIRMATIONS,
                callbackGasLimit: VRF_CALLBACK_GAS_LIMIT,
                numWords: VRF_NUM_WORDS,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: true})
                )
            })
        );

        vrfRequested = true;
        emit VRFRequested(vrfRequestId);
    }

    // ============ Chainlink VRF Callback ============

    /// @notice VRF callback to assign random numbers
    /// @param requestId The VRF request ID
    /// @param randomWords The random words from VRF
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        if (requestId != vrfRequestId) return;
        if (state != PoolState.CLOSED) return;

        uint256 randomness = randomWords[0];

        // Use randomness for row/column assignment
        rowNumbers = SquaresLib.fisherYatesShuffle(randomness);
        colNumbers = SquaresLib.fisherYatesShuffle(uint256(keccak256(abi.encodePacked(randomness, uint256(1)))));
        numbersSet = true;

        state = PoolState.NUMBERS_ASSIGNED;
        emit NumbersAssigned(rowNumbers, colNumbers);
    }

    // ============ Score Submission (Factory Only) ============

    /// @notice Submit score from factory (admin score submission)
    /// @param quarter The quarter to submit score for (0=Q1, 1=Q2, 2=Q3, 3=Final)
    /// @param teamAScore Team A's score
    /// @param teamBScore Team B's score
    function submitScoreFromFactory(
        uint8 quarter,
        uint8 teamAScore,
        uint8 teamBScore
    ) external onlyFactory {
        // Validate state - must have numbers assigned
        if (state < PoolState.NUMBERS_ASSIGNED) revert InvalidState(state, PoolState.NUMBERS_ASSIGNED);

        // Validate quarter progression
        if (quarter == 0 && state != PoolState.NUMBERS_ASSIGNED) revert InvalidQuarterProgression();
        if (quarter == 1 && state != PoolState.Q1_SCORED) revert InvalidQuarterProgression();
        if (quarter == 2 && state != PoolState.Q2_SCORED) revert InvalidQuarterProgression();
        if (quarter == 3 && state != PoolState.Q3_SCORED) revert InvalidQuarterProgression();

        Quarter q = Quarter(quarter);

        // Store score
        scores[q] = Score({
            teamAScore: teamAScore,
            teamBScore: teamBScore,
            submitted: true,
            settled: true,
            requestId: bytes32(0)
        });

        // Update state
        if (quarter == 0) state = PoolState.Q1_SCORED;
        else if (quarter == 1) state = PoolState.Q2_SCORED;
        else if (quarter == 2) state = PoolState.Q3_SCORED;
        else if (quarter == 3) state = PoolState.FINAL_SCORED;

        // Auto-payout the winner
        _settleQuarter(q);

        emit ScoreSubmitted(q, teamAScore, teamBScore, bytes32(0));
    }

    /// @notice Operator can manually submit scores (fallback)
    function submitScore(Quarter quarter, uint8 teamAScore, uint8 teamBScore) external {
        // Only operator can manually submit (fallback if APIs fail)
        if (msg.sender != operator) revert OnlyOperator();
        _validateQuarterProgression(quarter);

        Score storage score = scores[quarter];
        score.teamAScore = teamAScore;
        score.teamBScore = teamBScore;
        score.submitted = true;
        score.settled = true;

        _advanceState(quarter);

        // Auto-payout or roll forward unclaimed winnings
        _settleQuarter(quarter);

        emit ScoreSubmitted(quarter, teamAScore, teamBScore, bytes32(0));
    }

    // ============ Internal Functions ============

    function _validateQuarterProgression(Quarter quarter) internal view {
        if (quarter == Quarter.Q1 && state != PoolState.NUMBERS_ASSIGNED) {
            revert InvalidState(state, PoolState.NUMBERS_ASSIGNED);
        }
        if (quarter == Quarter.Q2 && state != PoolState.Q1_SCORED) {
            revert InvalidState(state, PoolState.Q1_SCORED);
        }
        if (quarter == Quarter.Q3 && state != PoolState.Q2_SCORED) {
            revert InvalidState(state, PoolState.Q2_SCORED);
        }
        if (quarter == Quarter.FINAL && state != PoolState.Q3_SCORED) {
            revert InvalidState(state, PoolState.Q3_SCORED);
        }
    }

    function _advanceState(Quarter quarter) internal {
        if (quarter == Quarter.Q1) state = PoolState.Q1_SCORED;
        else if (quarter == Quarter.Q2) state = PoolState.Q2_SCORED;
        else if (quarter == Quarter.Q3) state = PoolState.Q3_SCORED;
        else state = PoolState.FINAL_SCORED;
    }

    function _settleQuarter(Quarter quarter) internal {
        (address winner, uint256 payout) = getWinner(quarter);

        // Add any rolled amount from previous quarters
        uint256 effectivePayout = payout + unclaimedRolledAmount;

        if (winner != address(0) && effectivePayout > 0) {
            // Winner exists - pay them base payout + any rolled amount
            payoutClaimed[winner][quarter] = true;
            unclaimedRolledAmount = 0;

            if (paymentToken == address(0)) {
                (bool success,) = winner.call{value: effectivePayout}("");
                if (!success) revert TransferFailed();
            } else {
                bool success = IERC20(paymentToken).transfer(winner, effectivePayout);
                if (!success) revert TransferFailed();
            }

            emit PayoutClaimed(winner, quarter, effectivePayout);
        } else if (payout > 0) {
            // No winner - roll this quarter's payout forward
            unclaimedRolledAmount += payout;
            emit UnclaimedWinningsRolled(quarter, payout, unclaimedRolledAmount);
        }

        // After FINAL, any remaining rolled amount gets auto-distributed to all square owners
        if (quarter == Quarter.FINAL && unclaimedRolledAmount > 0) {
            uint256 totalToDistribute = unclaimedRolledAmount;
            finalDistributionPool = totalToDistribute;
            finalDistributionCalculated = true;
            unclaimedRolledAmount = 0;

            emit FinalDistributionCalculated(totalToDistribute, squaresSold);

            // Auto-distribute to all square owners
            for (uint256 i = 0; i < 100; i++) {
                address owner = grid[i];
                if (owner != address(0) && !finalDistributionClaimed[owner]) {
                    finalDistributionClaimed[owner] = true;

                    uint256 ownerSquares = userSquareCount[owner];
                    uint256 ownerShare = (totalToDistribute * ownerSquares) / squaresSold;

                    if (paymentToken == address(0)) {
                        (bool success,) = owner.call{value: ownerShare}("");
                        if (success) {
                            emit FinalDistributionClaimed(owner, ownerShare, ownerSquares);
                        }
                    } else {
                        bool success = IERC20(paymentToken).transfer(owner, ownerShare);
                        if (success) {
                            emit FinalDistributionClaimed(owner, ownerShare, ownerSquares);
                        }
                    }
                }
            }
        }

        emit ScoreSettled(quarter, winner, payout);
    }

    // ============ View Functions ============

    function getGrid() external view returns (address[100] memory) {
        return grid;
    }

    function getNumbers() external view returns (uint8[10] memory rows, uint8[10] memory cols) {
        return (rowNumbers, colNumbers);
    }

    function getWinner(Quarter quarter) public view returns (address winner, uint256 payout) {
        Score storage score = scores[quarter];
        if (!score.settled) return (address(0), 0);

        uint8 winningPosition = SquaresLib.getWinningPosition(
            score.teamAScore,
            score.teamBScore,
            rowNumbers,
            colNumbers
        );

        winner = grid[winningPosition];
        payout = SquaresLib.calculatePayout(totalPot, payoutPercentages[uint8(quarter)]);
    }

    function getPoolInfo()
        external
        view
        returns (
            string memory _name,
            PoolState _state,
            uint256 _squarePrice,
            address _paymentToken,
            uint256 _totalPot,
            uint256 _squaresSold,
            string memory _teamAName,
            string memory _teamBName
        )
    {
        return (name, state, squarePrice, paymentToken, totalPot, squaresSold, teamAName, teamBName);
    }

    function getScore(Quarter quarter) external view returns (Score memory) {
        return scores[quarter];
    }

    function getPayoutPercentages() external view returns (uint8[4] memory) {
        return payoutPercentages;
    }

    function hasClaimed(address user, Quarter quarter) external view returns (bool) {
        return payoutClaimed[user][quarter];
    }

    function isPrivate() external view returns (bool) {
        return passwordHash != bytes32(0);
    }

    function getVRFStatus() external view returns (
        uint256 _vrfTriggerTime,
        bool _vrfRequested,
        uint256 _vrfRequestId,
        bool _numbersAssigned
    ) {
        return (vrfTriggerTime, vrfRequested, vrfRequestId, numbersSet);
    }

    /// @notice Get user's share of final distribution
    function getFinalDistributionShare(address user) external view returns (uint256 share, bool claimed) {
        claimed = finalDistributionClaimed[user];
        if (!finalDistributionCalculated || finalDistributionPool == 0) return (0, claimed);
        uint256 userSquares = userSquareCount[user];
        if (userSquares == 0) return (0, claimed);
        share = (finalDistributionPool * userSquares) / squaresSold;
    }

    /// @notice Get unclaimed winnings info
    function getUnclaimedInfo() external view returns (
        uint256 rolledAmount,
        uint256 distributionPool,
        bool distributionReady
    ) {
        rolledAmount = unclaimedRolledAmount;
        distributionPool = finalDistributionPool;
        distributionReady = finalDistributionCalculated && finalDistributionPool > 0;
    }

    // ============ Receive ETH ============
    receive() external payable {}
}
