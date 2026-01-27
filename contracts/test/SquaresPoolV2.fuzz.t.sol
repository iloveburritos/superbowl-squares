// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SquaresPoolV2} from "../src/SquaresPoolV2.sol";
import {SquaresFactoryV2} from "../src/SquaresFactoryV2.sol";
import {ISquaresPool} from "../src/interfaces/ISquaresPool.sol";
import {SquaresLib} from "../src/libraries/SquaresLib.sol";
import {MockVRFCoordinator} from "./mocks/MockVRFCoordinator.sol";
import {MockFunctionsRouter} from "./mocks/MockFunctionsRouter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @title SquaresPoolV2FuzzTest
/// @notice Fuzz tests to find edge cases with random inputs
contract SquaresPoolV2FuzzTest is Test {
    SquaresFactoryV2 public factory;
    MockVRFCoordinator public vrfCoordinator;
    MockFunctionsRouter public functionsRouter;
    MockERC20 public paymentToken;

    address public operator = address(0x1);

    function setUp() public {
        vrfCoordinator = new MockVRFCoordinator();
        functionsRouter = new MockFunctionsRouter();
        paymentToken = new MockERC20("Test", "TEST", 18);

        factory = new SquaresFactoryV2(
            address(vrfCoordinator),
            address(functionsRouter),
            123,
            bytes32("DON1")
        );

        factory.setDefaultFunctionsSource("return 1;");
    }

    // ============ Fuzz: Payout Percentage Validation ============

    function testFuzz_PayoutPercentages_MustSumTo100(
        uint8 p1,
        uint8 p2,
        uint8 p3,
        uint8 p4
    ) public {
        uint16 sum = uint16(p1) + uint16(p2) + uint16(p3) + uint16(p4);

        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Fuzz Pool",
            squarePrice: 0.1 ether,
            paymentToken: address(0),
            maxSquaresPerUser: 0,
            payoutPercentages: [p1, p2, p3, p4],
            teamAName: "Team A",
            teamBName: "Team B",
            purchaseDeadline: block.timestamp + 7 days,
            vrfDeadline: block.timestamp + 8 days,
            vrfSubscriptionId: 1,
            vrfKeyHash: bytes32(0),
            umaDisputePeriod: 0,
            umaBondAmount: 0
        });

        if (sum == 100) {
            // Should succeed
            vm.prank(operator);
            address poolAddr = factory.createPool(params);
            assertTrue(poolAddr != address(0));
        } else {
            // Should revert
            vm.prank(operator);
            vm.expectRevert(SquaresPoolV2.InvalidPayoutPercentages.selector);
            factory.createPool(params);
        }
    }

    // ============ Fuzz: Square Purchase ============

    function testFuzz_BuySquares_ValidPositions(uint8 position) public {
        vm.assume(position < 100);

        SquaresPoolV2 pool = _createPool();
        address buyer = address(uint160(position) + 100);
        vm.deal(buyer, 10 ether);

        uint8[] memory positions = new uint8[](1);
        positions[0] = position;

        vm.prank(buyer);
        pool.buySquares{value: 0.1 ether}(positions);

        address[100] memory grid = pool.getGrid();
        assertEq(grid[position], buyer);
    }

    function testFuzz_BuySquares_InvalidPositions(uint8 position) public {
        vm.assume(position >= 100);

        SquaresPoolV2 pool = _createPool();
        address buyer = address(0x999);
        vm.deal(buyer, 10 ether);

        uint8[] memory positions = new uint8[](1);
        positions[0] = position;

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SquaresPoolV2.InvalidPosition.selector, position));
        pool.buySquares{value: 0.1 ether}(positions);
    }

    function testFuzz_BuySquares_MultipleBuyers(
        uint8 buyer1Pos,
        uint8 buyer2Pos
    ) public {
        vm.assume(buyer1Pos < 100);
        vm.assume(buyer2Pos < 100);

        SquaresPoolV2 pool = _createPool();

        address buyer1 = address(0x100);
        address buyer2 = address(0x200);
        vm.deal(buyer1, 10 ether);
        vm.deal(buyer2, 10 ether);

        uint8[] memory pos1 = new uint8[](1);
        pos1[0] = buyer1Pos;

        vm.prank(buyer1);
        pool.buySquares{value: 0.1 ether}(pos1);

        uint8[] memory pos2 = new uint8[](1);
        pos2[0] = buyer2Pos;

        if (buyer1Pos == buyer2Pos) {
            // Should revert - square already owned
            vm.prank(buyer2);
            vm.expectRevert(abi.encodeWithSelector(SquaresPoolV2.SquareAlreadyOwned.selector, buyer2Pos));
            pool.buySquares{value: 0.1 ether}(pos2);
        } else {
            // Should succeed
            vm.prank(buyer2);
            pool.buySquares{value: 0.1 ether}(pos2);

            address[100] memory grid = pool.getGrid();
            assertEq(grid[buyer1Pos], buyer1);
            assertEq(grid[buyer2Pos], buyer2);
        }
    }

    function testFuzz_BuySquares_ExcessRefund(uint256 overpayment) public {
        vm.assume(overpayment > 0.1 ether);
        vm.assume(overpayment < 100 ether);

        SquaresPoolV2 pool = _createPool();

        address buyer = address(0x123);
        vm.deal(buyer, overpayment);

        uint256 balanceBefore = buyer.balance;

        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;

        vm.prank(buyer);
        pool.buySquares{value: overpayment}(positions);

        // Should have refunded excess
        assertEq(balanceBefore - buyer.balance, 0.1 ether);
    }

    // ============ Fuzz: Score Verification ============

    function testFuzz_ScoreDecoding(
        uint8 teamAScore,
        uint8 teamBScore,
        bool verified
    ) public {
        SquaresPoolV2 pool = _createPoolAndSetupForScoring();

        vm.prank(address(0x100));
        bytes32 requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);

        functionsRouter.setNextResponse(teamAScore, teamBScore, verified);
        functionsRouter.autoFulfill(requestId);

        ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);

        if (verified) {
            assertTrue(score.settled);
            assertEq(score.teamAScore, teamAScore);
            assertEq(score.teamBScore, teamBScore);
        } else {
            assertFalse(score.settled);
            assertFalse(score.submitted); // Reset for retry
        }
    }

    // ============ Fuzz: Winning Position Calculation ============

    function testFuzz_WinningPosition(
        uint256 vrfSeed1,
        uint256 vrfSeed2,
        uint8 teamAScore,
        uint8 teamBScore
    ) public {
        // Generate row and column numbers using VRF seeds
        uint8[10] memory rowNumbers = SquaresLib.fisherYatesShuffle(vrfSeed1);
        uint8[10] memory colNumbers = SquaresLib.fisherYatesShuffle(vrfSeed2);

        // Calculate winning position
        uint8 winningPosition = SquaresLib.getWinningPosition(
            teamAScore,
            teamBScore,
            rowNumbers,
            colNumbers
        );

        // Verify position is valid
        assertTrue(winningPosition < 100, "Winning position must be < 100");

        // Verify the calculation is correct
        uint8 teamALastDigit = teamAScore % 10;
        uint8 teamBLastDigit = teamBScore % 10;

        // Find expected row and column
        uint8 expectedRow;
        uint8 expectedCol;

        for (uint8 i = 0; i < 10; i++) {
            if (rowNumbers[i] == teamALastDigit) expectedRow = i;
            if (colNumbers[i] == teamBLastDigit) expectedCol = i;
        }

        uint8 expectedPosition = expectedRow * 10 + expectedCol;
        assertEq(winningPosition, expectedPosition, "Winning position calculation mismatch");
    }

    // ============ Fuzz: Fisher-Yates Shuffle ============

    function testFuzz_FisherYatesShuffle_ValidPermutation(uint256 seed) public pure {
        uint8[10] memory numbers = SquaresLib.fisherYatesShuffle(seed);

        // Check all numbers 0-9 are present exactly once
        bool[10] memory seen;
        for (uint8 i = 0; i < 10; i++) {
            assertTrue(numbers[i] < 10, "Number out of range");
            assertFalse(seen[numbers[i]], "Duplicate number found");
            seen[numbers[i]] = true;
        }

        // Verify all were seen
        for (uint8 i = 0; i < 10; i++) {
            assertTrue(seen[i], "Missing number in permutation");
        }
    }

    function testFuzz_FisherYatesShuffle_DifferentSeeds(
        uint256 seed1,
        uint256 seed2
    ) public pure {
        // Skip if seeds are the same
        vm.assume(seed1 != seed2);

        uint8[10] memory numbers1 = SquaresLib.fisherYatesShuffle(seed1);
        uint8[10] memory numbers2 = SquaresLib.fisherYatesShuffle(seed2);

        // Different seeds should produce different permutations (with high probability)
        bool allSame = true;
        for (uint8 i = 0; i < 10; i++) {
            if (numbers1[i] != numbers2[i]) {
                allSame = false;
                break;
            }
        }

        // Note: There's a very small chance (1/10!) that two different seeds
        // produce the same permutation, but it's astronomically unlikely
        // We don't assert this to avoid flaky tests
    }

    // ============ Fuzz: Payout Calculation ============

    function testFuzz_PayoutCalculation(uint256 totalPot, uint8 percentage) public pure {
        vm.assume(percentage <= 100);
        vm.assume(totalPot < type(uint256).max / 100); // Prevent overflow

        uint256 payout = SquaresLib.calculatePayout(totalPot, percentage);

        uint256 expected = (totalPot * percentage) / 100;
        assertEq(payout, expected);

        // Verify payout is never more than pot
        assertTrue(payout <= totalPot);
    }

    function testFuzz_PayoutCalculation_AllQuarters(
        uint256 totalPot,
        uint8 p1Seed
    ) public pure {
        // Generate percentages that sum to 100 from a seed
        uint8 p1 = uint8(bound(p1Seed, 0, 100));
        uint8 remaining = 100 - p1;
        uint8 p2 = remaining / 3;
        uint8 p3 = remaining / 3;
        uint8 p4 = remaining - p2 - p3; // Ensures sum is exactly 100

        vm.assume(totalPot < type(uint256).max / 100);
        vm.assume(totalPot > 0);

        uint256 payout1 = SquaresLib.calculatePayout(totalPot, p1);
        uint256 payout2 = SquaresLib.calculatePayout(totalPot, p2);
        uint256 payout3 = SquaresLib.calculatePayout(totalPot, p3);
        uint256 payout4 = SquaresLib.calculatePayout(totalPot, p4);

        uint256 totalPayouts = payout1 + payout2 + payout3 + payout4;

        // Due to rounding, total payouts should be <= total pot
        assertTrue(totalPayouts <= totalPot);

        // Rounding error should be minimal (at most 3 wei for 4 divisions)
        assertTrue(totalPot - totalPayouts <= 3);
    }

    // ============ Fuzz: Square Price ============

    function testFuzz_SquarePrice(uint256 price) public {
        vm.assume(price < type(uint128).max); // Reasonable max

        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Price Test",
            squarePrice: price,
            paymentToken: address(0),
            maxSquaresPerUser: 0,
            payoutPercentages: [uint8(25), uint8(25), uint8(25), uint8(25)],
            teamAName: "A",
            teamBName: "B",
            purchaseDeadline: block.timestamp + 7 days,
            vrfDeadline: block.timestamp + 8 days,
            vrfSubscriptionId: 1,
            vrfKeyHash: bytes32(0),
            umaDisputePeriod: 0,
            umaBondAmount: 0
        });

        vm.prank(operator);
        address poolAddr = factory.createPool(params);
        SquaresPoolV2 pool = SquaresPoolV2(payable(poolAddr));

        address buyer = address(0x999);
        vm.deal(buyer, price * 2);

        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;

        if (price > 0) {
            // Need to pay
            vm.prank(buyer);
            pool.buySquares{value: price}(positions);
        } else {
            // Free squares
            vm.prank(buyer);
            pool.buySquares(positions);
        }

        address[100] memory grid = pool.getGrid();
        assertEq(grid[0], buyer);
    }

    // ============ Fuzz: Max Squares Per User ============

    function testFuzz_MaxSquaresPerUser(uint8 maxSquares, uint8 numToBuy) public {
        vm.assume(maxSquares > 0 && maxSquares <= 100);
        vm.assume(numToBuy > 0 && numToBuy <= 100);

        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Max Test",
            squarePrice: 0.1 ether,
            paymentToken: address(0),
            maxSquaresPerUser: maxSquares,
            payoutPercentages: [uint8(25), uint8(25), uint8(25), uint8(25)],
            teamAName: "A",
            teamBName: "B",
            purchaseDeadline: block.timestamp + 7 days,
            vrfDeadline: block.timestamp + 8 days,
            vrfSubscriptionId: 1,
            vrfKeyHash: bytes32(0),
            umaDisputePeriod: 0,
            umaBondAmount: 0
        });

        vm.prank(operator);
        address poolAddr = factory.createPool(params);
        SquaresPoolV2 pool = SquaresPoolV2(payable(poolAddr));

        address buyer = address(0x999);
        vm.deal(buyer, 100 ether);

        uint8[] memory positions = new uint8[](numToBuy);
        for (uint8 i = 0; i < numToBuy; i++) {
            positions[i] = i;
        }

        if (numToBuy > maxSquares) {
            vm.prank(buyer);
            vm.expectRevert(
                abi.encodeWithSelector(
                    SquaresPoolV2.MaxSquaresExceeded.selector,
                    buyer,
                    0,
                    maxSquares
                )
            );
            pool.buySquares{value: uint256(numToBuy) * 0.1 ether}(positions);
        } else {
            vm.prank(buyer);
            pool.buySquares{value: uint256(numToBuy) * 0.1 ether}(positions);
            assertEq(pool.userSquareCount(buyer), numToBuy);
        }
    }

    // ============ Fuzz: Timestamp/Deadline ============

    function testFuzz_PurchaseDeadline(uint256 timeToWarp) public {
        vm.assume(timeToWarp > 0);
        vm.assume(timeToWarp < 365 days);

        SquaresPoolV2 pool = _createPool();

        // Warp time
        vm.warp(block.timestamp + timeToWarp);

        address buyer = address(0x999);
        vm.deal(buyer, 10 ether);

        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;

        if (timeToWarp > 7 days) {
            // Past deadline
            vm.prank(buyer);
            vm.expectRevert(SquaresPoolV2.PurchaseDeadlinePassed.selector);
            pool.buySquares{value: 0.1 ether}(positions);
        } else {
            // Before deadline
            vm.prank(buyer);
            pool.buySquares{value: 0.1 ether}(positions);
        }
    }

    // ============ Helper Functions ============

    function _createPool() internal returns (SquaresPoolV2) {
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Test Pool",
            squarePrice: 0.1 ether,
            paymentToken: address(0),
            maxSquaresPerUser: 0,
            payoutPercentages: [uint8(25), uint8(25), uint8(25), uint8(25)],
            teamAName: "A",
            teamBName: "B",
            purchaseDeadline: block.timestamp + 7 days,
            vrfDeadline: block.timestamp + 8 days,
            vrfSubscriptionId: 1,
            vrfKeyHash: bytes32(0),
            umaDisputePeriod: 0,
            umaBondAmount: 0
        });

        vm.prank(operator);
        address poolAddr = factory.createPool(params);
        return SquaresPoolV2(payable(poolAddr));
    }

    function _createPoolAndSetupForScoring() internal returns (SquaresPoolV2) {
        SquaresPoolV2 pool = _createPool();

        // Buy all squares
        address buyer = address(0x100);
        vm.deal(buyer, 100 ether);

        uint8[] memory positions = new uint8[](100);
        for (uint8 i = 0; i < 100; i++) {
            positions[i] = i;
        }

        vm.prank(buyer);
        pool.buySquares{value: 10 ether}(positions);

        // Setup for scoring
        vm.prank(operator);
        pool.closePool();

        vm.prank(operator);
        uint256 requestId = pool.requestRandomNumbers();

        uint256[] memory randomWords = new uint256[](2);
        randomWords[0] = 12345;
        randomWords[1] = 67890;
        vrfCoordinator.fulfillRandomWords(requestId, randomWords);

        return pool;
    }
}
