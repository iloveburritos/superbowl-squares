// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISquaresPool} from "./interfaces/ISquaresPool.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IFunctionsRouter, IFunctionsClient, FunctionsRequest, FunctionsRequestLib} from "./interfaces/IFunctionsClient.sol";
import {SquaresLib} from "./libraries/SquaresLib.sol";

/// @title SquaresPool
/// @notice Super Bowl Squares with commit-reveal randomness + Chainlink Functions for multi-source score verification
contract SquaresPool is ISquaresPool, IFunctionsClient {
    using FunctionsRequestLib for FunctionsRequest;

    // ============ Constants ============
    uint32 private constant FUNCTIONS_CALLBACK_GAS_LIMIT = 300000;
    uint16 private constant FUNCTIONS_DATA_VERSION = 1;

    // ============ Immutables ============
    address public immutable factory;
    address public immutable operator;
    IFunctionsRouter public immutable functionsRouter;

    // ============ Pool Configuration ============
    string public name;
    uint256 public squarePrice;
    address public paymentToken;
    uint8 public maxSquaresPerUser;
    uint8[4] public payoutPercentages;
    string public teamAName;
    string public teamBName;
    uint256 public purchaseDeadline;
    uint256 public revealDeadline;

    // Chainlink Functions Configuration
    uint64 public functionsSubscriptionId;
    bytes32 public functionsDonId;
    string public functionsSource; // JavaScript source code

    // ============ State ============
    PoolState public state;
    bytes32 public passwordHash;
    address[100] public grid;
    uint8[10] public rowNumbers;
    uint8[10] public colNumbers;
    bool public numbersSet;
    uint256 public totalPot;
    uint256 public squaresSold;

    // Commit-reveal state
    bytes32 public commitment;
    uint256 public commitBlock;

    // Score tracking
    mapping(Quarter => Score) public scores;
    mapping(bytes32 => Quarter) public requestIdToQuarter;

    // User tracking
    mapping(address => uint8) public userSquareCount;
    mapping(address => mapping(Quarter => bool)) public payoutClaimed;

    // ============ Errors ============
    error InvalidState(PoolState current, PoolState required);
    error SquareAlreadyOwned(uint8 position);
    error InvalidPosition(uint8 position);
    error MaxSquaresExceeded(address user, uint8 current, uint8 max);
    error InsufficientPayment(uint256 sent, uint256 required);
    error TransferFailed();
    error PurchaseDeadlinePassed();
    error RevealDeadlinePassed();
    error AlreadyCommitted();
    error NotCommitted();
    error RevealTooEarly();
    error RevealTooLate();
    error InvalidReveal();
    error OnlyOperator();
    error OnlyFactory();
    error OnlyFunctionsRouter();
    error PayoutAlreadyClaimed();
    error NotWinner();
    error ScoreNotSettled();
    error InvalidPayoutPercentages();
    error ScoreAlreadyPending();
    error ScoreVerificationFailed();
    error InvalidQuarterProgression();
    error InvalidPassword();

    // ============ Modifiers ============
    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    modifier onlyFunctionsRouter() {
        if (msg.sender != address(functionsRouter)) revert OnlyFunctionsRouter();
        _;
    }

    modifier inState(PoolState required) {
        if (state != required) revert InvalidState(state, required);
        _;
    }

    // ============ Constructor ============
    constructor(
        address _functionsRouter,
        address _operator
    ) {
        factory = msg.sender;
        operator = _operator;
        functionsRouter = IFunctionsRouter(_functionsRouter);
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
        revealDeadline = params.revealDeadline;
        passwordHash = params.passwordHash;
    }

    /// @notice Set Chainlink Functions configuration (called by factory or operator)
    function setFunctionsConfig(
        uint64 _subscriptionId,
        bytes32 _donId,
        string calldata _source
    ) external {
        if (msg.sender != factory && msg.sender != operator) revert OnlyOperator();
        functionsSubscriptionId = _subscriptionId;
        functionsDonId = _donId;
        functionsSource = _source;
    }

    // ============ Player Functions ============

    function buySquares(uint8[] calldata positions, string calldata password) external payable inState(PoolState.OPEN) {
        if (block.timestamp > purchaseDeadline) revert PurchaseDeadlinePassed();

        // Verify password for private pools
        if (passwordHash != bytes32(0)) {
            if (keccak256(bytes(password)) != passwordHash) revert InvalidPassword();
        }

        uint256 totalCost = squarePrice * positions.length;

        if (maxSquaresPerUser > 0) {
            uint8 newCount = userSquareCount[msg.sender] + uint8(positions.length);
            if (newCount > maxSquaresPerUser) {
                revert MaxSquaresExceeded(msg.sender, userSquareCount[msg.sender], maxSquaresPerUser);
            }
            userSquareCount[msg.sender] = newCount;
        }

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

    // ============ Operator Functions ============

    function closePool() external onlyOperator inState(PoolState.OPEN) {
        state = PoolState.CLOSED;
        emit PoolClosed(block.timestamp);
    }

    function commitRandomness(bytes32 _commitment) external onlyOperator inState(PoolState.CLOSED) {
        if (block.timestamp > revealDeadline) revert RevealDeadlinePassed();
        if (commitment != bytes32(0)) revert AlreadyCommitted();

        commitment = _commitment;
        commitBlock = block.number;

        emit RandomnessCommitted(_commitment, block.number);
    }

    function revealRandomness(uint256 seed) external onlyOperator inState(PoolState.CLOSED) {
        if (commitment == bytes32(0)) revert NotCommitted();
        if (block.number <= commitBlock) revert RevealTooEarly();

        bytes32 commitBlockHash = blockhash(commitBlock);
        if (commitBlockHash == bytes32(0)) revert RevealTooLate();

        if (keccak256(abi.encodePacked(seed)) != commitment) revert InvalidReveal();

        // Generate final randomness by combining seed with blockhash
        uint256 randomness = uint256(keccak256(abi.encodePacked(seed, commitBlockHash)));

        emit RandomnessRevealed(seed, commitBlockHash);

        // Use randomness for row/column assignment
        rowNumbers = SquaresLib.fisherYatesShuffle(randomness);
        colNumbers = SquaresLib.fisherYatesShuffle(uint256(keccak256(abi.encodePacked(randomness, uint256(1)))));
        numbersSet = true;

        state = PoolState.NUMBERS_ASSIGNED;
        emit NumbersAssigned(rowNumbers, colNumbers);
    }

    // ============ Score Fetching (Chainlink Functions) ============

    /// @notice Request score from multiple sources via Chainlink Functions
    /// @param quarter The quarter to fetch scores for
    /// @dev Anyone can call this after numbers are assigned
    function fetchScore(Quarter quarter) external returns (bytes32 requestId) {
        // Validate state progression
        _validateQuarterProgression(quarter);

        Score storage score = scores[quarter];
        if (score.submitted) revert ScoreAlreadyPending();

        // Build the request
        string[] memory args = new string[](2);
        args[0] = _quarterToString(quarter);
        args[1] = "401547417"; // ESPN game ID for Super Bowl LX

        FunctionsRequest memory req;
        req.source = functionsSource;
        req.args = args;

        bytes memory requestData = req.encodeCBOR();

        // Send request to Chainlink Functions
        requestId = functionsRouter.sendRequest(
            functionsSubscriptionId,
            requestData,
            FUNCTIONS_DATA_VERSION,
            FUNCTIONS_CALLBACK_GAS_LIMIT,
            functionsDonId
        );

        score.submitted = true;
        score.requestId = requestId;
        requestIdToQuarter[requestId] = quarter;

        emit ScoreFetchRequested(quarter, requestId);
        return requestId;
    }

    /// @notice Operator can manually submit scores (fallback if Chainlink Functions fails)
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

        (address winner, uint256 payout) = getWinner(quarter);
        emit ScoreSubmitted(quarter, teamAScore, teamBScore, bytes32(0));
        emit ScoreSettled(quarter, winner, payout);
    }

    /// @notice Legacy function - not needed with Chainlink Functions (scores settle immediately)
    function settleScore(Quarter quarter) external {
        // No-op - scores are settled immediately when verified
    }

    // ============ Chainlink Functions Callback ============

    function handleOracleFulfillment(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) external onlyFunctionsRouter {
        Quarter quarter = requestIdToQuarter[requestId];
        Score storage score = scores[quarter];

        if (err.length > 0) {
            // Error occurred - clear submission so it can be retried
            score.submitted = false;
            emit ScoreVerified(quarter, 0, 0, false);
            return;
        }

        // Decode response: (patriotsScore << 16) | (seahawksScore << 8) | verified
        uint256 decoded = abi.decode(response, (uint256));
        uint8 patriotsScore = uint8(decoded >> 16);
        uint8 seahawksScore = uint8((decoded >> 8) & 0xFF);
        bool verified = (decoded & 0xFF) == 1;

        emit ScoreVerified(quarter, patriotsScore, seahawksScore, verified);

        if (!verified) {
            // No consensus - clear submission so it can be retried
            score.submitted = false;
            return;
        }

        // Score verified by multiple sources - finalize
        score.teamAScore = patriotsScore;
        score.teamBScore = seahawksScore;
        score.settled = true;

        _advanceState(quarter);

        (address winner, uint256 payout) = getWinner(quarter);
        emit ScoreSettled(quarter, winner, payout);
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

    function _quarterToString(Quarter q) internal pure returns (string memory) {
        if (q == Quarter.Q1) return "1";
        if (q == Quarter.Q2) return "2";
        if (q == Quarter.Q3) return "3";
        return "4";
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

    // ============ Receive ETH ============
    receive() external payable {}
}
