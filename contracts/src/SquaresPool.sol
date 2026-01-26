// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISquaresPool} from "./interfaces/ISquaresPool.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IVRFCoordinatorV2Plus, VRFConsumerBaseV2Plus} from "./interfaces/IVRF.sol";
import {IOptimisticOracleV3, OptimisticOracleV3CallbackRecipient} from "./interfaces/IOptimisticOracleV3.sol";
import {SquaresLib} from "./libraries/SquaresLib.sol";

/// @title SquaresPool
/// @notice A Super Bowl Squares betting pool with VRF randomness and UMA oracle for scores
contract SquaresPool is ISquaresPool, VRFConsumerBaseV2Plus, OptimisticOracleV3CallbackRecipient {
    // ============ Constants ============
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant CALLBACK_GAS_LIMIT = 500000;
    uint32 private constant NUM_WORDS = 2; // One for rows, one for columns

    // Extra args for VRF v2.5 native payment
    bytes private constant EXTRA_ARGS = abi.encode(true); // nativePayment = true

    // ============ Immutables ============
    address public immutable factory;
    address public immutable operator;
    IOptimisticOracleV3 public immutable umaOracle;
    address public immutable umaBondToken;

    // ============ Pool Configuration ============
    string public name;
    uint256 public squarePrice;
    address public paymentToken; // address(0) for ETH
    uint8 public maxSquaresPerUser;
    uint8[4] public payoutPercentages;
    string public teamAName;
    string public teamBName;
    uint256 public purchaseDeadline;
    uint256 public vrfDeadline;

    // VRF Configuration
    uint64 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;

    // UMA Configuration
    uint64 public umaDisputePeriod;
    uint256 public umaBondAmount;

    // ============ State ============
    PoolState public state;
    address[100] public grid;
    uint8[10] public rowNumbers;
    uint8[10] public colNumbers;
    bool public numbersSet;
    uint256 public totalPot;
    uint256 public squaresSold;

    // VRF state
    uint256 public vrfRequestId;

    // Score tracking
    mapping(Quarter => Score) public scores;

    // User tracking
    mapping(address => uint8) public userSquareCount;
    mapping(address => mapping(Quarter => bool)) public payoutClaimed;

    // Assertion tracking
    mapping(bytes32 => Quarter) public assertionToQuarter;

    // ============ Errors ============
    error InvalidState(PoolState current, PoolState required);
    error SquareAlreadyOwned(uint8 position);
    error InvalidPosition(uint8 position);
    error MaxSquaresExceeded(address user, uint8 current, uint8 max);
    error InsufficientPayment(uint256 sent, uint256 required);
    error TransferFailed();
    error PurchaseDeadlinePassed();
    error VRFDeadlinePassed();
    error OnlyOperator();
    error OnlyFactory();
    error PayoutAlreadyClaimed();
    error NotWinner();
    error ScoreNotSettled();
    error InvalidPayoutPercentages();
    error ScoreAlreadySubmitted();
    error AssertionNotSettled();
    error OnlyUMAOracle();

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
        address _umaOracle,
        address _umaBondToken,
        address _operator
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        factory = msg.sender;
        operator = _operator;
        umaOracle = IOptimisticOracleV3(_umaOracle);
        umaBondToken = _umaBondToken;
        state = PoolState.OPEN;
    }

    // ============ Initialization ============
    /// @notice Initialize the pool with parameters (called by factory)
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
        vrfDeadline = params.vrfDeadline;
        vrfSubscriptionId = params.vrfSubscriptionId;
        vrfKeyHash = params.vrfKeyHash;
        umaDisputePeriod = uint64(params.umaDisputePeriod);
        umaBondAmount = params.umaBondAmount;
    }

    // ============ Player Functions ============

    /// @inheritdoc ISquaresPool
    function buySquares(uint8[] calldata positions) external payable inState(PoolState.OPEN) {
        if (block.timestamp > purchaseDeadline) revert PurchaseDeadlinePassed();

        uint256 totalCost = squarePrice * positions.length;

        // Check max squares per user
        if (maxSquaresPerUser > 0) {
            uint8 newCount = userSquareCount[msg.sender] + uint8(positions.length);
            if (newCount > maxSquaresPerUser) {
                revert MaxSquaresExceeded(msg.sender, userSquareCount[msg.sender], maxSquaresPerUser);
            }
            userSquareCount[msg.sender] = newCount;
        }

        // Process payment
        if (paymentToken == address(0)) {
            // ETH payment
            if (msg.value < totalCost) revert InsufficientPayment(msg.value, totalCost);
            // Refund excess
            if (msg.value > totalCost) {
                (bool success,) = msg.sender.call{value: msg.value - totalCost}("");
                if (!success) revert TransferFailed();
            }
        } else {
            // ERC-20 payment
            bool success = IERC20(paymentToken).transferFrom(msg.sender, address(this), totalCost);
            if (!success) revert TransferFailed();
        }

        // Assign squares
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

    /// @inheritdoc ISquaresPool
    function claimPayout(Quarter quarter) external {
        // Check quarter is scored
        if (uint8(quarter) == 0 && state < PoolState.Q1_SCORED) revert ScoreNotSettled();
        if (uint8(quarter) == 1 && state < PoolState.Q2_SCORED) revert ScoreNotSettled();
        if (uint8(quarter) == 2 && state < PoolState.Q3_SCORED) revert ScoreNotSettled();
        if (uint8(quarter) == 3 && state < PoolState.FINAL_SCORED) revert ScoreNotSettled();

        if (payoutClaimed[msg.sender][quarter]) revert PayoutAlreadyClaimed();

        (address winner, uint256 payout) = getWinner(quarter);
        if (msg.sender != winner) revert NotWinner();

        payoutClaimed[msg.sender][quarter] = true;

        // Transfer payout
        if (paymentToken == address(0)) {
            (bool success,) = msg.sender.call{value: payout}("");
            if (!success) revert TransferFailed();
        } else {
            bool success = IERC20(paymentToken).transfer(msg.sender, payout);
            if (!success) revert TransferFailed();
        }

        emit PayoutClaimed(msg.sender, quarter, payout);
    }

    // ============ Operator Functions ============

    /// @inheritdoc ISquaresPool
    function closePool() external onlyOperator inState(PoolState.OPEN) {
        state = PoolState.CLOSED;
        emit PoolClosed(block.timestamp);
    }

    /// @inheritdoc ISquaresPool
    function requestRandomNumbers() external onlyOperator inState(PoolState.CLOSED) returns (uint256 requestId) {
        if (block.timestamp > vrfDeadline) revert VRFDeadlinePassed();

        IVRFCoordinatorV2Plus.RandomWordsRequest memory request = IVRFCoordinatorV2Plus.RandomWordsRequest({
            keyHash: vrfKeyHash,
            subId: vrfSubscriptionId,
            requestConfirmations: REQUEST_CONFIRMATIONS,
            callbackGasLimit: CALLBACK_GAS_LIMIT,
            numWords: NUM_WORDS,
            extraArgs: EXTRA_ARGS
        });

        requestId = i_vrfCoordinator.requestRandomWords(request);
        vrfRequestId = requestId;

        return requestId;
    }

    // ============ VRF Callback ============

    /// @notice Callback from VRF with random numbers
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        if (requestId != vrfRequestId) return;
        if (state != PoolState.CLOSED) return;

        // Use first random word for rows, second for columns
        rowNumbers = SquaresLib.fisherYatesShuffle(randomWords[0]);
        colNumbers = SquaresLib.fisherYatesShuffle(randomWords[1]);
        numbersSet = true;

        state = PoolState.NUMBERS_ASSIGNED;
        emit NumbersAssigned(rowNumbers, colNumbers);
    }

    // ============ Oracle Functions ============

    /// @inheritdoc ISquaresPool
    function submitScore(Quarter quarter, uint8 teamAScore, uint8 teamBScore) external {
        // Validate state progression
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

        Score storage score = scores[quarter];
        if (score.submitted) revert ScoreAlreadySubmitted();

        // Build claim
        bytes memory claim = SquaresLib.buildScoreClaim(
            name,
            uint8(quarter) + 1,
            teamAName,
            teamBName,
            teamAScore,
            teamBScore
        );

        // Transfer bond from submitter
        IERC20(umaBondToken).transferFrom(msg.sender, address(this), umaBondAmount);
        IERC20(umaBondToken).approve(address(umaOracle), umaBondAmount);

        // Submit assertion to UMA
        bytes32 assertionId = umaOracle.assertTruth(
            claim,
            msg.sender,
            address(this), // callback recipient
            address(0), // sovereign security
            umaDisputePeriod,
            umaBondToken,
            umaBondAmount,
            umaOracle.defaultIdentifier(),
            bytes32(0) // domain id
        );

        score.teamAScore = teamAScore;
        score.teamBScore = teamBScore;
        score.submitted = true;
        score.assertionId = assertionId;

        assertionToQuarter[assertionId] = quarter;

        emit ScoreSubmitted(quarter, teamAScore, teamBScore, assertionId);
    }

    /// @inheritdoc ISquaresPool
    function settleScore(Quarter quarter) external {
        Score storage score = scores[quarter];
        if (!score.submitted) revert ScoreNotSettled();
        if (score.settled) return; // Already settled

        // Settle on UMA (will revert if not ready)
        umaOracle.settleAssertion(score.assertionId);

        // Check if assertion was truthful
        IOptimisticOracleV3.Assertion memory assertion = umaOracle.getAssertion(score.assertionId);
        if (!assertion.settled) revert AssertionNotSettled();

        if (assertion.settlementResolution) {
            // Assertion was truthful - finalize score
            _finalizeScore(quarter);
        } else {
            // Assertion was disputed and resolved false - clear submission
            score.submitted = false;
            score.teamAScore = 0;
            score.teamBScore = 0;
            score.assertionId = bytes32(0);
        }
    }

    // ============ UMA Callbacks ============

    /// @notice Called when assertion is resolved
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external {
        if (msg.sender != address(umaOracle)) revert OnlyUMAOracle();

        Quarter quarter = assertionToQuarter[assertionId];
        Score storage score = scores[quarter];

        if (assertedTruthfully) {
            _finalizeScore(quarter);
        } else {
            // Clear the submission so a new one can be made
            score.submitted = false;
            score.teamAScore = 0;
            score.teamBScore = 0;
            score.assertionId = bytes32(0);
        }
    }

    /// @notice Called when assertion is disputed
    function assertionDisputedCallback(bytes32 assertionId) external {
        if (msg.sender != address(umaOracle)) revert OnlyUMAOracle();
        // Dispute is in progress - wait for resolution
    }

    // ============ Internal Functions ============

    function _finalizeScore(Quarter quarter) internal {
        Score storage score = scores[quarter];
        score.settled = true;

        // Update state
        if (quarter == Quarter.Q1) state = PoolState.Q1_SCORED;
        else if (quarter == Quarter.Q2) state = PoolState.Q2_SCORED;
        else if (quarter == Quarter.Q3) state = PoolState.Q3_SCORED;
        else state = PoolState.FINAL_SCORED;

        // Emit winner event
        (address winner, uint256 payout) = getWinner(quarter);
        emit ScoreSettled(quarter, winner, payout);
    }

    // ============ View Functions ============

    /// @inheritdoc ISquaresPool
    function getGrid() external view returns (address[100] memory) {
        return grid;
    }

    /// @inheritdoc ISquaresPool
    function getNumbers() external view returns (uint8[10] memory rows, uint8[10] memory cols) {
        return (rowNumbers, colNumbers);
    }

    /// @inheritdoc ISquaresPool
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

    /// @inheritdoc ISquaresPool
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

    /// @inheritdoc ISquaresPool
    function getScore(Quarter quarter) external view returns (Score memory) {
        return scores[quarter];
    }

    /// @notice Get payout percentages
    function getPayoutPercentages() external view returns (uint8[4] memory) {
        return payoutPercentages;
    }

    /// @notice Check if user has claimed payout for a quarter
    function hasClaimed(address user, Quarter quarter) external view returns (bool) {
        return payoutClaimed[user][quarter];
    }

    // ============ Receive ETH ============
    receive() external payable {}
}
