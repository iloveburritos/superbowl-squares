// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SquaresPool} from "../src/SquaresPool.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";
import {ISquaresPool} from "../src/interfaces/ISquaresPool.sol";
import {MockFunctionsRouter} from "./mocks/MockFunctionsRouter.sol";
import {MockVRFCoordinatorV2Plus} from "./mocks/MockVRFCoordinatorV2Plus.sol";
import {MockAutomationRegistrar} from "./mocks/MockAutomationRegistrar.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SquaresPoolTest is Test {
    SquaresFactory public factory;
    SquaresPool public pool;
    MockFunctionsRouter public functionsRouter;
    MockVRFCoordinatorV2Plus public vrfCoordinator;
    MockAutomationRegistrar public automationRegistrar;
    MockERC20 public paymentToken;

    address public operator = address(0x1);
    address public alice = address(0x2);
    address public bob = address(0x3);
    address public charlie = address(0x4);

    uint256 public constant SQUARE_PRICE = 0.1 ether;
    uint256 public constant CREATION_FEE = 0.1 ether; // Must cover automationFundingAmount (default 0.1 ETH)

    function setUp() public {
        // Deploy mocks
        functionsRouter = new MockFunctionsRouter();
        vrfCoordinator = new MockVRFCoordinatorV2Plus();
        automationRegistrar = new MockAutomationRegistrar();
        paymentToken = new MockERC20("Test Token", "TEST", 18);

        // Deploy factory with Chainlink config
        factory = new SquaresFactory(
            address(functionsRouter),
            address(vrfCoordinator),
            address(automationRegistrar),
            1, // Functions subscriptionId
            bytes32("test-don-id"),
            1, // VRF subscriptionId
            bytes32("test-key-hash"),
            CREATION_FEE
        );

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
        address poolAddr = factory.createPool{value: CREATION_FEE}(params);
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

    // ============ VRF + Automation Tests ============

    function test_CheckUpkeep_ReturnsFalseBeforeTriggerTime() public {
        // Buy a square first
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        (bool upkeepNeeded,) = pool.checkUpkeep("");
        assertFalse(upkeepNeeded, "Upkeep should not be needed before trigger time");
    }

    function test_CheckUpkeep_ReturnsFalseWithNoSales() public {
        // Fast forward to trigger time
        vm.warp(block.timestamp + 8 days);

        (bool upkeepNeeded,) = pool.checkUpkeep("");
        assertFalse(upkeepNeeded, "Upkeep should not be needed with no sales");
    }

    function test_CheckUpkeep_ReturnsTrueWhenReady() public {
        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        // Fast forward to trigger time
        vm.warp(block.timestamp + 8 days);

        (bool upkeepNeeded,) = pool.checkUpkeep("");
        assertTrue(upkeepNeeded, "Upkeep should be needed when ready");
    }

    function test_PerformUpkeep_ClosesPoolAndRequestsVRF() public {
        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        // Fast forward to trigger time
        vm.warp(block.timestamp + 8 days);

        // Perform upkeep
        pool.performUpkeep("");

        // Check state is CLOSED
        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.CLOSED));

        // Check VRF was requested
        assertTrue(pool.vrfRequested(), "VRF should be requested");
        assertTrue(pool.vrfRequestId() > 0, "VRF request ID should be set");
    }

    function test_PerformUpkeep_RevertIfNotReady() public {
        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions, "");

        // Try to perform upkeep before trigger time
        vm.expectRevert(SquaresPool.VRFTriggerTimeNotReached.selector);
        pool.performUpkeep("");
    }

    function test_PerformUpkeep_RevertIfNoSales() public {
        // Fast forward to trigger time
        vm.warp(block.timestamp + 8 days);

        // Try to perform upkeep with no sales
        vm.expectRevert(SquaresPool.NoSquaresSold.selector);
        pool.performUpkeep("");
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

    // ============ Payout Tests ============

    function test_ClaimPayout() public {
        // Buy all squares with alice
        _buyAllSquaresWithAlice();
        _setupForScoringWithPool(pool);

        // Submit Q1 score via operator
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);

        // Check winner
        (address winner, uint256 payout) = pool.getWinner(ISquaresPool.Quarter.Q1);
        assertEq(winner, alice);

        // Total pot should be 10 ether (100 squares * 0.1 ETH)
        // Q1 payout is 20% = 2 ether
        assertEq(payout, 2 ether);

        uint256 balanceBefore = alice.balance;

        vm.prank(alice);
        pool.claimPayout(ISquaresPool.Quarter.Q1);

        uint256 balanceAfter = alice.balance;
        assertEq(balanceAfter - balanceBefore, 2 ether);
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

        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);

        vm.prank(alice);
        pool.claimPayout(ISquaresPool.Quarter.Q1);

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

        // 2. Fast forward to trigger time and perform upkeep
        vm.warp(block.timestamp + 8 days);
        pool.performUpkeep("");

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
        address poolAddr = factory.createPool{value: CREATION_FEE}(params);
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

        // Fast forward and trigger
        vm.warp(block.timestamp + 8 days);
        pool.performUpkeep("");
    }

    function _setupForScoring() internal {
        _setupVRFRequested();

        // Fulfill VRF
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), 12345);
    }

    function _setupForScoringWithPool(SquaresPool targetPool) internal {
        // Fast forward and trigger
        vm.warp(block.timestamp + 8 days);
        targetPool.performUpkeep("");

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
        address poolAddr = factory.createPool{value: CREATION_FEE}(params);
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
        address poolAddr = factory.createPool{value: CREATION_FEE}(params);
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
        address poolAddr = factory.createPool{value: CREATION_FEE}(params);
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
        address poolAddr = factory.createPool{value: CREATION_FEE}(params);
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
}
