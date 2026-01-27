// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console, Vm} from "forge-std/Test.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";
import {SquaresPool} from "../src/SquaresPool.sol";
import {ISquaresPool} from "../src/interfaces/ISquaresPool.sol";
import {MockFunctionsRouter} from "./mocks/MockFunctionsRouter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @title CommitRevealTest
/// @notice Comprehensive tests for the commit-reveal randomness scheme
contract CommitRevealTest is Test {
    SquaresFactory public factory;
    SquaresPool public pool;
    MockFunctionsRouter public functionsRouter;
    MockERC20 public paymentToken;

    address public operator = address(0x1);
    address public alice = address(0x2);
    address public bob = address(0x3);

    uint64 constant SUBSCRIPTION_ID = 1;
    bytes32 constant DON_ID = bytes32("fun-ethereum-sepolia-1");

    function setUp() public {
        // Deploy mock functions router
        functionsRouter = new MockFunctionsRouter();

        // Deploy factory with Chainlink Functions config
        factory = new SquaresFactory(
            address(functionsRouter),
            SUBSCRIPTION_ID,
            DON_ID
        );

        // Deploy payment token
        paymentToken = new MockERC20("Test USDC", "USDC", 6);

        // Create pool
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Test Pool",
            squarePrice: 1e6, // 1 USDC
            paymentToken: address(paymentToken),
            maxSquaresPerUser: 10,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Team A",
            teamBName: "Team B",
            purchaseDeadline: uint256(block.timestamp + 7 days),
            revealDeadline: uint256(block.timestamp + 14 days),
            passwordHash: bytes32(0) // Public pool
        });

        vm.prank(operator);
        address poolAddress = factory.createPool(params);
        pool = SquaresPool(payable(poolAddress));

        // Fund users
        paymentToken.mint(alice, 100e6);
        paymentToken.mint(bob, 100e6);

        vm.prank(alice);
        paymentToken.approve(address(pool), type(uint256).max);
        vm.prank(bob);
        paymentToken.approve(address(pool), type(uint256).max);
    }

    // ============ Access Control Tests ============

    function test_OnlyOperatorCanCommit() public {
        vm.prank(operator);
        pool.closePool();

        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        // Non-operator should fail
        vm.prank(alice);
        vm.expectRevert(SquaresPool.OnlyOperator.selector);
        pool.commitRandomness(commitment);

        // Operator should succeed
        vm.prank(operator);
        pool.commitRandomness(commitment);
    }

    function test_OnlyOperatorCanReveal() public {
        vm.prank(operator);
        pool.closePool();

        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        vm.roll(block.number + 1);

        // Non-operator should fail
        vm.prank(alice);
        vm.expectRevert(SquaresPool.OnlyOperator.selector);
        pool.revealRandomness(seed);

        // Operator should succeed
        vm.prank(operator);
        pool.revealRandomness(seed);
    }

    // ============ State Transition Tests ============

    function test_CannotCommitWhenOpen() public {
        // Pool is still open (state = OPEN, required = CLOSED)
        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SquaresPool.InvalidState.selector,
                ISquaresPool.PoolState.OPEN,
                ISquaresPool.PoolState.CLOSED
            )
        );
        pool.commitRandomness(commitment);
    }

    function test_CannotCommitAfterNumbersAssigned() public {
        _setupNumbersAssigned();

        uint256 seed = 99999;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SquaresPool.InvalidState.selector,
                ISquaresPool.PoolState.NUMBERS_ASSIGNED,
                ISquaresPool.PoolState.CLOSED
            )
        );
        pool.commitRandomness(commitment);
    }

    function test_CannotRevealWhenOpen() public {
        // Pool is still open (state = OPEN, required = CLOSED)
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SquaresPool.InvalidState.selector,
                ISquaresPool.PoolState.OPEN,
                ISquaresPool.PoolState.CLOSED
            )
        );
        pool.revealRandomness(12345);
    }

    function test_CannotRevealAfterNumbersAssigned() public {
        _setupNumbersAssigned();

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SquaresPool.InvalidState.selector,
                ISquaresPool.PoolState.NUMBERS_ASSIGNED,
                ISquaresPool.PoolState.CLOSED
            )
        );
        pool.revealRandomness(12345);
    }

    // ============ Deadline Tests ============

    function test_CannotCommitAfterRevealDeadline() public {
        vm.prank(operator);
        pool.closePool();

        // Fast forward past reveal deadline
        vm.warp(block.timestamp + 15 days);

        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        vm.expectRevert(SquaresPool.RevealDeadlinePassed.selector);
        pool.commitRandomness(commitment);
    }

    function test_CanCommitJustBeforeDeadline() public {
        vm.prank(operator);
        pool.closePool();

        // Fast forward to just before reveal deadline
        vm.warp(block.timestamp + 14 days - 1);

        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        assertEq(pool.commitment(), commitment);
    }

    // ============ Event Tests ============

    function test_EmitsRandomnessCommittedEvent() public {
        vm.prank(operator);
        pool.closePool();

        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        vm.expectEmit(true, true, true, true);
        emit ISquaresPool.RandomnessCommitted(commitment, block.number);
        pool.commitRandomness(commitment);
    }

    function test_EmitsRandomnessRevealedEvent() public {
        vm.prank(operator);
        pool.closePool();

        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        uint256 commitBlock = block.number;
        vm.roll(block.number + 1);

        bytes32 expectedBlockHash = blockhash(commitBlock);

        vm.prank(operator);
        vm.expectEmit(true, true, true, true);
        emit ISquaresPool.RandomnessRevealed(seed, expectedBlockHash);
        pool.revealRandomness(seed);
    }

    function test_EmitsNumbersAssignedEvent() public {
        vm.prank(operator);
        pool.closePool();

        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        vm.roll(block.number + 1);

        // Just check that NumbersAssigned is emitted (we don't know exact values)
        vm.prank(operator);
        vm.recordLogs();
        pool.revealRandomness(seed);

        // Verify NumbersAssigned event was emitted
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("NumbersAssigned(uint8[10],uint8[10])")) {
                found = true;
                break;
            }
        }
        assertTrue(found, "NumbersAssigned event not emitted");
    }

    // ============ Randomness Quality Tests ============

    function test_DifferentSeedsProduceDifferentResults() public {
        // Create two pools with different seeds
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Pool 2",
            squarePrice: 1e6,
            paymentToken: address(paymentToken),
            maxSquaresPerUser: 10,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Team A",
            teamBName: "Team B",
            purchaseDeadline: uint256(block.timestamp + 7 days),
            revealDeadline: uint256(block.timestamp + 14 days),
            passwordHash: bytes32(0) // Public pool
        });

        vm.prank(operator);
        address pool2Address = factory.createPool(params);
        SquaresPool pool2 = SquaresPool(payable(pool2Address));

        // Setup pool 1 with seed 111
        vm.prank(operator);
        pool.closePool();
        vm.prank(operator);
        pool.commitRandomness(keccak256(abi.encodePacked(uint256(111))));
        vm.roll(block.number + 1);
        vm.prank(operator);
        pool.revealRandomness(111);

        // Setup pool 2 with seed 222
        vm.prank(operator);
        pool2.closePool();
        vm.prank(operator);
        pool2.commitRandomness(keccak256(abi.encodePacked(uint256(222))));
        vm.roll(block.number + 1);
        vm.prank(operator);
        pool2.revealRandomness(222);

        // Get numbers from both pools
        (uint8[10] memory rows1, uint8[10] memory cols1) = pool.getNumbers();
        (uint8[10] memory rows2, uint8[10] memory cols2) = pool2.getNumbers();

        // They should be different (extremely high probability)
        bool rowsDifferent = false;
        bool colsDifferent = false;

        for (uint256 i = 0; i < 10; i++) {
            if (rows1[i] != rows2[i]) rowsDifferent = true;
            if (cols1[i] != cols2[i]) colsDifferent = true;
        }

        assertTrue(rowsDifferent || colsDifferent, "Different seeds should produce different results");
    }

    function test_NumbersAreValidPermutation() public {
        vm.prank(operator);
        pool.closePool();

        uint256 seed = 98765;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        vm.roll(block.number + 1);

        vm.prank(operator);
        pool.revealRandomness(seed);

        (uint8[10] memory rows, uint8[10] memory cols) = pool.getNumbers();

        // Verify rows is a valid permutation of 0-9
        uint256 rowSum = 0;
        uint256 rowProduct = 1;
        for (uint256 i = 0; i < 10; i++) {
            assertTrue(rows[i] < 10, "Row number out of range");
            rowSum += rows[i];
            rowProduct *= (rows[i] + 1); // Add 1 to avoid multiplying by 0
        }
        assertEq(rowSum, 45, "Row sum should be 0+1+2+...+9 = 45");
        assertEq(rowProduct, 3628800, "Row product should be 1*2*3*...*10 = 10!");

        // Verify cols is a valid permutation of 0-9
        uint256 colSum = 0;
        uint256 colProduct = 1;
        for (uint256 i = 0; i < 10; i++) {
            assertTrue(cols[i] < 10, "Col number out of range");
            colSum += cols[i];
            colProduct *= (cols[i] + 1);
        }
        assertEq(colSum, 45, "Col sum should be 0+1+2+...+9 = 45");
        assertEq(colProduct, 3628800, "Col product should be 1*2*3*...*10 = 10!");
    }

    function test_RowsAndColsCanBeDifferent() public {
        vm.prank(operator);
        pool.closePool();

        uint256 seed = 42424242;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        vm.roll(block.number + 1);

        vm.prank(operator);
        pool.revealRandomness(seed);

        (uint8[10] memory rows, uint8[10] memory cols) = pool.getNumbers();

        // Rows and cols should be independently shuffled (likely different)
        bool different = false;
        for (uint256 i = 0; i < 10; i++) {
            if (rows[i] != cols[i]) {
                different = true;
                break;
            }
        }
        assertTrue(different, "Rows and cols should be different permutations");
    }

    // ============ Block Hash Security Tests ============

    function test_RevealAtBlockBoundary() public {
        vm.prank(operator);
        pool.closePool();

        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        // Reveal at exactly block + 1
        vm.roll(block.number + 1);

        vm.prank(operator);
        pool.revealRandomness(seed);

        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));
    }

    function test_RevealAt256BlocksIsValid() public {
        vm.prank(operator);
        pool.closePool();

        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        // Reveal at exactly block + 256 (should still work - blockhash available for 256 blocks)
        vm.roll(block.number + 256);

        vm.prank(operator);
        pool.revealRandomness(seed);

        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));
    }

    function test_RevealAt257BlocksFails() public {
        vm.prank(operator);
        pool.closePool();

        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        // Reveal at block + 257 (blockhash returns 0 after 256 blocks)
        vm.roll(block.number + 257);

        vm.prank(operator);
        vm.expectRevert(SquaresPool.RevealTooLate.selector);
        pool.revealRandomness(seed);
    }

    // ============ Full Integration Tests ============

    function test_FullGameFlowWithCommitReveal() public {
        // 1. Buy squares
        uint8[] memory positions = new uint8[](5);
        positions[0] = 0;
        positions[1] = 11;
        positions[2] = 22;
        positions[3] = 33;
        positions[4] = 44;

        vm.prank(alice);
        pool.buySquares(positions, "");

        // Verify squares were bought
        address[100] memory grid = pool.getGrid();
        assertEq(grid[0], alice);
        assertEq(grid[11], alice);
        assertEq(grid[22], alice);
        assertEq(grid[33], alice);
        assertEq(grid[44], alice);

        // 2. Close pool
        vm.prank(operator);
        pool.closePool();

        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.CLOSED));

        // 3. Commit randomness
        uint256 seed = 777888999;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        assertEq(pool.commitment(), commitment);
        assertEq(pool.commitBlock(), block.number);

        // 4. Wait and reveal
        vm.roll(block.number + 5);

        vm.prank(operator);
        pool.revealRandomness(seed);

        // 5. Verify state changed to NUMBERS_ASSIGNED
        (, state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));

        // 6. Verify numbers are assigned and valid
        (uint8[10] memory rows, uint8[10] memory cols) = pool.getNumbers();

        // Verify rows is a valid permutation
        uint256 rowSum = 0;
        for (uint256 i = 0; i < 10; i++) {
            assertTrue(rows[i] < 10, "Row number out of range");
            rowSum += rows[i];
        }
        assertEq(rowSum, 45, "Row sum should be 0+1+2+...+9 = 45");

        // Verify cols is a valid permutation
        uint256 colSum = 0;
        for (uint256 i = 0; i < 10; i++) {
            assertTrue(cols[i] < 10, "Col number out of range");
            colSum += cols[i];
        }
        assertEq(colSum, 45, "Col sum should be 0+1+2+...+9 = 45");

        // 7. Verify total pot is correct (5 squares * 1e6 = 5e6)
        (, , , , uint256 totalPot, uint256 squaresSold, ,) = pool.getPoolInfo();
        assertEq(squaresSold, 5);
        assertEq(totalPot, 5e6);
    }

    function test_CommitmentCannotBeReused() public {
        vm.prank(operator);
        pool.closePool();

        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        // Even a different commitment should fail
        bytes32 commitment2 = keccak256(abi.encodePacked(uint256(99999)));

        vm.prank(operator);
        vm.expectRevert(SquaresPool.AlreadyCommitted.selector);
        pool.commitRandomness(commitment2);
    }

    function test_CommitmentIsStoredCorrectly() public {
        vm.prank(operator);
        pool.closePool();

        uint256 seed = 987654321;
        bytes32 expectedCommitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(expectedCommitment);

        assertEq(pool.commitment(), expectedCommitment);
        assertEq(pool.commitBlock(), block.number);
    }

    // ============ Fuzz Tests ============

    function testFuzz_CommitRevealWithAnySeed(uint256 seed) public {
        vm.assume(seed != 0); // Avoid edge case with 0 seed

        vm.prank(operator);
        pool.closePool();

        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        vm.roll(block.number + 1);

        vm.prank(operator);
        pool.revealRandomness(seed);

        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));

        // Verify valid permutation
        (uint8[10] memory rows, uint8[10] memory cols) = pool.getNumbers();

        uint256 rowSum = 0;
        uint256 colSum = 0;
        for (uint256 i = 0; i < 10; i++) {
            rowSum += rows[i];
            colSum += cols[i];
        }
        assertEq(rowSum, 45, "Invalid row permutation");
        assertEq(colSum, 45, "Invalid col permutation");
    }

    function testFuzz_WrongSeedAlwaysFails(uint256 correctSeed, uint256 wrongSeed) public {
        vm.assume(correctSeed != wrongSeed);

        vm.prank(operator);
        pool.closePool();

        bytes32 commitment = keccak256(abi.encodePacked(correctSeed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        vm.roll(block.number + 1);

        vm.prank(operator);
        vm.expectRevert(SquaresPool.InvalidReveal.selector);
        pool.revealRandomness(wrongSeed);
    }

    function testFuzz_RevealTimingConstraints(uint256 blockDelta) public {
        vm.assume(blockDelta > 0 && blockDelta < 1000);

        vm.prank(operator);
        pool.closePool();

        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        vm.roll(block.number + blockDelta);

        vm.prank(operator);
        if (blockDelta > 256) {
            // blockhash returns 0 after 256 blocks
            vm.expectRevert(SquaresPool.RevealTooLate.selector);
            pool.revealRandomness(seed);
        } else {
            // Should succeed (1 to 256 blocks is valid)
            pool.revealRandomness(seed);
            (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
            assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));
        }
    }

    // ============ Helpers ============

    function _setupNumbersAssigned() internal {
        vm.prank(operator);
        pool.closePool();

        uint256 seed = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.prank(operator);
        pool.commitRandomness(commitment);

        vm.roll(block.number + 1);

        vm.prank(operator);
        pool.revealRandomness(seed);
    }
}
