// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISquaresPool} from "./interfaces/ISquaresPool.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IVRFCoordinatorV2Plus, VRFConsumerBaseV2Plus, VRFV2PlusClient} from "./interfaces/IVRFCoordinatorV2Plus.sol";
import {IPool, IWrappedTokenGatewayV3, IAToken} from "./interfaces/IAaveV3.sol";
import {SquaresLib} from "./libraries/SquaresLib.sol";

/// @notice Minimal interface for getting admin from factory
interface ISquaresFactory {
    function admin() external view returns (address);
}

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

    // Aave integration
    IPool public aavePool;
    IWrappedTokenGatewayV3 public wethGateway;
    address public aToken;  // aWETH or aUSDC depending on paymentToken
    uint256 public totalPrincipalDeposited;  // Track principal separately from totalPot

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
    error GameNotFinished();
    error NoYieldToWithdraw();
    error AaveNotConfigured();

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

    /// @notice Set Aave V3 configuration (called by factory)
    function setAaveConfig(
        address _aavePool,
        address _wethGateway,
        address _aToken
    ) external onlyFactory {
        aavePool = IPool(_aavePool);
        wethGateway = IWrappedTokenGatewayV3(_wethGateway);
        aToken = _aToken;
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

        // Deposit to Aave if configured
        if (address(aavePool) != address(0)) {
            _depositToAave(totalCost);
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

            // Determine actual payout amount
            uint256 actualPayout = effectivePayout;

            // Withdraw from Aave if configured (may return less due to rounding)
            if (address(aavePool) != address(0)) {
                actualPayout = _withdrawFromAave(effectivePayout);
            }

            // Only transfer if we have funds
            if (actualPayout > 0) {
                if (paymentToken == address(0)) {
                    (bool success,) = winner.call{value: actualPayout}("");
                    if (!success) revert TransferFailed();
                } else {
                    bool success = IERC20(paymentToken).transfer(winner, actualPayout);
                    if (!success) revert TransferFailed();
                }
            }

            emit PayoutClaimed(winner, quarter, actualPayout);
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

            // Withdraw from Aave if configured (may return less due to rounding)
            uint256 actualDistribute = totalToDistribute;
            if (address(aavePool) != address(0)) {
                actualDistribute = _withdrawFromAave(totalToDistribute);
            }

            emit FinalDistributionCalculated(actualDistribute, squaresSold);

            // Auto-distribute to all square owners (use actual withdrawn amount)
            if (actualDistribute > 0) {
                for (uint256 i = 0; i < 100; i++) {
                    address owner = grid[i];
                    if (owner != address(0) && !finalDistributionClaimed[owner]) {
                        uint256 ownerSquares = userSquareCount[owner];
                        uint256 ownerShare = (actualDistribute * ownerSquares) / squaresSold;

                        bool success;
                        if (paymentToken == address(0)) {
                            (success,) = owner.call{value: ownerShare}("");
                        } else {
                            success = IERC20(paymentToken).transfer(owner, ownerShare);
                        }

                        // Only mark as claimed if transfer succeeded
                        if (success) {
                            finalDistributionClaimed[owner] = true;
                            emit FinalDistributionClaimed(owner, ownerShare, ownerSquares);
                        }
                        // If transfer fails, user can still claim later via claimFinalDistribution
                    }
                }
            }
        }

        emit ScoreSettled(quarter, winner, payout);
    }

    /// @notice Deposit funds to Aave
    function _depositToAave(uint256 amount) internal {
        if (paymentToken == address(0)) {
            // ETH: deposit via WETHGateway
            wethGateway.depositETH{value: amount}(address(aavePool), address(this), 0);
        } else {
            // ERC20 (USDC): approve and supply to Aave
            IERC20(paymentToken).approve(address(aavePool), amount);
            aavePool.supply(paymentToken, amount, address(this), 0);
        }
        totalPrincipalDeposited += amount;
        emit DepositedToAave(amount);
    }

    /// @notice Withdraw funds from Aave
    /// @dev Uses min(amount, aTokenBalance) to handle Aave's interest rounding
    /// @return actualAmount The actual amount withdrawn (may be less than requested)
    function _withdrawFromAave(uint256 amount) internal returns (uint256 actualAmount) {
        // Get actual aToken balance to handle Aave's interest rounding
        uint256 aTokenBalance = IAToken(aToken).balanceOf(address(this));
        actualAmount = amount < aTokenBalance ? amount : aTokenBalance;

        if (actualAmount == 0) return 0;

        if (paymentToken == address(0)) {
            // For ETH, we need to approve the aWETH to the gateway first
            IAToken(aToken).approve(address(wethGateway), actualAmount);
            wethGateway.withdrawETH(address(aavePool), actualAmount, address(this));
        } else {
            aavePool.withdraw(paymentToken, actualAmount, address(this));
        }

        // Update principal tracking, capped to avoid underflow
        if (actualAmount >= totalPrincipalDeposited) {
            totalPrincipalDeposited = 0;
        } else {
            totalPrincipalDeposited -= actualAmount;
        }
        emit WithdrawnFromAave(actualAmount);
    }

    // ============ Admin Functions ============

    /// @notice Emergency function to set numbers when VRF fails
    /// @dev Only callable by factory (via emergencySetNumbersForAllPools) or admin
    /// @param randomness A random seed to generate the number assignments
    function emergencySetNumbers(uint256 randomness) external {
        // Only admin or factory can call
        address admin = ISquaresFactory(factory).admin();
        require(msg.sender == admin || msg.sender == factory, "Only admin or factory");

        // Must be in CLOSED state (VRF requested but not fulfilled)
        require(state == PoolState.CLOSED, "Pool not in CLOSED state");

        // Generate shuffled digits using the same logic as VRF callback
        rowNumbers = SquaresLib.fisherYatesShuffle(randomness);
        colNumbers = SquaresLib.fisherYatesShuffle(uint256(keccak256(abi.encodePacked(randomness, uint256(1)))));
        numbersSet = true;

        state = PoolState.NUMBERS_ASSIGNED;
        emit NumbersAssigned(rowNumbers, colNumbers);
    }

    /// @notice Withdraw accrued yield (admin only, after game is finished)
    function withdrawYield() external {
        // Only factory admin can withdraw yield
        require(msg.sender == ISquaresFactory(factory).admin(), "Only admin");
        _withdrawYieldToAdmin();
    }

    /// @notice Withdraw accrued yield (called by factory for batch withdrawal)
    function withdrawYieldFromFactory() external onlyFactory {
        _withdrawYieldToAdmin();
    }

    /// @notice Emergency function to recover stuck ERC20 tokens (admin only)
    /// @dev Used to recover aTokens when wrong aToken address was configured
    /// @param token The ERC20 token to recover
    /// @param amount Amount to recover (use type(uint256).max for full balance)
    function emergencyRecoverToken(address token, uint256 amount) external {
        require(msg.sender == ISquaresFactory(factory).admin(), "Only admin");
        require(state == PoolState.FINAL_SCORED, "Game not finished");

        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 toRecover = amount == type(uint256).max ? balance : amount;
        require(toRecover <= balance, "Insufficient balance");

        address admin = ISquaresFactory(factory).admin();
        bool success = IERC20(token).transfer(admin, toRecover);
        require(success, "Transfer failed");
    }

    /// @notice Update aToken address (admin only)
    /// @dev Used to fix misconfigured aToken addresses
    function setAToken(address _aToken) external {
        require(msg.sender == ISquaresFactory(factory).admin(), "Only admin");
        address oldAToken = aToken;
        aToken = _aToken;
        emit ATokenUpdated(oldAToken, _aToken);
    }

    /// @notice Internal yield withdrawal implementation
    function _withdrawYieldToAdmin() internal {
        address admin = ISquaresFactory(factory).admin();

        // Game must be finished
        if (state != PoolState.FINAL_SCORED) revert GameNotFinished();

        // Must have Aave configured
        if (address(aavePool) == address(0)) revert AaveNotConfigured();

        uint256 aTokenBalance = IAToken(aToken).balanceOf(address(this));
        if (aTokenBalance == 0) revert NoYieldToWithdraw();

        // Withdraw all remaining aTokens (yield) to admin
        if (paymentToken == address(0)) {
            IAToken(aToken).approve(address(wethGateway), aTokenBalance);
            wethGateway.withdrawETH(address(aavePool), aTokenBalance, admin);
        } else {
            aavePool.withdraw(paymentToken, aTokenBalance, admin);
        }

        emit YieldWithdrawn(admin, aTokenBalance);
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

    /// @notice Get Aave yield info
    function getYieldInfo() external view returns (
        uint256 principal,
        uint256 aTokenBalance,
        uint256 yield,
        bool aaveConfigured
    ) {
        principal = totalPrincipalDeposited;
        aaveConfigured = address(aavePool) != address(0);
        if (aaveConfigured && aToken != address(0)) {
            aTokenBalance = IAToken(aToken).balanceOf(address(this));
            yield = aTokenBalance > principal ? aTokenBalance - principal : 0;
        }
    }

    // ============ Receive ETH ============
    receive() external payable {}
}
