// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SquaresPoolV2} from "../src/SquaresPoolV2.sol";
import {SquaresFactoryV2} from "../src/SquaresFactoryV2.sol";
import {ISquaresPool} from "../src/interfaces/ISquaresPool.sol";
import {MockVRFCoordinator} from "./mocks/MockVRFCoordinator.sol";
import {MockFunctionsRouter} from "./mocks/MockFunctionsRouter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SquaresFactoryV2Test is Test {
    SquaresFactoryV2 public factory;
    MockVRFCoordinator public vrfCoordinator;
    MockFunctionsRouter public functionsRouter;
    MockERC20 public paymentToken;

    address public admin = address(this);
    address public alice = address(0x2);
    address public bob = address(0x3);
    address public attacker = address(0x5);

    uint64 public constant FUNCTIONS_SUBSCRIPTION_ID = 123;
    bytes32 public constant FUNCTIONS_DON_ID = bytes32("DON1");
    string public constant FUNCTIONS_SOURCE = "return 1;";

    function setUp() public {
        // Deploy mocks
        vrfCoordinator = new MockVRFCoordinator();
        functionsRouter = new MockFunctionsRouter();
        paymentToken = new MockERC20("Test Token", "TEST", 18);

        // Deploy factory
        factory = new SquaresFactoryV2(
            address(vrfCoordinator),
            address(functionsRouter),
            FUNCTIONS_SUBSCRIPTION_ID,
            FUNCTIONS_DON_ID
        );

        // Fund accounts
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _createDefaultParams() internal view returns (ISquaresPool.PoolParams memory) {
        return ISquaresPool.PoolParams({
            name: "Super Bowl LX",
            squarePrice: 0.1 ether,
            paymentToken: address(0),
            maxSquaresPerUser: 10,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Patriots",
            teamBName: "Seahawks",
            purchaseDeadline: block.timestamp + 7 days,
            vrfDeadline: block.timestamp + 8 days,
            vrfSubscriptionId: 1,
            vrfKeyHash: bytes32(0),
            umaDisputePeriod: 0,
            umaBondAmount: 0
        });
    }

    // ============ Factory Initialization Tests ============

    function test_FactoryInitialization() public view {
        assertEq(factory.vrfCoordinator(), address(vrfCoordinator));
        assertEq(factory.functionsRouter(), address(functionsRouter));
        assertEq(factory.defaultFunctionsSubscriptionId(), FUNCTIONS_SUBSCRIPTION_ID);
        assertEq(factory.defaultFunctionsDonId(), FUNCTIONS_DON_ID);
        assertEq(factory.admin(), admin);
    }

    // ============ Pool Creation Tests ============

    function test_CreatePool() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();

        vm.prank(alice);
        address poolAddr = factory.createPool(params);

        assertTrue(poolAddr != address(0));

        SquaresPoolV2 pool = SquaresPoolV2(payable(poolAddr));

        // Verify pool initialization
        (
            string memory name,
            ISquaresPool.PoolState state,
            uint256 squarePrice,
            address token,
            ,
            ,
            string memory teamAName,
            string memory teamBName
        ) = pool.getPoolInfo();

        assertEq(name, "Super Bowl LX");
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.OPEN));
        assertEq(squarePrice, 0.1 ether);
        assertEq(token, address(0));
        assertEq(teamAName, "Patriots");
        assertEq(teamBName, "Seahawks");

        // Verify operator
        assertEq(pool.operator(), alice);
    }

    function test_CreatePool_SetsChainlinkFunctionsConfig() public {
        factory.setDefaultFunctionsSource(FUNCTIONS_SOURCE);

        ISquaresPool.PoolParams memory params = _createDefaultParams();

        vm.prank(alice);
        address poolAddr = factory.createPool(params);

        SquaresPoolV2 pool = SquaresPoolV2(payable(poolAddr));

        assertEq(pool.functionsSubscriptionId(), FUNCTIONS_SUBSCRIPTION_ID);
        assertEq(pool.functionsDonId(), FUNCTIONS_DON_ID);
        assertEq(pool.functionsSource(), FUNCTIONS_SOURCE);
    }

    function test_CreatePool_EmitsEvent() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();

        vm.expectEmit(false, true, false, true);
        emit SquaresFactoryV2.PoolCreated(
            address(0), // We don't know the address yet
            alice,
            "Super Bowl LX",
            0.1 ether,
            address(0)
        );

        vm.prank(alice);
        factory.createPool(params);
    }

    function test_CreatePool_TracksPoolInAllPools() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();

        vm.prank(alice);
        address pool1 = factory.createPool(params);

        params.name = "Pool 2";
        vm.prank(bob);
        address pool2 = factory.createPool(params);

        assertEq(factory.getPoolCount(), 2);
        assertEq(factory.allPools(0), pool1);
        assertEq(factory.allPools(1), pool2);
    }

    function test_CreatePool_TracksPoolsByCreator() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();

        vm.prank(alice);
        address pool1 = factory.createPool(params);

        params.name = "Pool 2";
        vm.prank(alice);
        address pool2 = factory.createPool(params);

        params.name = "Pool 3";
        vm.prank(bob);
        address pool3 = factory.createPool(params);

        address[] memory alicePools = factory.getPoolsByCreator(alice);
        assertEq(alicePools.length, 2);
        assertEq(alicePools[0], pool1);
        assertEq(alicePools[1], pool2);

        address[] memory bobPools = factory.getPoolsByCreator(bob);
        assertEq(bobPools.length, 1);
        assertEq(bobPools[0], pool3);
    }

    function test_CreatePool_InvalidPayoutPercentages() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();
        params.payoutPercentages = [uint8(20), uint8(20), uint8(20), uint8(20)]; // Sum = 80, not 100

        vm.prank(alice);
        vm.expectRevert(SquaresPoolV2.InvalidPayoutPercentages.selector);
        factory.createPool(params);
    }

    function test_CreatePool_ZeroPayoutForQuarter() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();
        params.payoutPercentages = [uint8(0), uint8(30), uint8(30), uint8(40)]; // Q1 = 0%

        vm.prank(alice);
        address poolAddr = factory.createPool(params);

        // Should succeed - 0% for a quarter is allowed
        SquaresPoolV2 pool = SquaresPoolV2(payable(poolAddr));
        uint8[4] memory percentages = pool.getPayoutPercentages();
        assertEq(percentages[0], 0);
        assertEq(percentages[1], 30);
        assertEq(percentages[2], 30);
        assertEq(percentages[3], 40);
    }

    // ============ Admin Functions Tests ============

    function test_SetDefaultFunctionsSource() public {
        string memory newSource = "const result = await fetch('api'); return result;";

        factory.setDefaultFunctionsSource(newSource);

        assertEq(factory.defaultFunctionsSource(), newSource);
    }

    function test_SetDefaultFunctionsSource_RevertIfNotAdmin() public {
        vm.prank(alice);
        vm.expectRevert(SquaresFactoryV2.OnlyAdmin.selector);
        factory.setDefaultFunctionsSource("new source");
    }

    function test_SetFunctionsSubscription() public {
        factory.setFunctionsSubscription(456);

        assertEq(factory.defaultFunctionsSubscriptionId(), 456);
    }

    function test_SetFunctionsSubscription_RevertIfNotAdmin() public {
        vm.prank(alice);
        vm.expectRevert(SquaresFactoryV2.OnlyAdmin.selector);
        factory.setFunctionsSubscription(456);
    }

    function test_SetFunctionsDonId() public {
        bytes32 newDonId = bytes32("DON2");
        factory.setFunctionsDonId(newDonId);

        assertEq(factory.defaultFunctionsDonId(), newDonId);
    }

    function test_SetFunctionsDonId_RevertIfNotAdmin() public {
        vm.prank(alice);
        vm.expectRevert(SquaresFactoryV2.OnlyAdmin.selector);
        factory.setFunctionsDonId(bytes32("DON2"));
    }

    function test_TransferAdmin() public {
        factory.transferAdmin(alice);

        assertEq(factory.admin(), alice);

        // Old admin should no longer have access
        vm.expectRevert(SquaresFactoryV2.OnlyAdmin.selector);
        factory.setFunctionsSubscription(789);

        // New admin can call admin functions
        vm.prank(alice);
        factory.setFunctionsSubscription(789);
        assertEq(factory.defaultFunctionsSubscriptionId(), 789);
    }

    function test_TransferAdmin_RevertIfNotAdmin() public {
        vm.prank(alice);
        vm.expectRevert(SquaresFactoryV2.OnlyAdmin.selector);
        factory.transferAdmin(bob);
    }

    // ============ View Functions Tests ============

    function test_GetAllPools_Pagination() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();

        // Create 5 pools
        for (uint256 i = 0; i < 5; i++) {
            params.name = string(abi.encodePacked("Pool ", i));
            vm.prank(alice);
            factory.createPool(params);
        }

        // Test pagination
        (address[] memory pools, uint256 total) = factory.getAllPools(0, 3);
        assertEq(pools.length, 3);
        assertEq(total, 5);

        (pools, total) = factory.getAllPools(3, 3);
        assertEq(pools.length, 2); // Only 2 remaining
        assertEq(total, 5);

        (pools, total) = factory.getAllPools(5, 3);
        assertEq(pools.length, 0); // Beyond range
        assertEq(total, 5);

        (pools, total) = factory.getAllPools(10, 3);
        assertEq(pools.length, 0); // Way beyond range
        assertEq(total, 5);
    }

    function test_GetPoolCount() public {
        assertEq(factory.getPoolCount(), 0);

        ISquaresPool.PoolParams memory params = _createDefaultParams();

        vm.prank(alice);
        factory.createPool(params);
        assertEq(factory.getPoolCount(), 1);

        params.name = "Pool 2";
        vm.prank(bob);
        factory.createPool(params);
        assertEq(factory.getPoolCount(), 2);
    }

    function test_GetPoolCountByCreator() public {
        assertEq(factory.getPoolCountByCreator(alice), 0);
        assertEq(factory.getPoolCountByCreator(bob), 0);

        ISquaresPool.PoolParams memory params = _createDefaultParams();

        vm.prank(alice);
        factory.createPool(params);
        assertEq(factory.getPoolCountByCreator(alice), 1);

        params.name = "Pool 2";
        vm.prank(alice);
        factory.createPool(params);
        assertEq(factory.getPoolCountByCreator(alice), 2);

        params.name = "Pool 3";
        vm.prank(bob);
        factory.createPool(params);
        assertEq(factory.getPoolCountByCreator(alice), 2);
        assertEq(factory.getPoolCountByCreator(bob), 1);
    }

    function test_GetPoolsByCreator_EmptyForNewAddress() public view {
        address[] memory pools = factory.getPoolsByCreator(address(0xdead));
        assertEq(pools.length, 0);
    }

    // ============ Configuration Affects New Pools Tests ============

    function test_ConfigChangeAffectsNewPools() public {
        // Set initial config
        factory.setDefaultFunctionsSource("source v1");

        ISquaresPool.PoolParams memory params = _createDefaultParams();

        vm.prank(alice);
        address pool1Addr = factory.createPool(params);
        SquaresPoolV2 pool1 = SquaresPoolV2(payable(pool1Addr));

        // Update config
        factory.setDefaultFunctionsSource("source v2");
        factory.setFunctionsSubscription(999);
        factory.setFunctionsDonId(bytes32("NEW_DON"));

        // New pool should have new config
        params.name = "Pool 2";
        vm.prank(bob);
        address pool2Addr = factory.createPool(params);
        SquaresPoolV2 pool2 = SquaresPoolV2(payable(pool2Addr));

        // Pool 1 keeps old config
        assertEq(pool1.functionsSource(), "source v1");
        assertEq(pool1.functionsSubscriptionId(), FUNCTIONS_SUBSCRIPTION_ID);
        assertEq(pool1.functionsDonId(), FUNCTIONS_DON_ID);

        // Pool 2 has new config
        assertEq(pool2.functionsSource(), "source v2");
        assertEq(pool2.functionsSubscriptionId(), 999);
        assertEq(pool2.functionsDonId(), bytes32("NEW_DON"));
    }

    // ============ Edge Cases ============

    function test_CreatePool_WithERC20Payment() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();
        params.paymentToken = address(paymentToken);
        params.squarePrice = 100e18;

        vm.prank(alice);
        address poolAddr = factory.createPool(params);

        SquaresPoolV2 pool = SquaresPoolV2(payable(poolAddr));
        (, , , address token, , , ,) = pool.getPoolInfo();
        assertEq(token, address(paymentToken));
    }

    function test_CreatePool_UnlimitedSquaresPerUser() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();
        params.maxSquaresPerUser = 0; // Unlimited

        vm.prank(alice);
        address poolAddr = factory.createPool(params);

        SquaresPoolV2 pool = SquaresPoolV2(payable(poolAddr));
        assertEq(pool.maxSquaresPerUser(), 0);
    }

    function test_CreatePool_LongName() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();
        params.name = "This is a very long pool name that tests the limits of string storage in the smart contract";

        vm.prank(alice);
        address poolAddr = factory.createPool(params);

        SquaresPoolV2 pool = SquaresPoolV2(payable(poolAddr));
        (string memory name, , , , , , ,) = pool.getPoolInfo();
        assertEq(name, params.name);
    }

    function test_CreatePool_EmptyTeamNames() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();
        params.teamAName = "";
        params.teamBName = "";

        vm.prank(alice);
        address poolAddr = factory.createPool(params);

        SquaresPoolV2 pool = SquaresPoolV2(payable(poolAddr));
        (, , , , , , string memory teamA, string memory teamB) = pool.getPoolInfo();
        assertEq(teamA, "");
        assertEq(teamB, "");
    }

    function test_CreatePool_DeadlineInPast() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();
        params.purchaseDeadline = block.timestamp - 1;

        // Note: Factory doesn't validate this - it's handled by pool logic
        vm.prank(alice);
        address poolAddr = factory.createPool(params);

        SquaresPoolV2 pool = SquaresPoolV2(payable(poolAddr));

        // Trying to buy squares should fail
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;

        vm.prank(bob);
        vm.deal(bob, 1 ether);
        vm.expectRevert(SquaresPoolV2.PurchaseDeadlinePassed.selector);
        pool.buySquares{value: 0.1 ether}(positions);
    }

    function test_CreatePool_ZeroSquarePrice() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();
        params.squarePrice = 0;

        vm.prank(alice);
        address poolAddr = factory.createPool(params);

        SquaresPoolV2 pool = SquaresPoolV2(payable(poolAddr));
        (, , uint256 squarePrice, , , , ,) = pool.getPoolInfo();
        assertEq(squarePrice, 0);

        // Buying squares should work with 0 cost
        uint8[] memory positions = new uint8[](1);
        positions[0] = 0;

        vm.prank(bob);
        pool.buySquares(positions);

        address[100] memory grid = pool.getGrid();
        assertEq(grid[0], bob);
    }

    // ============ Stress Tests ============

    function test_CreateManyPools() public {
        ISquaresPool.PoolParams memory params = _createDefaultParams();

        uint256 numPools = 50;
        address[] memory createdPools = new address[](numPools);

        for (uint256 i = 0; i < numPools; i++) {
            params.name = string(abi.encodePacked("Pool ", i));
            vm.prank(alice);
            createdPools[i] = factory.createPool(params);
        }

        assertEq(factory.getPoolCount(), numPools);
        assertEq(factory.getPoolCountByCreator(alice), numPools);

        // Verify pagination works
        (address[] memory page1, ) = factory.getAllPools(0, 20);
        assertEq(page1.length, 20);

        (address[] memory page2, ) = factory.getAllPools(20, 20);
        assertEq(page2.length, 20);

        (address[] memory page3, ) = factory.getAllPools(40, 20);
        assertEq(page3.length, 10);
    }
}
