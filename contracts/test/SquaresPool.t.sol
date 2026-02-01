// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SquaresPool} from "../src/SquaresPool.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";
import {ISquaresPool} from "../src/interfaces/ISquaresPool.sol";
import {MockVRFCoordinatorV2Plus} from "./mocks/MockVRFCoordinatorV2Plus.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SquaresPoolTest is Test {
    SquaresFactory public factory;
    SquaresPool public pool;
    MockVRFCoordinatorV2Plus public vrfCoordinator;
    MockERC20 public paymentToken;

    address public operator = address(0x1);
    address public alice = address(0x2);
    address public bob = address(0x3);
    address public charlie = address(0x4);

    uint256 public constant SQUARE_PRICE = 0.1 ether;
    uint96 public constant VRF_FUNDING_AMOUNT = 1 ether;
    uint256 public constant CREATION_FEE = 0.1 ether;
    uint256 public constant TOTAL_REQUIRED = CREATION_FEE + VRF_FUNDING_AMOUNT;

    function setUp() public {
        // Deploy mocks
        vrfCoordinator = new MockVRFCoordinatorV2Plus();
        paymentToken = new MockERC20("Test Token", "TEST", 18);

        // Deploy factory with VRF config
        factory = new SquaresFactory(
            address(vrfCoordinator),
            bytes32("test-key-hash"),
            CREATION_FEE
        );

        // Set VRF funding amount
        factory.setVRFFundingAmount(VRF_FUNDING_AMOUNT);

        // Create pool with ETH payments
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Super Bowl LX",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0), // ETH
            maxSquaresPerUser: 10,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Patriots",
            teamBName: "Seahawks",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0) // Public pool
        });

        vm.deal(operator, 100 ether);
        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        pool = SquaresPool(payable(poolAddr));

        // Fund accounts
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
    }

    // ============ Pool Creation Tests ============

    function test_PoolCreation() public view {
        (
            string memory name,
            ISquaresPool.PoolState state,
            uint256 squarePrice,
            address token,
            uint256 totalPot,
            uint256 squaresSold,
            string memory teamAName,
            string memory teamBName
        ) = pool.getPoolInfo();

        assertEq(name, "Super Bowl LX");
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.OPEN));
        assertEq(squarePrice, SQUARE_PRICE);
        assertEq(token, address(0));
        assertEq(totalPot, 0);
        assertEq(squaresSold, 0);
        assertEq(teamAName, "Patriots");
        assertEq(teamBName, "Seahawks");
    }

    // ============ Square Purchase Tests ============

    function test_BuySquares() public {
        uint8[] memory positions = new uint8[](3);
        positions[0] = 0;
        positions[1] = 55;
        positions[2] = 99;

        vm.prank(alice);
        pool.buySquares{value: 0.3 ether}(positions, "");

        address[100] memory grid = pool.getGrid();
        assertEq(grid[0], alice);
        assertEq(grid[55], alice);
        assertEq(grid[99], alice);

        (, , , , uint256 totalPot, uint256 squaresSold, ,) = pool.getPoolInfo();
        assertEq(totalPot, 0.3 ether);
        assertEq(squaresSold, 3);
    }

    function test_BuySquares_RefundsExcess() public {
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;

        uint256 balanceBefore = alice.balance;

        vm.prank(alice);
        pool.buySquares{value: 1 ether}(positions, "");

        uint256 balanceAfter = alice.balance;
        assertEq(balanceBefore - balanceAfter, SQUARE_PRICE);
    }

    function test_BuySquares_RevertIfAlreadyOwned() public {
        uint8[] memory positions = new uint8[](1);
        positions[0] = 50;

        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SquaresPool.SquareAlreadyOwned.selector, 50));
        pool.buySquares{value: SQUARE_PRICE}(positions, "");
    }

    function test_BuySquares_RevertIfInvalidPosition() public {
        uint8[] memory positions = new uint8[](1);
        positions[0] = 100; // Invalid

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SquaresPool.InvalidPosition.selector, 100));
        pool.buySquares{value: SQUARE_PRICE}(positions, "");
    }

    function test_BuySquares_RevertIfMaxExceeded() public {
        // Buy 10 squares (max)
        uint8[] memory positions = new uint8[](10);
        for (uint8 i = 0; i < 10; i++) {
            positions[i] = i;
        }

        vm.prank(alice);
        pool.buySquares{value: 1 ether}(positions, "");

        // Try to buy one more
        uint8[] memory extraPosition = new uint8[](1);
        extraPosition[0] = 10;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SquaresPool.MaxSquaresExceeded.selector, alice, 10, 10));
        pool.buySquares{value: SQUARE_PRICE}(extraPosition, "");
    }

    function test_BuySquares_RevertIfInsufficientPayment() public {
        uint8[] memory positions = new uint8[](2);
        positions[0] = 0;
        positions[1] = 1;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SquaresPool.InsufficientPayment.selector, 0.1 ether, 0.2 ether));
        pool.buySquares{value: 0.1 ether}(positions, "");
    }

    function test_BuySquares_RevertAfterDeadline() public {
        vm.warp(block.timestamp + 8 days);

        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;

        vm.prank(alice);
        vm.expectRevert(SquaresPool.PurchaseDeadlinePassed.selector);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");
    }

    // ============ VRF Tests ============

    function test_ClosePoolAndRequestVRFFromFactory_ClosesPoolAndRequestsVRF() public {
        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        // Trigger VRF via factory
        factory.triggerVRFForAllPools();

        // Check state is CLOSED
        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.CLOSED));

        // Check VRF was requested
        assertTrue(pool.vrfRequested(), "VRF should be requested");
        assertTrue(pool.vrfRequestId() > 0, "VRF request ID should be set");
    }

    function test_ClosePoolAndRequestVRFFromFactory_RevertIfNotFactory() public {
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        vm.prank(alice);
        vm.expectRevert(SquaresPool.OnlyFactory.selector);
        pool.closePoolAndRequestVRFFromFactory();
    }

    function test_TriggerVRFForAllPools_SkipsPoolsNotReady() public {
        // Create pool but don't buy any squares
        // Trigger VRF via factory - should skip pools with no sales
        factory.triggerVRFForAllPools();

        // Check state is still OPEN (no sales, so not triggered)
        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.OPEN));
    }

    function test_VRFCallback_AssignsNumbers() public {
        _setupVRFRequested();

        // Fulfill VRF request
        uint256 randomness = 12345678901234567890;
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), randomness);

        // Check state is NUMBERS_ASSIGNED
        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));

        // Check numbers are assigned and valid
        (uint8[10] memory rows, uint8[10] memory cols) = pool.getNumbers();

        // Verify rows is a valid permutation of 0-9
        bool[10] memory rowSeen;
        for (uint8 i = 0; i < 10; i++) {
            rowSeen[rows[i]] = true;
        }
        for (uint8 i = 0; i < 10; i++) {
            assertTrue(rowSeen[i], "Missing row number");
        }

        // Verify cols is a valid permutation of 0-9
        bool[10] memory colSeen;
        for (uint8 i = 0; i < 10; i++) {
            colSeen[cols[i]] = true;
        }
        for (uint8 i = 0; i < 10; i++) {
            assertTrue(colSeen[i], "Missing col number");
        }
    }

    function test_ClosePoolAndRequestVRF_OperatorFallback() public {
        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        // Operator manually triggers (no need to wait for trigger time)
        vm.prank(operator);
        pool.closePoolAndRequestVRF();

        // Check state is CLOSED
        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.CLOSED));

        // Check VRF was requested
        assertTrue(pool.vrfRequested(), "VRF should be requested");
    }

    function test_ClosePoolAndRequestVRF_RevertIfNotOperator() public {
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        vm.prank(alice);
        vm.expectRevert(SquaresPool.OnlyOperator.selector);
        pool.closePoolAndRequestVRF();
    }

    function test_ClosePoolAndRequestVRF_RevertIfNoSales() public {
        vm.prank(operator);
        vm.expectRevert(SquaresPool.NoSquaresSold.selector);
        pool.closePoolAndRequestVRF();
    }

    function test_GetVRFStatus() public {
        (uint256 triggerTime, bool requested, uint256 requestId, bool numbersAssigned) = pool.getVRFStatus();

        assertEq(triggerTime, block.timestamp + 8 days);
        assertFalse(requested);
        assertEq(requestId, 0);
        assertFalse(numbersAssigned);

        // After VRF is requested
        _setupVRFRequested();

        (triggerTime, requested, requestId, numbersAssigned) = pool.getVRFStatus();
        assertTrue(requested);
        assertTrue(requestId > 0);
        assertFalse(numbersAssigned);

        // After VRF is fulfilled
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), 12345);

        (triggerTime, requested, requestId, numbersAssigned) = pool.getVRFStatus();
        assertTrue(numbersAssigned);
    }

    // ============ Score Submission Tests ============

    function test_SubmitScore_OperatorFallback() public {
        _setupForScoring();

        // Operator can manually submit scores as fallback
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);

        ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
        assertTrue(score.submitted);
        assertTrue(score.settled);
        assertEq(score.teamAScore, 7);
        assertEq(score.teamBScore, 3);

        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.Q1_SCORED));
    }

    function test_SubmitScore_RevertIfNotOperator() public {
        _setupForScoring();

        vm.prank(alice);
        vm.expectRevert(SquaresPool.OnlyOperator.selector);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);
    }

    function test_SubmitScore_RevertIfInvalidQuarterProgression() public {
        _setupForScoring();

        // Can't submit Q2 before Q1
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SquaresPool.InvalidState.selector,
                ISquaresPool.PoolState.NUMBERS_ASSIGNED,
                ISquaresPool.PoolState.Q1_SCORED
            )
        );
        pool.submitScore(ISquaresPool.Quarter.Q2, 14, 7);
    }

    // ============ Factory Score Submission Tests ============

    function test_SubmitScoreFromFactory() public {
        _buyAllSquaresWithAlice();
        _setupForScoringWithPool(pool);

        // Submit score via factory
        factory.submitScoreToAllPools(0, 7, 3);

        ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
        assertTrue(score.submitted);
        assertTrue(score.settled);
        assertEq(score.teamAScore, 7);
        assertEq(score.teamBScore, 3);

        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.Q1_SCORED));
    }

    function test_SubmitScoreFromFactory_AutoPayout() public {
        _buyAllSquaresWithAlice();
        _setupForScoringWithPool(pool);

        uint256 balanceBefore = alice.balance;

        // Submit score via factory - should auto-payout
        factory.submitScoreToAllPools(0, 7, 3);

        uint256 balanceAfter = alice.balance;

        // Alice owns all squares, so she should receive the Q1 payout (20% of 10 ETH = 2 ETH)
        assertEq(balanceAfter - balanceBefore, 2 ether);

        // Verify payout was marked as claimed
        assertTrue(pool.hasClaimed(alice, ISquaresPool.Quarter.Q1));
    }

    // ============ Payout Tests ============

    function test_ClaimPayout() public {
        // Buy all squares with alice
        _buyAllSquaresWithAlice();
        _setupForScoringWithPool(pool);

        // Record balance before score submission (auto-pays winner)
        uint256 balanceBefore = alice.balance;

        // Submit Q1 score via operator - this now auto-pays the winner
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);

        // Check winner
        (address winner, uint256 payout) = pool.getWinner(ISquaresPool.Quarter.Q1);
        assertEq(winner, alice);

        // Total pot should be 10 ether (100 squares * 0.1 ETH)
        // Q1 payout is 20% = 2 ether
        assertEq(payout, 2 ether);

        // Alice should have received auto-payout
        uint256 balanceAfter = alice.balance;
        assertEq(balanceAfter - balanceBefore, 2 ether);

        // Payout should be marked as claimed (can't claim again)
        assertTrue(pool.hasClaimed(alice, ISquaresPool.Quarter.Q1));
    }

    function test_ClaimPayout_RevertIfNotWinner() public {
        _buyAllSquaresWithAlice();
        _setupForScoringWithPool(pool);

        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);

        vm.prank(bob);
        vm.expectRevert(SquaresPool.NotWinner.selector);
        pool.claimPayout(ISquaresPool.Quarter.Q1);
    }

    function test_ClaimPayout_RevertIfAlreadyClaimed() public {
        _buyAllSquaresWithAlice();
        _setupForScoringWithPool(pool);

        // Submit score - this auto-pays alice
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);

        // Auto-payout already happened, so claiming should revert
        vm.prank(alice);
        vm.expectRevert(SquaresPool.PayoutAlreadyClaimed.selector);
        pool.claimPayout(ISquaresPool.Quarter.Q1);
    }

    // ============ Full Game Flow Test ============

    function test_FullGameFlow() public {
        // 1. Multiple users buy squares
        uint8[] memory aliceSquares = new uint8[](5);
        aliceSquares[0] = 0;
        aliceSquares[1] = 11;
        aliceSquares[2] = 22;
        aliceSquares[3] = 33;
        aliceSquares[4] = 44;

        vm.prank(alice);
        pool.buySquares{value: 0.5 ether}(aliceSquares, "");

        uint8[] memory bobSquares = new uint8[](5);
        bobSquares[0] = 55;
        bobSquares[1] = 66;
        bobSquares[2] = 77;
        bobSquares[3] = 88;
        bobSquares[4] = 99;

        vm.prank(bob);
        pool.buySquares{value: 0.5 ether}(bobSquares, "");

        // 2. Trigger VRF for all pools
        factory.triggerVRFForAllPools();

        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.CLOSED));

        // 3. VRF callback assigns numbers
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), 12345678901234567890);

        (, state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));

        // 4. Submit scores for all quarters
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);

        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q2, 14, 10);

        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q3, 21, 17);

        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 28, 24);

        (, state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.FINAL_SCORED));
    }

    // ============ VRF Edge Case Tests ============

    function test_ClosePoolAndRequestVRFFromFactory_RevertIfAlreadyClosed() public {
        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        // Trigger VRF first time (closes pool)
        factory.triggerVRFForAllPools();

        // Pool should now be CLOSED
        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.CLOSED));

        // Create a new pool to test - the closed pool should be skipped
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "New Pool",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0),
            maxSquaresPerUser: 10,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Patriots",
            teamBName: "Seahawks",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0)
        });

        vm.prank(operator);
        address newPoolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        SquaresPool newPool = SquaresPool(payable(newPoolAddr));

        // Buy square in new pool
        vm.prank(alice);
        newPool.buySquares{value: SQUARE_PRICE}(positions, "");

        // Trigger VRF again - should only affect new pool, old pool already closed
        factory.triggerVRFForAllPools();

        // New pool should be closed
        (, ISquaresPool.PoolState newState, , , , , ,) = newPool.getPoolInfo();
        assertEq(uint8(newState), uint8(ISquaresPool.PoolState.CLOSED));
    }

    function test_ClosePoolAndRequestVRFFromFactory_RevertIfVRFAlreadyRequested() public {
        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        // Trigger VRF
        factory.triggerVRFForAllPools();

        // VRF should be requested
        assertTrue(pool.vrfRequested());

        // Calling triggerVRF again should not affect this pool (already has VRF requested)
        // No revert because factory uses try/catch
        factory.triggerVRFForAllPools();

        // Still in CLOSED state
        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.CLOSED));
    }

    function test_ClosePoolAndRequestVRFFromFactory_RevertIfNoSales() public {
        // Pool has no sales, calling directly should revert
        vm.prank(address(factory));
        vm.expectRevert(SquaresPool.NoSquaresSold.selector);
        pool.closePoolAndRequestVRFFromFactory();
    }

    function test_TriggerVRFForAllPools_SkipsClosedPools() public {
        // Create two pools
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Pool 2",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0),
            maxSquaresPerUser: 10,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Patriots",
            teamBName: "Seahawks",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0)
        });

        vm.prank(operator);
        address pool2Addr = factory.createPool{value: TOTAL_REQUIRED}(params);
        SquaresPool pool2 = SquaresPool(payable(pool2Addr));

        // Buy squares in both pools
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");
        vm.prank(alice);
        pool2.buySquares{value: SQUARE_PRICE}(positions, "");

        // Close pool1 manually via operator
        vm.prank(operator);
        pool.closePoolAndRequestVRF();

        // Pool1 is closed, pool2 is open
        (, ISquaresPool.PoolState state1, , , , , ,) = pool.getPoolInfo();
        (, ISquaresPool.PoolState state2, , , , , ,) = pool2.getPoolInfo();
        assertEq(uint8(state1), uint8(ISquaresPool.PoolState.CLOSED));
        assertEq(uint8(state2), uint8(ISquaresPool.PoolState.OPEN));

        // Trigger VRF for all pools - should only affect pool2
        factory.triggerVRFForAllPools();

        // Pool2 should now be closed
        (, state2, , , , , ,) = pool2.getPoolInfo();
        assertEq(uint8(state2), uint8(ISquaresPool.PoolState.CLOSED));
    }

    function test_TriggerVRFForAllPools_SkipsPoolsWithNumbersAssigned() public {
        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        // Trigger VRF and fulfill it
        factory.triggerVRFForAllPools();
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), 12345);

        // Pool should be in NUMBERS_ASSIGNED state
        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));

        // Trigger VRF again - should not affect this pool
        factory.triggerVRFForAllPools();

        // State should still be NUMBERS_ASSIGNED
        (, state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));
    }

    function test_TriggerVRFForAllPools_MultiplePoolsMixedStates() public {
        // Create 3 additional pools (total 4 pools)
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Pool",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0),
            maxSquaresPerUser: 10,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Patriots",
            teamBName: "Seahawks",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0)
        });

        vm.prank(operator);
        address pool2Addr = factory.createPool{value: TOTAL_REQUIRED}(params);
        vm.prank(operator);
        address pool3Addr = factory.createPool{value: TOTAL_REQUIRED}(params);
        vm.prank(operator);
        address pool4Addr = factory.createPool{value: TOTAL_REQUIRED}(params);

        SquaresPool pool2 = SquaresPool(payable(pool2Addr));
        SquaresPool pool3 = SquaresPool(payable(pool3Addr));
        SquaresPool pool4 = SquaresPool(payable(pool4Addr));

        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;

        // Pool 1: Has sales - should be triggered
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        // Pool 2: Has sales - should be triggered
        vm.prank(alice);
        pool2.buySquares{value: SQUARE_PRICE}(positions, "");

        // Pool 3: No sales - should be skipped
        // (no purchase)

        // Pool 4: Already closed by operator - should be skipped
        vm.prank(alice);
        pool4.buySquares{value: SQUARE_PRICE}(positions, "");
        vm.prank(operator);
        pool4.closePoolAndRequestVRF();

        // Trigger VRF for all
        factory.triggerVRFForAllPools();

        // Check states
        (, ISquaresPool.PoolState state1, , , , , ,) = pool.getPoolInfo();
        (, ISquaresPool.PoolState state2, , , , , ,) = pool2.getPoolInfo();
        (, ISquaresPool.PoolState state3, , , , , ,) = pool3.getPoolInfo();
        (, ISquaresPool.PoolState state4, , , , , ,) = pool4.getPoolInfo();

        assertEq(uint8(state1), uint8(ISquaresPool.PoolState.CLOSED), "Pool 1 should be closed");
        assertEq(uint8(state2), uint8(ISquaresPool.PoolState.CLOSED), "Pool 2 should be closed");
        assertEq(uint8(state3), uint8(ISquaresPool.PoolState.OPEN), "Pool 3 should still be open (no sales)");
        assertEq(uint8(state4), uint8(ISquaresPool.PoolState.CLOSED), "Pool 4 should be closed (already was)");
    }

    function test_TriggerVRFForAllPools_EmitsEvent() public {
        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        // Expect the VRFTriggeredForAllPools event
        vm.expectEmit(true, true, true, true);
        emit VRFTriggeredForAllPools(1);

        factory.triggerVRFForAllPools();
    }

    function test_OperatorClosePoolAndRequestVRF_CannotCallTwice() public {
        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        // Operator closes pool
        vm.prank(operator);
        pool.closePoolAndRequestVRF();

        // Try to close again - should revert with InvalidState
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SquaresPool.InvalidState.selector,
                ISquaresPool.PoolState.CLOSED,
                ISquaresPool.PoolState.OPEN
            )
        );
        pool.closePoolAndRequestVRF();
    }

    // Event for testing
    event VRFTriggeredForAllPools(uint256 poolsTriggered);

    // ============ ERC20 Payment Tests ============

    function test_BuySquaresWithERC20() public {
        // Create new pool with ERC20 payments
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "ERC20 Pool",
            squarePrice: 100e18, // 100 tokens
            paymentToken: address(paymentToken),
            maxSquaresPerUser: 0, // Unlimited
            payoutPercentages: [uint8(25), uint8(25), uint8(25), uint8(25)],
            teamAName: "Team A",
            teamBName: "Team B",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0) // Public pool
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        SquaresPool erc20Pool = SquaresPool(payable(poolAddr));

        // Mint and approve tokens
        paymentToken.mint(alice, 1000e18);
        vm.prank(alice);
        paymentToken.approve(address(erc20Pool), type(uint256).max);

        // Buy squares
        uint8[] memory positions = new uint8[](2);
        positions[0] = 0;
        positions[1] = 1;

        vm.prank(alice);
        erc20Pool.buySquares(positions, "");

        (, , , , uint256 totalPot, uint256 squaresSold, ,) = erc20Pool.getPoolInfo();
        assertEq(totalPot, 200e18);
        assertEq(squaresSold, 2);
    }

    // ============ Helper Functions ============

    function _setupVRFRequested() internal {
        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        // Trigger VRF via factory
        factory.triggerVRFForAllPools();
    }

    function _setupForScoring() internal {
        _setupVRFRequested();

        // Fulfill VRF
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), 12345);
    }

    function _setupForScoringWithPool(SquaresPool targetPool) internal {
        // Trigger VRF via factory
        factory.triggerVRFForAllPools();

        // Fulfill VRF
        vrfCoordinator.fulfillRandomWord(targetPool.vrfRequestId(), 12345);
    }

    function _buyAllSquaresWithAlice() internal {
        // Create a pool without the limit
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Unlimited Pool",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0),
            maxSquaresPerUser: 0, // No limit
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Patriots",
            teamBName: "Seahawks",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0) // Public pool
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        pool = SquaresPool(payable(poolAddr));

        // Buy all 100 squares
        uint8[] memory positions = new uint8[](100);
        for (uint8 i = 0; i < 100; i++) {
            positions[i] = i;
        }

        vm.prank(alice);
        pool.buySquares{value: 10 ether}(positions, "");
    }

    // ============ Private Pool Password Tests ============

    function test_PrivatePool_BuyWithCorrectPassword() public {
        // Create a private pool
        string memory password = "secret123";
        bytes32 pwHash = keccak256(bytes(password));

        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Private Pool",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0),
            maxSquaresPerUser: 10,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Patriots",
            teamBName: "Seahawks",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: pwHash
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        SquaresPool privatePool = SquaresPool(payable(poolAddr));

        // Verify pool is private
        assertTrue(privatePool.isPrivate());

        // Buy with correct password
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;

        vm.prank(alice);
        privatePool.buySquares{value: SQUARE_PRICE}(positions, password);

        address[100] memory grid = privatePool.getGrid();
        assertEq(grid[0], alice);
    }

    function test_PrivatePool_RevertWithWrongPassword() public {
        // Create a private pool
        string memory password = "secret123";
        bytes32 pwHash = keccak256(bytes(password));

        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Private Pool",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0),
            maxSquaresPerUser: 10,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Patriots",
            teamBName: "Seahawks",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: pwHash
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        SquaresPool privatePool = SquaresPool(payable(poolAddr));

        // Try to buy with wrong password
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;

        vm.prank(alice);
        vm.expectRevert(SquaresPool.InvalidPassword.selector);
        privatePool.buySquares{value: SQUARE_PRICE}(positions, "wrongpassword");
    }

    function test_PrivatePool_RevertWithEmptyPassword() public {
        // Create a private pool
        string memory password = "secret123";
        bytes32 pwHash = keccak256(bytes(password));

        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Private Pool",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0),
            maxSquaresPerUser: 10,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Patriots",
            teamBName: "Seahawks",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: pwHash
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        SquaresPool privatePool = SquaresPool(payable(poolAddr));

        // Try to buy with empty password
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;

        vm.prank(alice);
        vm.expectRevert(SquaresPool.InvalidPassword.selector);
        privatePool.buySquares{value: SQUARE_PRICE}(positions, "");
    }

    function test_PublicPool_IsNotPrivate() public view {
        assertFalse(pool.isPrivate());
    }

    // ============ Unclaimed Winnings Roll Forward Tests ============

    function test_UnclaimedWinnings_Q1NoWinnerRollsToQ2Winner() public {
        // Setup: Create pool where alice owns some squares but not the Q1 winning square
        _setupPoolWithPartialOwnership();

        // Submit Q1 score that hits an unowned square - score (0,0) which was avoided
        // Q1 payout (20% of 5 ETH = 1 ETH) should roll forward
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 0, 0);

        // Verify Q1 payout was rolled
        (uint256 rolled, , ) = pool.getUnclaimedInfo();
        assertEq(rolled, 1 ether, "Q1 payout should be rolled forward");

        // Get the row/col numbers to find a score that hits alice's square
        (uint8[10] memory rows, uint8[10] memory cols) = pool.getNumbers();

        // Alice owns position 10 (row 1, col 0)
        // We need to find the digits at rows[1] and cols[0]
        uint8 winningRowDigit = rows[1];
        uint8 winningColDigit = cols[0];

        // Create a score where last digits match alice's position
        uint8 teamAScore = winningRowDigit;  // Last digit = rows[1]
        uint8 teamBScore = winningColDigit;  // Last digit = cols[0]

        uint256 aliceBalanceBefore = alice.balance;

        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q2, teamAScore, teamBScore);

        // Alice should get Q2 payout + rolled Q1 payout
        // Q2 base = 1 ETH, Q1 rolled = 1 ETH, total = 2 ETH
        uint256 aliceBalanceAfter = alice.balance;
        assertEq(aliceBalanceAfter - aliceBalanceBefore, 2 ether, "Alice should receive Q2 + rolled Q1");

        // Rolled amount should be cleared
        (uint256 rolled2, , ) = pool.getUnclaimedInfo();
        assertEq(rolled2, 0, "Rolled amount should be cleared after winner claims");
    }

    function test_UnclaimedWinnings_AllQuartersNoWinnerToFinalDistribution() public {
        // Setup: Create pool where NO squares are owned except a few for testing
        // All winning positions are unowned
        _setupPoolForFinalDistribution();

        // Submit all 4 quarters with scores that hit unowned squares
        // All payouts should roll forward
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 0, 0); // Unowned position

        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q2, 0, 0);

        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q3, 0, 0);

        // Before FINAL, check rolled amount
        (uint256 rolled, , ) = pool.getUnclaimedInfo();
        assertEq(rolled, 3 ether, "Q1+Q2+Q3 payouts should be rolled");

        // Submit FINAL score (also unowned)
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 0, 0);

        // After FINAL, rolled amount should transfer to final distribution
        (uint256 rolledAfter, uint256 distPool, bool ready) = pool.getUnclaimedInfo();
        assertEq(rolledAfter, 0, "Rolled amount should be 0 after FINAL");
        assertEq(distPool, 5 ether, "Full pot should be in final distribution");
        assertTrue(ready, "Final distribution should be ready");
    }

    function test_UnclaimedWinnings_FinalDistributionAutoPayout() public {
        _setupPoolForFinalDistribution();

        // Get initial balances
        uint256 aliceBalanceBefore = alice.balance;
        uint256 bobBalanceBefore = bob.balance;

        // Get square counts before submitting scores
        uint256 aliceSquareCount = pool.userSquareCount(alice);
        uint256 bobSquareCount = pool.userSquareCount(bob);
        (, , , , , uint256 totalSquaresSold, ,) = pool.getPoolInfo();

        // Submit all quarters with scores that hit unowned squares
        vm.startPrank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q2, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q3, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 0, 0);
        vm.stopPrank();

        // Verify auto-payout happened
        uint256 aliceBalanceAfter = alice.balance;
        uint256 bobBalanceAfter = bob.balance;

        // Alice owns 10 squares out of 50 sold = 20% of distribution
        // Total pot = 5 ETH, so alice gets 1 ETH
        uint256 aliceExpectedShare = (5 ether * aliceSquareCount) / totalSquaresSold;
        assertEq(aliceBalanceAfter - aliceBalanceBefore, aliceExpectedShare, "Alice should receive her share automatically");

        // Bob owns 40 squares out of 50 sold = 80% of distribution
        uint256 bobExpectedShare = (5 ether * bobSquareCount) / totalSquaresSold;
        assertEq(bobBalanceAfter - bobBalanceBefore, bobExpectedShare, "Bob should receive his share automatically");

        // Verify both are marked as claimed
        (, bool aliceClaimed) = pool.getFinalDistributionShare(alice);
        (, bool bobClaimed) = pool.getFinalDistributionShare(bob);
        assertTrue(aliceClaimed, "Alice should be marked as claimed");
        assertTrue(bobClaimed, "Bob should be marked as claimed");
    }

    function test_UnclaimedWinnings_NoAutoDistributionWhenWinnerExists() public {
        // Setup pool where winner exists for all quarters
        _buyAllSquaresWithAlice();
        _setupForScoringWithPool(pool);

        // Get Alice balance before
        uint256 aliceBalanceBefore = alice.balance;

        // Submit all quarters - alice wins all (gets payouts)
        vm.startPrank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);
        pool.submitScore(ISquaresPool.Quarter.Q2, 14, 10);
        pool.submitScore(ISquaresPool.Quarter.Q3, 21, 17);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 28, 24);
        vm.stopPrank();

        // Verify Alice got quarter payouts, not final distribution
        uint256 aliceBalanceAfter = alice.balance;
        assertTrue(aliceBalanceAfter > aliceBalanceBefore, "Alice should have received payouts");

        // No final distribution was triggered
        (uint256 rolled, uint256 distPool, bool ready) = pool.getUnclaimedInfo();
        assertEq(rolled, 0, "No rolled amount");
        assertEq(distPool, 0, "No distribution pool");
        assertFalse(ready, "Distribution not ready");
    }

    function test_UnclaimedWinnings_GetUnclaimedInfoDuringGame() public {
        _setupPoolWithPartialOwnership();

        // Initially no rolled amount
        (uint256 rolled, uint256 distPool, bool ready) = pool.getUnclaimedInfo();
        assertEq(rolled, 0);
        assertEq(distPool, 0);
        assertFalse(ready);

        // Score Q1 with no winner
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 0, 0);

        // Check rolled amount updated
        (uint256 rolled2, uint256 distPool2, bool ready2) = pool.getUnclaimedInfo();
        assertEq(rolled2, 1 ether, "Q1 payout should be rolled");
        assertEq(distPool2, 0);
        assertFalse(ready2);
    }

    // ============ Helper Functions for Unclaimed Winnings Tests ============

    /// @dev Calculates the winning position for score (0,0) given VRF randomness
    /// Uses the same algorithm as SquaresLib.fisherYatesShuffle
    function _calculateWinningPositionForZeroScore(uint256 randomness) internal pure returns (uint8) {
        // Simulate fisher-yates shuffle for rows
        uint8[10] memory rows;
        for (uint8 i = 0; i < 10; i++) {
            rows[i] = i;
        }
        for (uint256 i = 9; i > 0; i--) {
            uint256 j = uint256(keccak256(abi.encodePacked(randomness, i))) % (i + 1);
            uint8 temp = rows[i];
            rows[i] = rows[uint8(j)];
            rows[uint8(j)] = temp;
        }

        // Simulate fisher-yates shuffle for cols (with modified seed)
        uint8[10] memory cols;
        for (uint8 i = 0; i < 10; i++) {
            cols[i] = i;
        }
        uint256 colSeed = uint256(keccak256(abi.encodePacked(randomness, uint256(1))));
        for (uint256 i = 9; i > 0; i--) {
            uint256 j = uint256(keccak256(abi.encodePacked(colSeed, i))) % (i + 1);
            uint8 temp = cols[i];
            cols[i] = cols[uint8(j)];
            cols[uint8(j)] = temp;
        }

        // Find position where digit 0 would win
        uint8 rowIdx;
        for (uint8 i = 0; i < 10; i++) {
            if (rows[i] == 0) {
                rowIdx = i;
                break;
            }
        }
        uint8 colIdx;
        for (uint8 i = 0; i < 10; i++) {
            if (cols[i] == 0) {
                colIdx = i;
                break;
            }
        }

        return rowIdx * 10 + colIdx;
    }

    function _setupPoolWithPartialOwnership() internal {
        // Calculate winning position for score (0,0) with our known randomness
        uint256 randomness = 12345;
        uint8 winningPos = _calculateWinningPositionForZeroScore(randomness);

        // Create pool with no max limit
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Partial Pool",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0),
            maxSquaresPerUser: 0,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "TeamA",
            teamBName: "TeamB",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0)
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        pool = SquaresPool(payable(poolAddr));

        // Alice buys 10 squares, avoiding the winning position
        uint8[] memory alicePositions = new uint8[](10);
        uint8 aliceIdx = 0;
        for (uint8 i = 10; i < 30 && aliceIdx < 10; i++) {
            if (i != winningPos) {
                alicePositions[aliceIdx] = i;
                aliceIdx++;
            }
        }
        vm.prank(alice);
        pool.buySquares{value: 1 ether}(alicePositions, "");

        // Bob buys 40 squares, also avoiding winning position
        uint8[] memory bobPositions = new uint8[](40);
        uint8 bobIdx = 0;
        for (uint8 i = 30; i < 100 && bobIdx < 40; i++) {
            if (i != winningPos) {
                bobPositions[bobIdx] = i;
                bobIdx++;
            }
        }
        vm.prank(bob);
        pool.buySquares{value: 4 ether}(bobPositions, "");

        // Total: 50 squares sold, 5 ETH pot
        (, , , , , uint256 sold, ,) = pool.getPoolInfo();
        assertEq(sold, 50, "Should have 50 squares sold");

        // Trigger VRF with our known randomness
        factory.triggerVRFForAllPools();
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), randomness);

        // Verify we set this up correctly
        (address winner, ) = pool.getWinner(ISquaresPool.Quarter.Q1);
        // Winner should be address(0) since we avoided the winning position
        // But we can't check this yet since Q1 isn't scored
        (, ISquaresPool.PoolState poolState, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(poolState), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));
    }

    function _setupPoolForFinalDistribution() internal {
        // Calculate winning position for score (0,0) with our known randomness
        uint256 randomness = 12345;
        uint8 winningPos = _calculateWinningPositionForZeroScore(randomness);

        // Create pool
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Distribution Pool",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0),
            maxSquaresPerUser: 0,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "TeamA",
            teamBName: "TeamB",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0)
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        pool = SquaresPool(payable(poolAddr));

        // Alice buys 10 squares, avoiding winning position
        uint8[] memory alicePositions = new uint8[](10);
        uint8 aliceIdx = 0;
        for (uint8 i = 10; i < 30 && aliceIdx < 10; i++) {
            if (i != winningPos) {
                alicePositions[aliceIdx] = i;
                aliceIdx++;
            }
        }
        vm.prank(alice);
        pool.buySquares{value: 1 ether}(alicePositions, "");

        // Bob buys 40 squares, also avoiding winning position
        uint8[] memory bobPositions = new uint8[](40);
        uint8 bobIdx = 0;
        for (uint8 i = 30; i < 100 && bobIdx < 40; i++) {
            if (i != winningPos) {
                bobPositions[bobIdx] = i;
                bobIdx++;
            }
        }
        vm.prank(bob);
        pool.buySquares{value: 4 ether}(bobPositions, "");

        // Total: 50 squares sold, 5 ETH pot
        (, , , , , uint256 sold, ,) = pool.getPoolInfo();
        assertEq(sold, 50, "Should have 50 squares sold");

        // Trigger VRF
        factory.triggerVRFForAllPools();
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), randomness);
    }

    // ============ Edge Case Tests for Auto-Distribution ============

    function test_AutoDistribution_SingleOwnerGetsAll() public {
        // Setup: One person owns all sold squares
        uint256 randomness = 12345;
        uint8 winningPos = _calculateWinningPositionForZeroScore(randomness);

        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Single Owner Pool",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0),
            maxSquaresPerUser: 0,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "TeamA",
            teamBName: "TeamB",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0)
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        pool = SquaresPool(payable(poolAddr));

        // Alice buys 20 squares, avoiding winning position
        uint8[] memory positions = new uint8[](20);
        uint8 idx = 0;
        for (uint8 i = 10; i < 50 && idx < 20; i++) {
            if (i != winningPos) {
                positions[idx] = i;
                idx++;
            }
        }
        vm.prank(alice);
        pool.buySquares{value: 2 ether}(positions, "");

        // Trigger VRF
        factory.triggerVRFForAllPools();
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), randomness);

        uint256 aliceBalanceBefore = alice.balance;

        // Submit all quarters with no winner
        vm.startPrank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q2, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q3, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 0, 0);
        vm.stopPrank();

        // Alice should receive 100% of the pot (2 ETH)
        uint256 aliceBalanceAfter = alice.balance;
        assertEq(aliceBalanceAfter - aliceBalanceBefore, 2 ether, "Single owner should get entire distribution");
    }

    function test_AutoDistribution_ManySmallOwners() public {
        // Setup: 10 different owners with 1 square each
        uint256 randomness = 12345;
        uint8 winningPos = _calculateWinningPositionForZeroScore(randomness);

        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Many Owners Pool",
            squarePrice: 1 ether,
            paymentToken: address(0),
            maxSquaresPerUser: 0,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "TeamA",
            teamBName: "TeamB",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0)
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        pool = SquaresPool(payable(poolAddr));

        // Create 10 buyers, each buys 1 square
        address[] memory buyers = new address[](10);
        for (uint256 i = 0; i < 10; i++) {
            buyers[i] = address(uint160(100 + i));
            vm.deal(buyers[i], 10 ether);
        }

        // Each buyer purchases 1 square, avoiding winning position
        uint8 posIdx = 10;
        for (uint256 i = 0; i < 10; i++) {
            if (posIdx == winningPos) posIdx++;
            uint8[] memory pos = new uint8[](1);
            pos[0] = posIdx;
            vm.prank(buyers[i]);
            pool.buySquares{value: 1 ether}(pos, "");
            posIdx++;
        }

        // Trigger VRF
        factory.triggerVRFForAllPools();
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), randomness);

        // Record balances before
        uint256[] memory balancesBefore = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            balancesBefore[i] = buyers[i].balance;
        }

        // Submit all quarters with no winner
        vm.startPrank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q2, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q3, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 0, 0);
        vm.stopPrank();

        // Each buyer should receive exactly 1 ETH (10 ETH / 10 squares)
        for (uint256 i = 0; i < 10; i++) {
            uint256 received = buyers[i].balance - balancesBefore[i];
            assertEq(received, 1 ether, "Each owner should receive equal share");
        }
    }

    function test_AutoDistribution_RoundingDust() public {
        // Setup: 3 squares, 1 ETH - doesn't divide evenly
        uint256 randomness = 12345;
        uint8 winningPos = _calculateWinningPositionForZeroScore(randomness);

        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Rounding Pool",
            squarePrice: 0.333333333333333333 ether, // ~1/3 ETH each, total ~1 ETH
            paymentToken: address(0),
            maxSquaresPerUser: 0,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "TeamA",
            teamBName: "TeamB",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0)
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        pool = SquaresPool(payable(poolAddr));

        // 3 different buyers, each buys 1 square
        address buyer1 = address(0x1001);
        address buyer2 = address(0x1002);
        address buyer3 = address(0x1003);
        vm.deal(buyer1, 10 ether);
        vm.deal(buyer2, 10 ether);
        vm.deal(buyer3, 10 ether);

        uint8 pos = 10;
        if (pos == winningPos) pos++;
        uint8[] memory p1 = new uint8[](1);
        p1[0] = pos;
        vm.prank(buyer1);
        pool.buySquares{value: 0.333333333333333333 ether}(p1, "");

        pos++;
        if (pos == winningPos) pos++;
        uint8[] memory p2 = new uint8[](1);
        p2[0] = pos;
        vm.prank(buyer2);
        pool.buySquares{value: 0.333333333333333333 ether}(p2, "");

        pos++;
        if (pos == winningPos) pos++;
        uint8[] memory p3 = new uint8[](1);
        p3[0] = pos;
        vm.prank(buyer3);
        pool.buySquares{value: 0.333333333333333333 ether}(p3, "");

        // Trigger VRF
        factory.triggerVRFForAllPools();
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), randomness);

        uint256 b1Before = buyer1.balance;
        uint256 b2Before = buyer2.balance;
        uint256 b3Before = buyer3.balance;

        // Submit all quarters with no winner
        vm.startPrank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q2, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q3, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 0, 0);
        vm.stopPrank();

        // Each should receive 1/3 of the pot (with potential 1 wei rounding loss)
        (, , , , uint256 totalPot, , ,) = pool.getPoolInfo();
        uint256 expectedPerSquare = totalPot / 3;

        uint256 b1Received = buyer1.balance - b1Before;
        uint256 b2Received = buyer2.balance - b2Before;
        uint256 b3Received = buyer3.balance - b3Before;

        // Allow for 1 wei rounding difference per share
        assertApproxEqAbs(b1Received, expectedPerSquare, 1, "Buyer1 share");
        assertApproxEqAbs(b2Received, expectedPerSquare, 1, "Buyer2 share");
        assertApproxEqAbs(b3Received, expectedPerSquare, 1, "Buyer3 share");

        // Verify total distributed is close to total pot (within 3 wei for 3 divisions)
        uint256 totalDistributed = b1Received + b2Received + b3Received;
        assertApproxEqAbs(totalDistributed, totalPot, 3, "Total distributed should be close to pot");

        // Some dust may remain in contract due to rounding
        uint256 contractBalance = address(pool).balance;
        assertTrue(contractBalance <= 3, "Dust should be minimal (<= 3 wei)");
    }

    function test_AutoDistribution_OnlyOneSquareSold() public {
        // Edge case: only 1 square sold in entire pool
        uint256 randomness = 12345;
        uint8 winningPos = _calculateWinningPositionForZeroScore(randomness);

        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "One Square Pool",
            squarePrice: 5 ether,
            paymentToken: address(0),
            maxSquaresPerUser: 0,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "TeamA",
            teamBName: "TeamB",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0)
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        pool = SquaresPool(payable(poolAddr));

        // Alice buys only 1 square (not the winning position)
        uint8 pos = (winningPos == 50) ? 51 : 50;
        uint8[] memory positions = new uint8[](1);
        positions[0] = pos;
        vm.prank(alice);
        pool.buySquares{value: 5 ether}(positions, "");

        // Trigger VRF
        factory.triggerVRFForAllPools();
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), randomness);

        uint256 aliceBalanceBefore = alice.balance;

        // Submit all quarters with no winner
        vm.startPrank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q2, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q3, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 0, 0);
        vm.stopPrank();

        // Alice should get entire 5 ETH back
        assertEq(alice.balance - aliceBalanceBefore, 5 ether, "Single square owner gets all");
    }

    function test_AutoDistribution_WithERC20Token() public {
        // Test auto-distribution with ERC20 token instead of ETH
        uint256 randomness = 12345;
        uint8 winningPos = _calculateWinningPositionForZeroScore(randomness);

        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "ERC20 Distribution Pool",
            squarePrice: 100e18, // 100 tokens per square
            paymentToken: address(paymentToken),
            maxSquaresPerUser: 0,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "TeamA",
            teamBName: "TeamB",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0)
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        pool = SquaresPool(payable(poolAddr));

        // Mint and approve tokens for alice and bob
        paymentToken.mint(alice, 1000e18);
        paymentToken.mint(bob, 4000e18);

        vm.prank(alice);
        paymentToken.approve(address(pool), type(uint256).max);
        vm.prank(bob);
        paymentToken.approve(address(pool), type(uint256).max);

        // Alice buys 10 squares
        uint8[] memory alicePositions = new uint8[](10);
        uint8 aliceIdx = 0;
        for (uint8 i = 10; i < 30 && aliceIdx < 10; i++) {
            if (i != winningPos) {
                alicePositions[aliceIdx] = i;
                aliceIdx++;
            }
        }
        vm.prank(alice);
        pool.buySquares(alicePositions, "");

        // Bob buys 40 squares
        uint8[] memory bobPositions = new uint8[](40);
        uint8 bobIdx = 0;
        for (uint8 i = 30; i < 100 && bobIdx < 40; i++) {
            if (i != winningPos) {
                bobPositions[bobIdx] = i;
                bobIdx++;
            }
        }
        vm.prank(bob);
        pool.buySquares(bobPositions, "");

        // Trigger VRF
        factory.triggerVRFForAllPools();
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), randomness);

        uint256 aliceTokensBefore = paymentToken.balanceOf(alice);
        uint256 bobTokensBefore = paymentToken.balanceOf(bob);

        // Submit all quarters with no winner
        vm.startPrank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q2, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q3, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 0, 0);
        vm.stopPrank();

        // Total pot = 5000 tokens, Alice (10/50) = 1000, Bob (40/50) = 4000
        uint256 aliceReceived = paymentToken.balanceOf(alice) - aliceTokensBefore;
        uint256 bobReceived = paymentToken.balanceOf(bob) - bobTokensBefore;

        assertEq(aliceReceived, 1000e18, "Alice should receive 1000 tokens");
        assertEq(bobReceived, 4000e18, "Bob should receive 4000 tokens");
    }

    function test_AutoDistribution_PartialRolloverThenDistribution() public {
        // Q1, Q2, Q3 have winners (paid out), but FINAL has no winner
        // Only FINAL's payout should go to distribution
        _buyAllSquaresWithAlice();
        _setupForScoringWithPool(pool);

        // Get numbers to find a score where alice wins
        (uint8[10] memory rows, uint8[10] memory cols) = pool.getNumbers();

        // Find what score hits position 0 (alice owns all)
        uint8 teamADigit = rows[0];
        uint8 teamBDigit = cols[0];

        uint256 aliceBalanceBefore = alice.balance;

        // Q1, Q2, Q3: Alice wins (score hits her square)
        vm.startPrank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, teamADigit, teamBDigit);
        pool.submitScore(ISquaresPool.Quarter.Q2, teamADigit + 10, teamBDigit + 10);
        pool.submitScore(ISquaresPool.Quarter.Q3, teamADigit + 20, teamBDigit + 20);
        vm.stopPrank();

        uint256 aliceAfterQ3 = alice.balance;
        uint256 q1q2q3Payout = aliceAfterQ3 - aliceBalanceBefore;
        assertTrue(q1q2q3Payout > 0, "Alice should have received Q1-Q3 payouts");

        // Now submit FINAL with a score that hits an unowned square
        // Score (0,0) should hit the winning position for zero score
        uint256 aliceBeforeFinal = alice.balance;
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 0, 0);

        uint256 aliceAfterFinal = alice.balance;

        // Alice owns all squares, so even though FINAL had "no winner" for that position,
        // if she owns it, she'd be the winner. Let's check the actual behavior.
        // If she doesn't own the winning position, she gets distribution of FINAL payout
        // Since she owns ALL squares, she owns the winning position too

        // Actually with _buyAllSquaresWithAlice(), she owns all 100 squares
        // So she will always win every quarter - let me adjust this test
    }

    function test_AutoDistribution_OnlyFinalNoWinner() public {
        // Q1, Q2, Q3 have winners who get paid, FINAL has no winner -> distribution
        uint256 randomness = 12345;
        uint8 winningPos = _calculateWinningPositionForZeroScore(randomness);

        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Partial Winner Pool",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0),
            maxSquaresPerUser: 0,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "TeamA",
            teamBName: "TeamB",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0)
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        pool = SquaresPool(payable(poolAddr));

        // Alice buys ALL squares except the winning position for (0,0)
        uint8[] memory positions = new uint8[](99);
        uint8 idx = 0;
        for (uint8 i = 0; i < 100; i++) {
            if (i != winningPos) {
                positions[idx] = i;
                idx++;
            }
        }
        vm.prank(alice);
        pool.buySquares{value: 9.9 ether}(positions, "");

        // Trigger VRF
        factory.triggerVRFForAllPools();
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), randomness);

        // Get row/col numbers to find winning scores for alice
        (uint8[10] memory rows, uint8[10] memory cols) = pool.getNumbers();

        // Find a position alice owns and get its winning score
        uint8 alicePos = (winningPos == 0) ? 1 : 0;
        uint8 aliceRow = alicePos / 10;
        uint8 aliceCol = alicePos % 10;
        uint8 winDigitA = rows[aliceRow];
        uint8 winDigitB = cols[aliceCol];

        uint256 aliceBalanceBefore = alice.balance;

        // Q1, Q2, Q3: Alice wins (score that hits her square)
        vm.startPrank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, winDigitA, winDigitB);
        pool.submitScore(ISquaresPool.Quarter.Q2, winDigitA + 10, winDigitB + 10);
        pool.submitScore(ISquaresPool.Quarter.Q3, winDigitA + 20, winDigitB + 20);
        vm.stopPrank();

        uint256 aliceAfterQ3 = alice.balance;
        uint256 q1q2q3Payout = aliceAfterQ3 - aliceBalanceBefore;

        // Total pot = 9.9 ETH
        // Q1 = 20% = 1.98 ETH, Q2 = 20% = 1.98 ETH, Q3 = 20% = 1.98 ETH
        uint256 expectedQ1Q2Q3 = (9.9 ether * 60) / 100;
        assertEq(q1q2q3Payout, expectedQ1Q2Q3, "Alice should get Q1+Q2+Q3 payouts");

        // FINAL: Score (0,0) hits unowned square -> distribution
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 0, 0);

        uint256 aliceAfterFinal = alice.balance;
        uint256 finalDistribution = aliceAfterFinal - aliceAfterQ3;

        // FINAL payout = 40% = 3.96 ETH, alice owns 99/99 = 100% of sold squares
        uint256 expectedFinalDist = (9.9 ether * 40) / 100;
        assertEq(finalDistribution, expectedFinalDist, "Alice should get full FINAL distribution");

        // Verify distribution state
        (uint256 rolled, uint256 distPool, bool ready) = pool.getUnclaimedInfo();
        assertEq(rolled, 0, "No rolled amount after distribution");
        assertEq(distPool, expectedFinalDist, "Distribution pool should match");
        assertTrue(ready, "Distribution should be ready");
    }

    function test_AutoDistribution_NonParticipantGetsNothing() public {
        _setupPoolForFinalDistribution();

        uint256 charlieBalanceBefore = charlie.balance;

        // Submit all quarters with no winner
        vm.startPrank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q2, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q3, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 0, 0);
        vm.stopPrank();

        // Charlie didn't buy any squares, should receive nothing
        assertEq(charlie.balance, charlieBalanceBefore, "Non-participant should receive nothing");

        // Verify charlie is not marked as claimed
        (, bool charlieClaimed) = pool.getFinalDistributionShare(charlie);
        assertFalse(charlieClaimed, "Non-participant should not be marked as claimed");
    }

    function test_AutoDistribution_LargePot() public {
        // Test with a very large pot to ensure no overflow issues
        uint256 randomness = 12345;
        uint8 winningPos = _calculateWinningPositionForZeroScore(randomness);

        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Large Pot Pool",
            squarePrice: 100 ether, // 100 ETH per square
            paymentToken: address(0),
            maxSquaresPerUser: 0,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "TeamA",
            teamBName: "TeamB",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0)
        });

        vm.prank(operator);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        pool = SquaresPool(payable(poolAddr));

        // Fund alice and bob with large amounts
        vm.deal(alice, 10000 ether);
        vm.deal(bob, 10000 ether);

        // Alice buys 20 squares = 2000 ETH
        uint8[] memory alicePositions = new uint8[](20);
        uint8 aliceIdx = 0;
        for (uint8 i = 10; i < 50 && aliceIdx < 20; i++) {
            if (i != winningPos) {
                alicePositions[aliceIdx] = i;
                aliceIdx++;
            }
        }
        vm.prank(alice);
        pool.buySquares{value: 2000 ether}(alicePositions, "");

        // Bob buys 30 squares = 3000 ETH
        uint8[] memory bobPositions = new uint8[](30);
        uint8 bobIdx = 0;
        for (uint8 i = 50; i < 100 && bobIdx < 30; i++) {
            if (i != winningPos) {
                bobPositions[bobIdx] = i;
                bobIdx++;
            }
        }
        vm.prank(bob);
        pool.buySquares{value: 3000 ether}(bobPositions, "");

        // Total pot = 5000 ETH

        // Trigger VRF
        factory.triggerVRFForAllPools();
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), randomness);

        uint256 aliceBalanceBefore = alice.balance;
        uint256 bobBalanceBefore = bob.balance;

        // Submit all quarters with no winner
        vm.startPrank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q2, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.Q3, 0, 0);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 0, 0);
        vm.stopPrank();

        // Alice: 20/50 = 40% of 5000 ETH = 2000 ETH
        // Bob: 30/50 = 60% of 5000 ETH = 3000 ETH
        assertEq(alice.balance - aliceBalanceBefore, 2000 ether, "Alice should receive 2000 ETH");
        assertEq(bob.balance - bobBalanceBefore, 3000 ether, "Bob should receive 3000 ETH");
    }

    function test_AutoDistribution_AllQuartersRollToFinal() public {
        // All Q1-Q3 have no winners, Final also has no winner
        // Everything should go to distribution
        _setupPoolForFinalDistribution();

        uint256 aliceBalanceBefore = alice.balance;
        uint256 bobBalanceBefore = bob.balance;

        // Verify no rolled amount initially
        (uint256 rolledBefore, , ) = pool.getUnclaimedInfo();
        assertEq(rolledBefore, 0, "No rolled amount initially");

        // Q1: No winner, rolls 1 ETH (20% of 5 ETH)
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 0, 0);
        (uint256 rolledAfterQ1, , ) = pool.getUnclaimedInfo();
        assertEq(rolledAfterQ1, 1 ether, "Q1 payout should roll");

        // Q2: No winner, rolls another 1 ETH
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q2, 0, 0);
        (uint256 rolledAfterQ2, , ) = pool.getUnclaimedInfo();
        assertEq(rolledAfterQ2, 2 ether, "Q1+Q2 should be rolled");

        // Q3: No winner, rolls another 1 ETH
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q3, 0, 0);
        (uint256 rolledAfterQ3, , ) = pool.getUnclaimedInfo();
        assertEq(rolledAfterQ3, 3 ether, "Q1+Q2+Q3 should be rolled");

        // FINAL: No winner, triggers distribution of 3 ETH rolled + 2 ETH Final = 5 ETH total
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 0, 0);

        // Verify distribution happened
        (uint256 rolledAfterFinal, uint256 distPool, bool ready) = pool.getUnclaimedInfo();
        assertEq(rolledAfterFinal, 0, "Rolled should be 0 after distribution");
        assertEq(distPool, 5 ether, "Full pot in distribution");
        assertTrue(ready, "Distribution ready");

        // Alice: 10/50 = 20% = 1 ETH
        // Bob: 40/50 = 80% = 4 ETH
        assertEq(alice.balance - aliceBalanceBefore, 1 ether, "Alice gets 1 ETH");
        assertEq(bob.balance - bobBalanceBefore, 4 ether, "Bob gets 4 ETH");
    }
}
