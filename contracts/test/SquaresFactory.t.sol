// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";
import {SquaresPool} from "../src/SquaresPool.sol";
import {ISquaresPool} from "../src/interfaces/ISquaresPool.sol";
import {MockFunctionsRouter} from "./mocks/MockFunctionsRouter.sol";
import {MockVRFCoordinatorV2Plus} from "./mocks/MockVRFCoordinatorV2Plus.sol";
import {MockAutomationRegistrar} from "./mocks/MockAutomationRegistrar.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SquaresFactoryTest is Test {
    SquaresFactory public factory;
    MockFunctionsRouter public functionsRouter;
    MockVRFCoordinatorV2Plus public vrfCoordinator;
    MockAutomationRegistrar public automationRegistrar;

    address public alice = address(0x1);
    address public bob = address(0x2);

    uint64 constant FUNCTIONS_SUBSCRIPTION_ID = 1;
    bytes32 constant FUNCTIONS_DON_ID = bytes32("fun-ethereum-sepolia-1");
    uint256 constant VRF_SUBSCRIPTION_ID = 1;
    bytes32 constant VRF_KEY_HASH = 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae;
    uint256 constant CREATION_FEE = 0.1 ether; // Must cover automationFundingAmount (default 0.1 ETH)

    function setUp() public {
        functionsRouter = new MockFunctionsRouter();
        vrfCoordinator = new MockVRFCoordinatorV2Plus();
        automationRegistrar = new MockAutomationRegistrar();

        // Fund the test contract
        vm.deal(address(this), 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);

        factory = new SquaresFactory(
            address(functionsRouter),
            address(vrfCoordinator),
            address(automationRegistrar),
            FUNCTIONS_SUBSCRIPTION_ID,
            FUNCTIONS_DON_ID,
            VRF_SUBSCRIPTION_ID,
            VRF_KEY_HASH,
            CREATION_FEE
        );
    }

    function test_CreatePool() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        vm.prank(alice);
        address poolAddr = factory.createPool{value: CREATION_FEE}(params);

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

        assertEq(name, "Test Pool");
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.OPEN));
        assertEq(squarePrice, 0.1 ether);
        assertEq(paymentToken, address(0));
        assertEq(teamAName, "Team A");
        assertEq(teamBName, "Team B");
    }

    function test_CreatePool_RegistersAutomation() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        vm.prank(alice);
        address poolAddr = factory.createPool{value: CREATION_FEE}(params);

        // Check upkeep was registered
        uint256 upkeepId = factory.getPoolUpkeepId(poolAddr);
        assertTrue(upkeepId > 0, "Upkeep should be registered");

        // Check upkeep exists in registrar
        assertTrue(automationRegistrar.upkeepExists(upkeepId), "Upkeep should exist in registrar");
    }

    function test_CreatePool_SetsVRFConfig() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        vm.prank(alice);
        address poolAddr = factory.createPool{value: CREATION_FEE}(params);

        SquaresPool pool = SquaresPool(payable(poolAddr));

        assertEq(pool.vrfSubscriptionId(), VRF_SUBSCRIPTION_ID);
        assertEq(pool.vrfKeyHash(), VRF_KEY_HASH);
    }

    function test_CreatePool_TracksCreator() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        vm.prank(alice);
        address pool1 = factory.createPool{value: CREATION_FEE}(params);

        vm.prank(alice);
        address pool2 = factory.createPool{value: CREATION_FEE}(params);

        vm.prank(bob);
        address pool3 = factory.createPool{value: CREATION_FEE}(params);

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
        vm.expectRevert(abi.encodeWithSelector(SquaresFactory.InsufficientCreationFee.selector, 0, CREATION_FEE));
        factory.createPool(params);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SquaresFactory.InsufficientCreationFee.selector, CREATION_FEE - 1, CREATION_FEE));
        factory.createPool{value: CREATION_FEE - 1}(params);
    }

    function test_CreatePool_RefundsExcess() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        uint256 balanceBefore = alice.balance;
        uint256 excessAmount = 0.01 ether;

        vm.prank(alice);
        factory.createPool{value: CREATION_FEE + excessAmount}(params);

        uint256 balanceAfter = alice.balance;
        assertEq(balanceBefore - balanceAfter, CREATION_FEE, "Should only spend creation fee");
    }

    function test_GetAllPools() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        address[] memory expectedPools = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice);
            expectedPools[i] = factory.createPool{value: CREATION_FEE}(params);
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
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        // Create 10 pools
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(alice);
            factory.createPool{value: CREATION_FEE}(params);
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

        ISquaresPool.PoolParams memory params = _getDefaultParams();

        vm.prank(alice);
        factory.createPool{value: CREATION_FEE}(params);
        assertEq(factory.getPoolCount(), 1);

        vm.prank(bob);
        factory.createPool{value: CREATION_FEE}(params);
        assertEq(factory.getPoolCount(), 2);
    }

    function test_GetPoolCountByCreator() public {
        assertEq(factory.getPoolCountByCreator(alice), 0);

        ISquaresPool.PoolParams memory params = _getDefaultParams();

        vm.prank(alice);
        factory.createPool{value: CREATION_FEE}(params);
        assertEq(factory.getPoolCountByCreator(alice), 1);

        vm.prank(alice);
        factory.createPool{value: CREATION_FEE}(params);
        assertEq(factory.getPoolCountByCreator(alice), 2);

        assertEq(factory.getPoolCountByCreator(bob), 0);
    }

    function test_CreatePool_InvalidPayoutPercentages() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();
        params.payoutPercentages = [uint8(20), uint8(20), uint8(20), uint8(20)]; // Sum = 80, not 100

        vm.prank(alice);
        vm.expectRevert(SquaresPool.InvalidPayoutPercentages.selector);
        factory.createPool{value: CREATION_FEE}(params);
    }

    function test_ImmutableAddresses() public view {
        assertEq(factory.functionsRouter(), address(functionsRouter));
        assertEq(factory.vrfCoordinator(), address(vrfCoordinator));
        assertEq(factory.automationRegistrar(), address(automationRegistrar));
        assertEq(factory.defaultFunctionsSubscriptionId(), FUNCTIONS_SUBSCRIPTION_ID);
        assertEq(factory.defaultFunctionsDonId(), FUNCTIONS_DON_ID);
        assertEq(factory.defaultVRFSubscriptionId(), VRF_SUBSCRIPTION_ID);
        assertEq(factory.defaultVRFKeyHash(), VRF_KEY_HASH);
    }

    function test_AdminFunctions() public {
        // Check initial admin
        assertEq(factory.admin(), address(this));

        // Set Functions source
        string memory source = "return Functions.encodeUint256(42);";
        factory.setDefaultFunctionsSource(source);
        assertEq(factory.defaultFunctionsSource(), source);

        // Update Functions subscription
        factory.setFunctionsSubscription(123);
        assertEq(factory.defaultFunctionsSubscriptionId(), 123);

        // Update Functions DON ID
        bytes32 newDonId = bytes32("new-don-id");
        factory.setFunctionsDonId(newDonId);
        assertEq(factory.defaultFunctionsDonId(), newDonId);

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

        // Transfer admin
        factory.transferAdmin(alice);
        assertEq(factory.admin(), alice);
    }

    function test_WithdrawFees() public {
        ISquaresPool.PoolParams memory params = _getDefaultParams();

        // Lower automation funding so there's leftover from creation fee
        factory.setAutomationParams(200000, 0.05 ether);

        // Create a pool to generate fees
        vm.prank(alice);
        factory.createPool{value: CREATION_FEE}(params);

        // Check factory balance (should have fee minus automation funding)
        // 0.1 ETH - 0.05 ETH = 0.05 ETH remaining
        uint256 factoryBalance = address(factory).balance;
        assertTrue(factoryBalance > 0, "Factory should have balance");
        assertEq(factoryBalance, 0.05 ether, "Factory should have 0.05 ETH");

        // Withdraw fees
        address recipient = address(0x999);
        factory.withdrawFees(recipient);

        assertEq(address(factory).balance, 0, "Factory balance should be 0");
        assertEq(recipient.balance, factoryBalance, "Recipient should receive fees");
    }

    function test_OnlyAdminCanCallAdminFunctions() public {
        vm.prank(alice);
        vm.expectRevert(SquaresFactory.OnlyAdmin.selector);
        factory.setDefaultFunctionsSource("test");

        vm.prank(alice);
        vm.expectRevert(SquaresFactory.OnlyAdmin.selector);
        factory.setFunctionsSubscription(123);

        vm.prank(alice);
        vm.expectRevert(SquaresFactory.OnlyAdmin.selector);
        factory.setFunctionsDonId(bytes32("test"));

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
    }

    function test_CreatePool_SetsChainlinkFunctionsConfig() public {
        // Set a functions source
        string memory source = "return Functions.encodeUint256(42);";
        factory.setDefaultFunctionsSource(source);

        ISquaresPool.PoolParams memory params = _getDefaultParams();

        vm.prank(alice);
        address poolAddr = factory.createPool{value: CREATION_FEE}(params);

        SquaresPool pool = SquaresPool(payable(poolAddr));

        // Check that Chainlink Functions config was set
        assertEq(pool.functionsSubscriptionId(), FUNCTIONS_SUBSCRIPTION_ID);
        assertEq(pool.functionsDonId(), FUNCTIONS_DON_ID);
        assertEq(pool.functionsSource(), source);
    }

    function _getDefaultParams() internal view returns (ISquaresPool.PoolParams memory) {
        return ISquaresPool.PoolParams({
            name: "Test Pool",
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
