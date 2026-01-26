// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SquaresPool} from "../src/SquaresPool.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";
import {ISquaresPool} from "../src/interfaces/ISquaresPool.sol";
import {MockVRFCoordinator} from "./mocks/MockVRFCoordinator.sol";
import {MockUMAOracle} from "./mocks/MockUMAOracle.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SquaresPoolTest is Test {
    SquaresFactory public factory;
    SquaresPool public pool;
    MockVRFCoordinator public vrfCoordinator;
    MockUMAOracle public umaOracle;
    MockERC20 public bondToken;
    MockERC20 public paymentToken;

    address public operator = address(0x1);
    address public alice = address(0x2);
    address public bob = address(0x3);
    address public charlie = address(0x4);

    uint256 public constant SQUARE_PRICE = 0.1 ether;
    uint256 public constant BOND_AMOUNT = 100e6; // 100 USDC

    function setUp() public {
        // Deploy mocks
        vrfCoordinator = new MockVRFCoordinator();
        umaOracle = new MockUMAOracle();
        bondToken = new MockERC20("USD Coin", "USDC", 6);
        paymentToken = new MockERC20("Test Token", "TEST", 18);

        // Deploy factory
        factory = new SquaresFactory(
            address(vrfCoordinator),
            address(umaOracle),
            address(bondToken)
        );

        // Create pool with ETH payments
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Super Bowl LVIII",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0), // ETH
            maxSquaresPerUser: 10,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Chiefs",
            teamBName: "49ers",
            purchaseDeadline: block.timestamp + 7 days,
            vrfDeadline: block.timestamp + 8 days,
            vrfSubscriptionId: 1,
            vrfKeyHash: bytes32(0),
            umaDisputePeriod: 2 hours,
            umaBondAmount: BOND_AMOUNT
        });

        vm.prank(operator);
        address poolAddr = factory.createPool(params);
        pool = SquaresPool(payable(poolAddr));

        // Fund accounts
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);

        // Mint bond tokens for score submissions
        bondToken.mint(alice, 1000e6);
        bondToken.mint(bob, 1000e6);

        vm.prank(alice);
        bondToken.approve(address(pool), type(uint256).max);
        vm.prank(bob);
        bondToken.approve(address(pool), type(uint256).max);
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

        assertEq(name, "Super Bowl LVIII");
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.OPEN));
        assertEq(squarePrice, SQUARE_PRICE);
        assertEq(token, address(0));
        assertEq(totalPot, 0);
        assertEq(squaresSold, 0);
        assertEq(teamAName, "Chiefs");
        assertEq(teamBName, "49ers");
    }

    // ============ Square Purchase Tests ============

    function test_BuySquares() public {
        uint8[] memory positions = new uint8[](3);
        positions[0] = 0;
        positions[1] = 55;
        positions[2] = 99;

        vm.prank(alice);
        pool.buySquares{value: 0.3 ether}(positions);

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
        pool.buySquares{value: 1 ether}(positions);

        uint256 balanceAfter = alice.balance;
        assertEq(balanceBefore - balanceAfter, SQUARE_PRICE);
    }

    function test_BuySquares_RevertIfAlreadyOwned() public {
        uint8[] memory positions = new uint8[](1);
        positions[0] = 50;

        vm.prank(alice);
        pool.buySquares{value: SQUARE_PRICE}(positions);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SquaresPool.SquareAlreadyOwned.selector, 50));
        pool.buySquares{value: SQUARE_PRICE}(positions);
    }

    function test_BuySquares_RevertIfInvalidPosition() public {
        uint8[] memory positions = new uint8[](1);
        positions[0] = 100; // Invalid

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SquaresPool.InvalidPosition.selector, 100));
        pool.buySquares{value: SQUARE_PRICE}(positions);
    }

    function test_BuySquares_RevertIfMaxExceeded() public {
        // Buy 10 squares (max)
        uint8[] memory positions = new uint8[](10);
        for (uint8 i = 0; i < 10; i++) {
            positions[i] = i;
        }

        vm.prank(alice);
        pool.buySquares{value: 1 ether}(positions);

        // Try to buy one more
        uint8[] memory extraPosition = new uint8[](1);
        extraPosition[0] = 10;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SquaresPool.MaxSquaresExceeded.selector, alice, 10, 10));
        pool.buySquares{value: SQUARE_PRICE}(extraPosition);
    }

    function test_BuySquares_RevertIfInsufficientPayment() public {
        uint8[] memory positions = new uint8[](2);
        positions[0] = 0;
        positions[1] = 1;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SquaresPool.InsufficientPayment.selector, 0.1 ether, 0.2 ether));
        pool.buySquares{value: 0.1 ether}(positions);
    }

    function test_BuySquares_RevertAfterDeadline() public {
        vm.warp(block.timestamp + 8 days);

        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;

        vm.prank(alice);
        vm.expectRevert(SquaresPool.PurchaseDeadlinePassed.selector);
        pool.buySquares{value: SQUARE_PRICE}(positions);
    }

    // ============ Pool Close Tests ============

    function test_ClosePool() public {
        vm.prank(operator);
        pool.closePool();

        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.CLOSED));
    }

    function test_ClosePool_RevertIfNotOperator() public {
        vm.prank(alice);
        vm.expectRevert(SquaresPool.OnlyOperator.selector);
        pool.closePool();
    }

    function test_ClosePool_RevertIfAlreadyClosed() public {
        vm.prank(operator);
        pool.closePool();

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SquaresPool.InvalidState.selector,
                ISquaresPool.PoolState.CLOSED,
                ISquaresPool.PoolState.OPEN
            )
        );
        pool.closePool();
    }

    // ============ VRF Tests ============

    function test_RequestRandomNumbers() public {
        vm.prank(operator);
        pool.closePool();

        vm.prank(operator);
        uint256 requestId = pool.requestRandomNumbers();

        assertEq(requestId, 1);
        assertEq(pool.vrfRequestId(), 1);
    }

    function test_FulfillRandomWords() public {
        vm.prank(operator);
        pool.closePool();

        vm.prank(operator);
        uint256 requestId = pool.requestRandomNumbers();

        // Fulfill with random numbers
        uint256[] memory randomWords = new uint256[](2);
        randomWords[0] = 12345;
        randomWords[1] = 67890;

        vrfCoordinator.fulfillRandomWords(requestId, randomWords);

        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));

        (uint8[10] memory rows, uint8[10] memory cols) = pool.getNumbers();

        // Verify all numbers 0-9 are present in rows
        bool[10] memory rowSeen;
        for (uint8 i = 0; i < 10; i++) {
            rowSeen[rows[i]] = true;
        }
        for (uint8 i = 0; i < 10; i++) {
            assertTrue(rowSeen[i], "Missing row number");
        }

        // Verify all numbers 0-9 are present in cols
        bool[10] memory colSeen;
        for (uint8 i = 0; i < 10; i++) {
            colSeen[cols[i]] = true;
        }
        for (uint8 i = 0; i < 10; i++) {
            assertTrue(colSeen[i], "Missing col number");
        }
    }

    // ============ Score Submission Tests ============

    function test_SubmitScore() public {
        _setupForScoring();

        vm.prank(alice);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);

        ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
        assertTrue(score.submitted);
        assertEq(score.teamAScore, 7);
        assertEq(score.teamBScore, 3);
    }

    function test_SettleScore() public {
        _setupForScoring();

        vm.prank(alice);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);

        // Fast forward past dispute period
        vm.warp(block.timestamp + 3 hours);

        ISquaresPool.Score memory scoreBefore = pool.getScore(ISquaresPool.Quarter.Q1);
        umaOracle.setAssertionExpired(scoreBefore.assertionId);

        pool.settleScore(ISquaresPool.Quarter.Q1);

        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.Q1_SCORED));

        ISquaresPool.Score memory scoreAfter = pool.getScore(ISquaresPool.Quarter.Q1);
        assertTrue(scoreAfter.settled);
    }

    // ============ Payout Tests ============

    function test_ClaimPayout() public {
        // Buy all squares with alice
        _buyAllSquaresWithAlice();
        _setupForScoring();

        // Submit and settle Q1 score
        vm.prank(alice);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);

        vm.warp(block.timestamp + 3 hours);
        ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
        umaOracle.setAssertionExpired(score.assertionId);
        pool.settleScore(ISquaresPool.Quarter.Q1);

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
        _setupForScoring();

        vm.prank(alice);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);

        vm.warp(block.timestamp + 3 hours);
        ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
        umaOracle.setAssertionExpired(score.assertionId);
        pool.settleScore(ISquaresPool.Quarter.Q1);

        vm.prank(bob);
        vm.expectRevert(SquaresPool.NotWinner.selector);
        pool.claimPayout(ISquaresPool.Quarter.Q1);
    }

    function test_ClaimPayout_RevertIfAlreadyClaimed() public {
        _buyAllSquaresWithAlice();
        _setupForScoring();

        vm.prank(alice);
        pool.submitScore(ISquaresPool.Quarter.Q1, 7, 3);

        vm.warp(block.timestamp + 3 hours);
        ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
        umaOracle.setAssertionExpired(score.assertionId);
        pool.settleScore(ISquaresPool.Quarter.Q1);

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
        pool.buySquares{value: 0.5 ether}(aliceSquares);

        uint8[] memory bobSquares = new uint8[](5);
        bobSquares[0] = 55;
        bobSquares[1] = 66;
        bobSquares[2] = 77;
        bobSquares[3] = 88;
        bobSquares[4] = 99;

        vm.prank(bob);
        pool.buySquares{value: 0.5 ether}(bobSquares);

        // 2. Close pool and request random numbers
        vm.prank(operator);
        pool.closePool();

        vm.prank(operator);
        uint256 requestId = pool.requestRandomNumbers();

        // 3. Fulfill VRF
        uint256[] memory randomWords = new uint256[](2);
        randomWords[0] = 12345;
        randomWords[1] = 67890;
        vrfCoordinator.fulfillRandomWords(requestId, randomWords);

        // 4. Game is ready for scoring
        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));
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
            vrfDeadline: block.timestamp + 8 days,
            vrfSubscriptionId: 1,
            vrfKeyHash: bytes32(0),
            umaDisputePeriod: 2 hours,
            umaBondAmount: BOND_AMOUNT
        });

        vm.prank(operator);
        address poolAddr = factory.createPool(params);
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
        erc20Pool.buySquares(positions);

        (, , , , uint256 totalPot, uint256 squaresSold, ,) = erc20Pool.getPoolInfo();
        assertEq(totalPot, 200e18);
        assertEq(squaresSold, 2);
    }

    // ============ Helper Functions ============

    function _setupForScoring() internal {
        vm.prank(operator);
        pool.closePool();

        vm.prank(operator);
        uint256 requestId = pool.requestRandomNumbers();

        uint256[] memory randomWords = new uint256[](2);
        randomWords[0] = 12345;
        randomWords[1] = 67890;
        vrfCoordinator.fulfillRandomWords(requestId, randomWords);
    }

    function _buyAllSquaresWithAlice() internal {
        // Buy squares in batches of 10 to respect maxSquaresPerUser
        // First, create a pool without the limit
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Unlimited Pool",
            squarePrice: SQUARE_PRICE,
            paymentToken: address(0),
            maxSquaresPerUser: 0, // No limit
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Chiefs",
            teamBName: "49ers",
            purchaseDeadline: block.timestamp + 7 days,
            vrfDeadline: block.timestamp + 8 days,
            vrfSubscriptionId: 1,
            vrfKeyHash: bytes32(0),
            umaDisputePeriod: 2 hours,
            umaBondAmount: BOND_AMOUNT
        });

        vm.prank(operator);
        address poolAddr = factory.createPool(params);
        pool = SquaresPool(payable(poolAddr));

        vm.prank(alice);
        bondToken.approve(address(pool), type(uint256).max);

        // Buy all 100 squares
        uint8[] memory positions = new uint8[](100);
        for (uint8 i = 0; i < 100; i++) {
            positions[i] = i;
        }

        vm.prank(alice);
        pool.buySquares{value: 10 ether}(positions);
    }
}
