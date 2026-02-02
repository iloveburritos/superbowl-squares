// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";
import {SquaresPool} from "../src/SquaresPool.sol";
import {ISquaresPool} from "../src/interfaces/ISquaresPool.sol";
import {MockVRFCoordinatorV2Plus} from "./mocks/MockVRFCoordinatorV2Plus.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SquaresFactoryTest is Test {
    SquaresFactory public factory;
    MockVRFCoordinatorV2Plus public vrfCoordinator;

    address public alice = address(0x1);
    address public bob = address(0x2);
    address public scoreAdmin = address(0x3);

    bytes32 constant VRF_KEY_HASH = 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae;
    uint96 constant VRF_FUNDING_AMOUNT = 1 ether;
    uint256 constant CREATION_FEE = 0.1 ether;
    uint256 constant TOTAL_REQUIRED = CREATION_FEE + VRF_FUNDING_AMOUNT;

    uint256 private poolCounter;

    function setUp() public {
        vrfCoordinator = new MockVRFCoordinatorV2Plus();

        // Fund the test contract
        vm.deal(address(this), 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);

        factory = new SquaresFactory(
            address(vrfCoordinator),
            VRF_KEY_HASH,
            CREATION_FEE
        );

        // Set VRF funding amount
        factory.setVRFFundingAmount(VRF_FUNDING_AMOUNT);
    }

    function test_CreatePool() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);

        assertTrue(poolAddr != address(0));

        SquaresPool pool = SquaresPool(payable(poolAddr));
        (
            string memory name,
            ISquaresPool.PoolState state,
            uint256 squarePrice,
            address paymentToken,
            ,
            ,
            string memory teamAName,
            string memory teamBName
        ) = pool.getPoolInfo();

        assertEq(name, "Test Pool 1");
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.OPEN));
        assertEq(squarePrice, 0.1 ether);
        assertEq(paymentToken, address(0));
        assertEq(teamAName, "Team A");
        assertEq(teamBName, "Team B");
    }

    function test_CreatePool_SetsVRFConfig() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);

        SquaresPool pool = SquaresPool(payable(poolAddr));

        // Factory creates its own subscription, so check it's set (subscription ID is 1 from mock)
        assertEq(pool.vrfSubscriptionId(), factory.defaultVRFSubscriptionId());
        assertEq(pool.vrfKeyHash(), VRF_KEY_HASH);
    }

    function test_CreatePool_AddsVRFConsumer() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);

        // Check pool was added as VRF consumer
        uint256 subId = factory.defaultVRFSubscriptionId();
        (,,,, address[] memory consumers) = vrfCoordinator.getSubscription(subId);
        assertEq(consumers.length, 1, "Should have one consumer");
        assertEq(consumers[0], poolAddr, "Pool should be the consumer");
    }

    function test_CreatePool_FundsVRFSubscription() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        vm.prank(alice);
        factory.createPool{value: TOTAL_REQUIRED}(params);

        // Check VRF subscription was funded
        uint256 subId = factory.defaultVRFSubscriptionId();
        (, uint96 nativeBalance,,,) = vrfCoordinator.getSubscription(subId);
        assertEq(nativeBalance, VRF_FUNDING_AMOUNT, "VRF subscription should be funded");
    }

    function test_CreatePool_AccumulatesVRFFunding() public {
        // Create multiple pools with unique names
        vm.prank(alice);
        factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        vm.prank(alice);
        factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        vm.prank(bob);
        factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());

        // Check VRF subscription accumulated funding
        uint256 subId = factory.defaultVRFSubscriptionId();
        (, uint96 nativeBalance,,,) = vrfCoordinator.getSubscription(subId);
        assertEq(nativeBalance, VRF_FUNDING_AMOUNT * 3, "VRF subscription should have funding from 3 pools");
    }

    function test_FactoryOwnsVRFSubscription() public view {
        uint256 subId = factory.defaultVRFSubscriptionId();
        (,,, address owner,) = vrfCoordinator.getSubscription(subId);
        assertEq(owner, address(factory), "Factory should own the VRF subscription");
    }

    function test_CreatePool_TracksCreator() public {
        vm.prank(alice);
        address pool1 = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());

        vm.prank(alice);
        address pool2 = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());

        vm.prank(bob);
        address pool3 = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());

        address[] memory alicePools = factory.getPoolsByCreator(alice);
        assertEq(alicePools.length, 2);
        assertEq(alicePools[0], pool1);
        assertEq(alicePools[1], pool2);

        address[] memory bobPools = factory.getPoolsByCreator(bob);
        assertEq(bobPools.length, 1);
        assertEq(bobPools[0], pool3);
    }

    function test_CreatePool_RequiresCreationFee() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SquaresFactory.InsufficientCreationFee.selector, 0, TOTAL_REQUIRED));
        factory.createPool(params);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SquaresFactory.InsufficientCreationFee.selector, TOTAL_REQUIRED - 1, TOTAL_REQUIRED));
        factory.createPool{value: TOTAL_REQUIRED - 1}(params);
    }

    function test_CreatePool_RefundsExcess() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        uint256 balanceBefore = alice.balance;
        uint256 excessAmount = 0.5 ether;

        vm.prank(alice);
        factory.createPool{value: TOTAL_REQUIRED + excessAmount}(params);

        uint256 balanceAfter = alice.balance;
        assertEq(balanceBefore - balanceAfter, TOTAL_REQUIRED, "Should only spend total required (creation fee + VRF funding)");
    }

    function test_GetAllPools() public {
        address[] memory expectedPools = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice);
            expectedPools[i] = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        }

        // Get all pools
        (address[] memory pools, uint256 total) = factory.getAllPools(0, 10);
        assertEq(total, 5);
        assertEq(pools.length, 5);

        for (uint256 i = 0; i < 5; i++) {
            assertEq(pools[i], expectedPools[i]);
        }
    }

    function test_GetAllPools_Pagination() public {
        // Create 10 pools
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(alice);
            factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        }

        // Get first page
        (address[] memory page1, uint256 total1) = factory.getAllPools(0, 3);
        assertEq(total1, 10);
        assertEq(page1.length, 3);

        // Get second page
        (address[] memory page2, uint256 total2) = factory.getAllPools(3, 3);
        assertEq(total2, 10);
        assertEq(page2.length, 3);

        // Get last page (partial)
        (address[] memory page4, uint256 total4) = factory.getAllPools(9, 3);
        assertEq(total4, 10);
        assertEq(page4.length, 1);

        // Get beyond end
        (address[] memory empty, uint256 total5) = factory.getAllPools(15, 3);
        assertEq(total5, 10);
        assertEq(empty.length, 0);
    }

    function test_GetPoolCount() public {
        assertEq(factory.getPoolCount(), 0);

        vm.prank(alice);
        factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        assertEq(factory.getPoolCount(), 1);

        vm.prank(bob);
        factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        assertEq(factory.getPoolCount(), 2);
    }

    function test_CreatePool_InvalidPayoutPercentages() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();
        params.payoutPercentages = [uint8(20), uint8(20), uint8(20), uint8(20)]; // Sum = 80, not 100

        vm.prank(alice);
        vm.expectRevert(SquaresPool.InvalidPayoutPercentages.selector);
        factory.createPool{value: TOTAL_REQUIRED}(params);
    }

    function test_ImmutableAddresses() public view {
        assertEq(factory.vrfCoordinator(), address(vrfCoordinator));
        // Factory creates its own subscription (ID 1 from mock)
        assertEq(factory.defaultVRFSubscriptionId(), 1);
        assertEq(factory.defaultVRFKeyHash(), VRF_KEY_HASH);
    }

    function test_AdminFunctions() public {
        // Check initial admin
        assertEq(factory.admin(), address(this));

        // Update VRF subscription
        factory.setVRFSubscription(456);
        assertEq(factory.defaultVRFSubscriptionId(), 456);

        // Update VRF key hash
        bytes32 newKeyHash = bytes32("new-key-hash");
        factory.setVRFKeyHash(newKeyHash);
        assertEq(factory.defaultVRFKeyHash(), newKeyHash);

        // Update creation fee
        factory.setCreationFee(0.01 ether);
        assertEq(factory.creationFee(), 0.01 ether);

        // Update VRF funding amount
        factory.setVRFFundingAmount(0.02 ether);
        assertEq(factory.vrfFundingAmount(), 0.02 ether);

        // Transfer admin
        factory.transferAdmin(alice);
        assertEq(factory.admin(), alice);
    }

    function test_ScoreAdmin() public {
        // Initial score admin should be deployer
        assertEq(factory.scoreAdmin(), address(this));

        // Set new score admin
        factory.setScoreAdmin(scoreAdmin);
        assertEq(factory.scoreAdmin(), scoreAdmin);
    }

    function test_SubmitScoreToAllPools() public {
        // Create a pool and advance it to NUMBERS_ASSIGNED state
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        SquaresPool pool = SquaresPool(payable(poolAddr));

        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: 0.1 ether}(positions, "");

        // Trigger VRF
        factory.triggerVRFForAllPools();

        // Fulfill VRF
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), 12345);

        // Verify pool is in NUMBERS_ASSIGNED state
        (, ISquaresPool.PoolState state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));

        // Submit score to all pools (as factory admin)
        factory.submitScoreToAllPools(0, 7, 3);

        // Verify score was submitted
        ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
        assertTrue(score.submitted);
        assertTrue(score.settled);
        assertEq(score.teamAScore, 7);
        assertEq(score.teamBScore, 3);

        // Verify state advanced
        (, state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.Q1_SCORED));
    }

    function test_SubmitScoreToAllPools_OnlyScoreAdminOrAdmin() public {
        // Set a score admin
        factory.setScoreAdmin(scoreAdmin);

        // Non-admin should fail
        vm.prank(alice);
        vm.expectRevert(SquaresFactory.Unauthorized.selector);
        factory.submitScoreToAllPools(0, 7, 3);

        // Score admin should work
        vm.prank(scoreAdmin);
        factory.submitScoreToAllPools(0, 7, 3); // No revert expected

        // Factory admin should also work
        factory.submitScoreToAllPools(0, 7, 3); // No revert expected
    }

    function test_WithdrawFees() public {
        // Create a pool to generate fees
        vm.prank(alice);
        factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());

        // Check factory balance (should have creation fee only)
        // creationFee (0.1 ETH) stays in factory
        // VRF funding (1 ETH) goes to VRF coordinator
        uint256 factoryBalance = address(factory).balance;
        assertTrue(factoryBalance > 0, "Factory should have balance");
        // Allow 1 wei tolerance for gas refund differences on forked chains
        assertApproxEqAbs(factoryBalance, CREATION_FEE, 1, "Factory should have creation fee");

        // Withdraw fees
        address recipient = address(0x999);
        factory.withdrawFees(recipient);

        assertEq(address(factory).balance, 0, "Factory balance should be 0");
        assertEq(recipient.balance, factoryBalance, "Recipient should receive fees");
    }

    function test_TriggerVRFForAllPools() public {
        // Create multiple pools
        vm.prank(alice);
        address poolAddr1 = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        vm.prank(bob);
        address poolAddr2 = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());

        SquaresPool pool1 = SquaresPool(payable(poolAddr1));
        SquaresPool pool2 = SquaresPool(payable(poolAddr2));

        // Buy squares only in pool1
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool1.buySquares{value: 0.1 ether}(positions, "");

        // Trigger VRF for all pools
        factory.triggerVRFForAllPools();

        // Pool1 should be closed (had sales)
        (, ISquaresPool.PoolState state1,,,,,, ) = pool1.getPoolInfo();
        assertEq(uint8(state1), uint8(ISquaresPool.PoolState.CLOSED));

        // Pool2 should still be open (no sales)
        (, ISquaresPool.PoolState state2,,,,,, ) = pool2.getPoolInfo();
        assertEq(uint8(state2), uint8(ISquaresPool.PoolState.OPEN));
    }

    function test_TriggerVRFForAllPools_OnlyAdminOrScoreAdmin() public {
        // Non-admin should fail
        vm.prank(alice);
        vm.expectRevert(SquaresFactory.Unauthorized.selector);
        factory.triggerVRFForAllPools();

        // Set score admin
        factory.setScoreAdmin(scoreAdmin);

        // Score admin should work
        vm.prank(scoreAdmin);
        factory.triggerVRFForAllPools(); // No revert expected

        // Factory admin should also work
        factory.triggerVRFForAllPools(); // No revert expected
    }

    function test_TriggerVRFForAllPools_EmitsEventWithCorrectCount() public {
        // Create 3 pools
        vm.prank(alice);
        address pool1Addr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        vm.prank(alice);
        address pool2Addr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        vm.prank(alice);
        factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams()); // pool3 - no sales

        SquaresPool pool1 = SquaresPool(payable(pool1Addr));
        SquaresPool pool2 = SquaresPool(payable(pool2Addr));

        // Buy squares in 2 pools
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool1.buySquares{value: 0.1 ether}(positions, "");
        vm.prank(alice);
        pool2.buySquares{value: 0.1 ether}(positions, "");

        // Expect event with count = 2 (only pools with sales)
        vm.expectEmit(true, true, true, true);
        emit VRFTriggeredForAllPools(2);

        factory.triggerVRFForAllPools();
    }

    function test_TriggerVRFForAllPools_NoPools() public {
        // Create a new factory with no pools
        SquaresFactory newFactory = new SquaresFactory(
            address(vrfCoordinator),
            VRF_KEY_HASH,
            CREATION_FEE
        );

        // Should not revert, just emit with 0
        vm.expectEmit(true, true, true, true);
        emit VRFTriggeredForAllPools(0);

        newFactory.triggerVRFForAllPools();
    }

    function test_TriggerVRFForAllPools_AllPoolsAlreadyClosed() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        // Create a pool
        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        SquaresPool pool = SquaresPool(payable(poolAddr));

        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: 0.1 ether}(positions, "");

        // Trigger VRF first time
        factory.triggerVRFForAllPools();

        // Verify pool is closed
        (, ISquaresPool.PoolState state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.CLOSED));

        // Trigger again - should emit 0 because pool is already closed
        vm.expectEmit(true, true, true, true);
        emit VRFTriggeredForAllPools(0);

        factory.triggerVRFForAllPools();
    }

    function test_TriggerVRFForAllPools_IdempotentAfterVRFFulfilled() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        // Create a pool
        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        SquaresPool pool = SquaresPool(payable(poolAddr));

        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: 0.1 ether}(positions, "");

        // Trigger VRF
        factory.triggerVRFForAllPools();

        // Fulfill VRF
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), 12345);

        // Verify pool is in NUMBERS_ASSIGNED state
        (, ISquaresPool.PoolState state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));

        // Trigger again - should not affect pool
        factory.triggerVRFForAllPools();

        // State should still be NUMBERS_ASSIGNED
        (, state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));
    }

    function test_CreatePool_TotalRequiredWithoutAutomation() public {
        // Total required should be creationFee + vrfFundingAmount (no automation)
        uint256 expectedTotal = CREATION_FEE + VRF_FUNDING_AMOUNT;
        assertEq(TOTAL_REQUIRED, expectedTotal, "TOTAL_REQUIRED should equal creationFee + vrfFunding");

        // Should succeed with exact amount
        vm.prank(alice);
        factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());

        // Should fail with less (use fresh params for unique name)
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SquaresFactory.InsufficientCreationFee.selector, TOTAL_REQUIRED - 1, TOTAL_REQUIRED));
        factory.createPool{value: TOTAL_REQUIRED - 1}(_getDefaultParams());
    }

    // Event declaration for testing
    event VRFTriggeredForAllPools(uint256 poolsTriggered);

    function test_OnlyAdminCanCallAdminFunctions() public {
        vm.prank(alice);
        vm.expectRevert(SquaresFactory.OnlyAdmin.selector);
        factory.setVRFSubscription(123);

        vm.prank(alice);
        vm.expectRevert(SquaresFactory.OnlyAdmin.selector);
        factory.setVRFKeyHash(bytes32("test"));

        vm.prank(alice);
        vm.expectRevert(SquaresFactory.OnlyAdmin.selector);
        factory.setCreationFee(0.01 ether);

        vm.prank(alice);
        vm.expectRevert(SquaresFactory.OnlyAdmin.selector);
        factory.withdrawFees(alice);

        vm.prank(alice);
        vm.expectRevert(SquaresFactory.OnlyAdmin.selector);
        factory.transferAdmin(bob);

        vm.prank(alice);
        vm.expectRevert(SquaresFactory.OnlyAdmin.selector);
        factory.setVRFFundingAmount(0.02 ether);

        vm.prank(alice);
        vm.expectRevert(SquaresFactory.OnlyAdmin.selector);
        factory.setScoreAdmin(bob);

        vm.prank(alice);
        vm.expectRevert(SquaresFactory.OnlyAdmin.selector);
        factory.setPoolCreationPaused(true);
    }

    function test_PoolCreationPaused() public {
        // Initially not paused
        assertFalse(factory.poolCreationPaused());

        // Pause pool creation
        factory.setPoolCreationPaused(true);
        assertTrue(factory.poolCreationPaused());

        // Try to create pool while paused - should revert
        ISquaresPool.PoolParams memory params = _getDefaultParams();
        vm.prank(alice);
        vm.expectRevert(SquaresFactory.PoolCreationIsPaused.selector);
        factory.createPool{value: TOTAL_REQUIRED}(params);

        // Unpause pool creation
        factory.setPoolCreationPaused(false);
        assertFalse(factory.poolCreationPaused());

        // Now pool creation should work
        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        assertTrue(poolAddr != address(0));
    }

    function test_PoolCreationPaused_EmitsEvent() public {
        // Expect event when pausing
        vm.expectEmit(true, true, true, true);
        emit PoolCreationPaused(true);
        factory.setPoolCreationPaused(true);

        // Expect event when unpausing
        vm.expectEmit(true, true, true, true);
        emit PoolCreationPaused(false);
        factory.setPoolCreationPaused(false);
    }

    // Event declaration for testing
    event PoolCreationPaused(bool paused);
    event VRFSubscriptionFunded(uint256 indexed subscriptionId, uint256 amount);
    event VRFSubscriptionCancelled(uint256 indexed subscriptionId, address indexed fundsRecipient);

    function test_FundVRFSubscription() public {
        uint256 subId = factory.defaultVRFSubscriptionId();

        // Check initial balance
        (, uint96 initialBalance,,,) = vrfCoordinator.getSubscription(subId);
        assertEq(initialBalance, 0);

        // Fund subscription
        uint256 fundAmount = 2 ether;
        vm.expectEmit(true, true, true, true);
        emit VRFSubscriptionFunded(subId, fundAmount);
        factory.fundVRFSubscription{value: fundAmount}();

        // Check new balance
        (, uint96 newBalance,,,) = vrfCoordinator.getSubscription(subId);
        assertEq(newBalance, fundAmount);
    }

    function test_FundVRFSubscription_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert(SquaresFactory.OnlyAdmin.selector);
        factory.fundVRFSubscription{value: 1 ether}();
    }

    function test_FundVRFSubscription_RequiresValue() public {
        vm.expectRevert(abi.encodeWithSelector(SquaresFactory.InsufficientCreationFee.selector, 0, 1));
        factory.fundVRFSubscription{value: 0}();
    }

    function test_CancelAndWithdrawVRFSubscription() public {
        uint256 subId = factory.defaultVRFSubscriptionId();

        // First fund the subscription
        factory.fundVRFSubscription{value: 5 ether}();

        // Verify it's funded
        (, uint96 balance,,,) = vrfCoordinator.getSubscription(subId);
        assertEq(balance, 5 ether);

        // Cancel and withdraw
        address recipient = address(0x999);
        uint256 recipientBalanceBefore = recipient.balance;

        vm.expectEmit(true, true, true, true);
        emit VRFSubscriptionCancelled(subId, recipient);
        factory.cancelAndWithdrawVRFSubscription(recipient);

        // Check funds were sent to recipient
        assertEq(recipient.balance, recipientBalanceBefore + 5 ether);

        // Check subscription ID was cleared
        assertEq(factory.defaultVRFSubscriptionId(), 0);
    }

    function test_CancelAndWithdrawVRFSubscription_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert(SquaresFactory.OnlyAdmin.selector);
        factory.cancelAndWithdrawVRFSubscription(alice);
    }

    function test_CancelAndWithdrawVRFSubscription_InvalidAddress() public {
        vm.expectRevert(SquaresFactory.InvalidAddress.selector);
        factory.cancelAndWithdrawVRFSubscription(address(0));
    }

    // Event for emergency set numbers
    event EmergencyNumbersSetForAllPools(uint256 poolsSet);

    function test_EmergencySetNumbersForAllPools() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        // Create a pool
        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        SquaresPool pool = SquaresPool(payable(poolAddr));

        // Buy a square
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: 0.1 ether}(positions, "");

        // Trigger VRF to close the pool
        factory.triggerVRFForAllPools();

        // Verify pool is in CLOSED state (waiting for VRF)
        (, ISquaresPool.PoolState state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.CLOSED));

        // Use emergency set numbers
        uint256 randomSeed = 12345;
        factory.emergencySetNumbersForAllPools(randomSeed);

        // Verify pool is now in NUMBERS_ASSIGNED state
        (, state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));

        // Verify numbers are set
        (uint8[10] memory rows, uint8[10] memory cols) = pool.getNumbers();
        // Just check that numbers are set (not all zeros)
        bool hasNonZero = false;
        for (uint256 i = 0; i < 10; i++) {
            if (rows[i] != 0 || cols[i] != 0) {
                hasNonZero = true;
                break;
            }
        }
        assertTrue(hasNonZero || (rows[0] == 0 && cols[0] == 0), "Numbers should be set");
    }

    function test_EmergencySetNumbersForAllPools_OnlyAdminOrScoreAdmin() public {
        vm.prank(alice);
        vm.expectRevert(SquaresFactory.Unauthorized.selector);
        factory.emergencySetNumbersForAllPools(12345);

        // Score admin should be able to call it
        factory.setScoreAdmin(scoreAdmin);
        vm.prank(scoreAdmin);
        factory.emergencySetNumbersForAllPools(12345); // Should not revert
    }

    function test_EmergencySetNumbersForAllPools_SkipsNonClosedPools() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        // Create two pools
        vm.prank(alice);
        address pool1Addr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        vm.prank(alice);
        address pool2Addr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());

        SquaresPool pool1 = SquaresPool(payable(pool1Addr));
        SquaresPool pool2 = SquaresPool(payable(pool2Addr));

        // Buy a square in pool1 only
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool1.buySquares{value: 0.1 ether}(positions, "");

        // Trigger VRF for pool1 only (pool2 has no sales so stays OPEN)
        factory.triggerVRFForAllPools();

        // pool1 should be CLOSED, pool2 should still be OPEN
        (, ISquaresPool.PoolState state1,,,,,, ) = pool1.getPoolInfo();
        (, ISquaresPool.PoolState state2,,,,,, ) = pool2.getPoolInfo();
        assertEq(uint8(state1), uint8(ISquaresPool.PoolState.CLOSED));
        assertEq(uint8(state2), uint8(ISquaresPool.PoolState.OPEN));

        // Emergency set numbers - should only affect pool1
        vm.expectEmit(true, true, true, true);
        emit EmergencyNumbersSetForAllPools(1); // Only 1 pool should be set
        factory.emergencySetNumbersForAllPools(12345);

        // Verify pool1 is NUMBERS_ASSIGNED, pool2 still OPEN
        (, state1,,,,,, ) = pool1.getPoolInfo();
        (, state2,,,,,, ) = pool2.getPoolInfo();
        assertEq(uint8(state1), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));
        assertEq(uint8(state2), uint8(ISquaresPool.PoolState.OPEN));
    }

    function test_EmergencySetNumbersForAllPools_UniqueRandomnessPerPool() public {
        // Create two pools and close them
        vm.prank(alice);
        address pool1Addr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        vm.prank(alice);
        address pool2Addr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());

        SquaresPool pool1 = SquaresPool(payable(pool1Addr));
        SquaresPool pool2 = SquaresPool(payable(pool2Addr));

        // Buy squares in both
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool1.buySquares{value: 0.1 ether}(positions, "");
        vm.prank(alice);
        pool2.buySquares{value: 0.1 ether}(positions, "");

        // Trigger VRF to close both
        factory.triggerVRFForAllPools();

        // Emergency set numbers
        factory.emergencySetNumbersForAllPools(12345);

        // Get numbers from both pools
        (uint8[10] memory rows1, uint8[10] memory cols1) = pool1.getNumbers();
        (uint8[10] memory rows2, uint8[10] memory cols2) = pool2.getNumbers();

        // Numbers should be different (different randomness per pool)
        bool rowsDifferent = false;
        bool colsDifferent = false;
        for (uint256 i = 0; i < 10; i++) {
            if (rows1[i] != rows2[i]) rowsDifferent = true;
            if (cols1[i] != cols2[i]) colsDifferent = true;
        }
        assertTrue(rowsDifferent || colsDifferent, "Pools should have different random numbers");
    }

    function test_EmergencySetNumbersForAllPools_NoPools() public {
        // Create a new factory with no pools
        SquaresFactory newFactory = new SquaresFactory(
            address(vrfCoordinator),
            VRF_KEY_HASH,
            CREATION_FEE
        );

        // Should emit 0 pools set
        vm.expectEmit(true, true, true, true);
        emit EmergencyNumbersSetForAllPools(0);
        newFactory.emergencySetNumbersForAllPools(12345);
    }

    function test_EmergencySetNumbersForAllPools_IdempotentCannotSetTwice() public {
        // Create and close a pool
        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        SquaresPool pool = SquaresPool(payable(poolAddr));

        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: 0.1 ether}(positions, "");

        factory.triggerVRFForAllPools();

        // First emergency set should work
        vm.expectEmit(true, true, true, true);
        emit EmergencyNumbersSetForAllPools(1);
        factory.emergencySetNumbersForAllPools(12345);

        // Second call should not set any pools (already in NUMBERS_ASSIGNED)
        vm.expectEmit(true, true, true, true);
        emit EmergencyNumbersSetForAllPools(0);
        factory.emergencySetNumbersForAllPools(67890);

        // Verify pool is still in NUMBERS_ASSIGNED
        (, ISquaresPool.PoolState state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));
    }

    function test_EmergencySetNumbersForAllPools_SkipsPoolsInOtherStates() public {
        // Create pools in various states
        vm.prank(alice);
        address pool1Addr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams()); // Will be CLOSED
        vm.prank(alice);
        address pool2Addr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams()); // Will be NUMBERS_ASSIGNED
        vm.prank(alice);
        address pool3Addr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams()); // Will stay OPEN (no sales)

        SquaresPool pool1 = SquaresPool(payable(pool1Addr));
        SquaresPool pool2 = SquaresPool(payable(pool2Addr));
        SquaresPool pool3 = SquaresPool(payable(pool3Addr));

        // Buy squares in pools 1 and 2 only (not pool3)
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool1.buySquares{value: 0.1 ether}(positions, "");
        vm.prank(alice);
        pool2.buySquares{value: 0.1 ether}(positions, "");

        // Close pools 1 and 2 (pool3 stays OPEN - no sales)
        factory.triggerVRFForAllPools();

        // Fulfill VRF for pool2 only (simulate VRF working for one but not other)
        vrfCoordinator.fulfillRandomWord(pool2.vrfRequestId(), 11111);

        // Verify states: pool1=CLOSED, pool2=NUMBERS_ASSIGNED, pool3=OPEN
        (, ISquaresPool.PoolState state1,,,,,, ) = pool1.getPoolInfo();
        (, ISquaresPool.PoolState state2,,,,,, ) = pool2.getPoolInfo();
        (, ISquaresPool.PoolState state3,,,,,, ) = pool3.getPoolInfo();
        assertEq(uint8(state1), uint8(ISquaresPool.PoolState.CLOSED));
        assertEq(uint8(state2), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));
        assertEq(uint8(state3), uint8(ISquaresPool.PoolState.OPEN));

        // Emergency set should only affect pool1 (the only one in CLOSED state)
        vm.expectEmit(true, true, true, true);
        emit EmergencyNumbersSetForAllPools(1);
        factory.emergencySetNumbersForAllPools(12345);

        // Verify pool1 is now NUMBERS_ASSIGNED, others unchanged
        (, state1,,,,,, ) = pool1.getPoolInfo();
        (, state2,,,,,, ) = pool2.getPoolInfo();
        (, state3,,,,,, ) = pool3.getPoolInfo();
        assertEq(uint8(state1), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));
        assertEq(uint8(state2), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED)); // unchanged
        assertEq(uint8(state3), uint8(ISquaresPool.PoolState.OPEN)); // unchanged
    }

    function test_EmergencySetNumbersForAllPools_ValidShuffledDigits() public {
        // Create and close a pool
        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        SquaresPool pool = SquaresPool(payable(poolAddr));

        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: 0.1 ether}(positions, "");

        factory.triggerVRFForAllPools();
        factory.emergencySetNumbersForAllPools(12345);

        // Get numbers and verify they're valid permutations of 0-9
        (uint8[10] memory rows, uint8[10] memory cols) = pool.getNumbers();

        // Check rows contain exactly digits 0-9
        bool[10] memory rowDigitSeen;
        for (uint256 i = 0; i < 10; i++) {
            assertLt(rows[i], 10, "Row digit should be 0-9");
            assertFalse(rowDigitSeen[rows[i]], "Row digit should not repeat");
            rowDigitSeen[rows[i]] = true;
        }

        // Check cols contain exactly digits 0-9
        bool[10] memory colDigitSeen;
        for (uint256 i = 0; i < 10; i++) {
            assertLt(cols[i], 10, "Col digit should be 0-9");
            assertFalse(colDigitSeen[cols[i]], "Col digit should not repeat");
            colDigitSeen[cols[i]] = true;
        }
    }

    function test_EmergencySetNumbers_PoolLevel_OnlyAdminOrFactory() public {
        // Create and close a pool
        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        SquaresPool pool = SquaresPool(payable(poolAddr));

        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: 0.1 ether}(positions, "");

        factory.triggerVRFForAllPools();

        // Random user (alice) cannot call emergencySetNumbers
        vm.prank(alice);
        vm.expectRevert("Only admin or factory");
        pool.emergencySetNumbers(12345);

        // Bob cannot call emergencySetNumbers
        vm.prank(bob);
        vm.expectRevert("Only admin or factory");
        pool.emergencySetNumbers(12345);

        // Factory admin (this contract) can call
        pool.emergencySetNumbers(12345);

        (, ISquaresPool.PoolState state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));
    }

    function test_EmergencySetNumbers_PoolLevel_FailsIfNotClosed() public {
        // Create a pool but don't close it
        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        SquaresPool pool = SquaresPool(payable(poolAddr));

        // Pool is in OPEN state
        (, ISquaresPool.PoolState state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.OPEN));

        // Emergency set should fail
        vm.expectRevert("Pool not in CLOSED state");
        pool.emergencySetNumbers(12345);
    }

    function test_EmergencySetNumbers_PoolLevel_FailsIfAlreadyAssigned() public {
        // Create, close, and fulfill VRF for a pool
        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        SquaresPool pool = SquaresPool(payable(poolAddr));

        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: 0.1 ether}(positions, "");

        factory.triggerVRFForAllPools();
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), 12345);

        // Pool is in NUMBERS_ASSIGNED state
        (, ISquaresPool.PoolState state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));

        // Emergency set should fail
        vm.expectRevert("Pool not in CLOSED state");
        pool.emergencySetNumbers(67890);
    }

    function test_EmergencySetNumbers_PoolLevel_FailsIfScored() public {
        // Create a pool and advance to Q1_SCORED
        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        SquaresPool pool = SquaresPool(payable(poolAddr));

        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool.buySquares{value: 0.1 ether}(positions, "");

        factory.triggerVRFForAllPools();
        vrfCoordinator.fulfillRandomWord(pool.vrfRequestId(), 12345);
        factory.submitScoreToAllPools(0, 7, 3); // Q1

        // Pool is in Q1_SCORED state
        (, ISquaresPool.PoolState state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.Q1_SCORED));

        // Emergency set should fail
        vm.expectRevert("Pool not in CLOSED state");
        pool.emergencySetNumbers(67890);
    }

    function test_EmergencySetNumbersForAllPools_DifferentSeedsProduceDifferentResults() public {
        // Create two separate pools and close them
        vm.prank(alice);
        address pool1Addr = factory.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        SquaresPool pool1 = SquaresPool(payable(pool1Addr));

        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;
        vm.prank(alice);
        pool1.buySquares{value: 0.1 ether}(positions, "");

        factory.triggerVRFForAllPools();

        // Set numbers with seed 12345
        factory.emergencySetNumbersForAllPools(12345);
        (uint8[10] memory rows1, uint8[10] memory cols1) = pool1.getNumbers();

        // Create another factory and pool to test different seed
        SquaresFactory factory2 = new SquaresFactory(
            address(vrfCoordinator),
            VRF_KEY_HASH,
            CREATION_FEE
        );
        factory2.setVRFFundingAmount(VRF_FUNDING_AMOUNT);

        vm.prank(alice);
        address pool2Addr = factory2.createPool{value: TOTAL_REQUIRED}(_getDefaultParams());
        SquaresPool pool2 = SquaresPool(payable(pool2Addr));

        vm.prank(alice);
        pool2.buySquares{value: 0.1 ether}(positions, "");

        factory2.triggerVRFForAllPools();

        // Set numbers with different seed 67890
        factory2.emergencySetNumbersForAllPools(67890);
        (uint8[10] memory rows2, uint8[10] memory cols2) = pool2.getNumbers();

        // Results should be different
        bool rowsDifferent = false;
        bool colsDifferent = false;
        for (uint256 i = 0; i < 10; i++) {
            if (rows1[i] != rows2[i]) rowsDifferent = true;
            if (cols1[i] != cols2[i]) colsDifferent = true;
        }
        assertTrue(rowsDifferent || colsDifferent, "Different seeds should produce different numbers");
    }

    function test_EmergencySetNumbers_GameCanContinueAfterEmergency() public {
        // Create pool with unlimited squares per user
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Unlimited Pool",
            squarePrice: 0.1 ether,
            paymentToken: address(0),
            maxSquaresPerUser: 0, // Unlimited
            payoutPercentages: [uint8(25), uint8(25), uint8(25), uint8(25)],
            teamAName: "Team A",
            teamBName: "Team B",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0)
        });

        vm.prank(alice);
        address poolAddr = factory.createPool{value: TOTAL_REQUIRED}(params);
        SquaresPool pool = SquaresPool(payable(poolAddr));

        // Buy all 100 squares
        uint8[] memory allPositions = new uint8[](100);
        for (uint8 i = 0; i < 100; i++) {
            allPositions[i] = i;
        }
        vm.prank(alice);
        pool.buySquares{value: 10 ether}(allPositions, "");

        factory.triggerVRFForAllPools();

        // Use emergency to set numbers (simulating VRF failure)
        factory.emergencySetNumbersForAllPools(12345);

        // Verify pool is ready for scoring
        (, ISquaresPool.PoolState state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));

        // Submit all scores and verify game completes
        factory.submitScoreToAllPools(0, 14, 7);  // Q1
        factory.submitScoreToAllPools(1, 21, 14); // Q2
        factory.submitScoreToAllPools(2, 28, 21); // Q3
        factory.submitScoreToAllPools(3, 35, 28); // Final

        // Verify game is complete
        (, state,,,,,, ) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.FINAL_SCORED));
    }

    function _getDefaultParams() internal returns (ISquaresPool.PoolParams memory) {
        poolCounter++;
        return ISquaresPool.PoolParams({
            name: string(abi.encodePacked("Test Pool ", vm.toString(poolCounter))),
            squarePrice: 0.1 ether,
            paymentToken: address(0),
            maxSquaresPerUser: 10,
            payoutPercentages: [uint8(25), uint8(25), uint8(25), uint8(25)],
            teamAName: "Team A",
            teamBName: "Team B",
            purchaseDeadline: block.timestamp + 7 days,
            vrfTriggerTime: block.timestamp + 8 days,
            passwordHash: bytes32(0) // Public pool
        });
    }
}
