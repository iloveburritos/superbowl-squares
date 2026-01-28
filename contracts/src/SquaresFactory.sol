// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SquaresPool} from "./SquaresPool.sol";
import {ISquaresPool} from "./interfaces/ISquaresPool.sol";
import {IVRFCoordinatorV2Plus} from "./interfaces/IVRFCoordinatorV2Plus.sol";
import {IAutomationRegistrar} from "./interfaces/IAutomationRegistrar.sol";

/// @title SquaresFactory
/// @notice Factory for deploying Super Bowl Squares pools with Chainlink VRF + Automation
contract SquaresFactory {
    // ============ Events ============
    event PoolCreated(
        address indexed pool,
        address indexed creator,
        string name,
        uint256 squarePrice,
        address paymentToken,
        uint256 upkeepId
    );
    event CreationFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    // ============ State ============
    address[] public allPools;
    mapping(address => address[]) public poolsByCreator;
    mapping(address => uint256) public poolUpkeepIds; // pool => Automation upkeep ID

    // External contract addresses (immutable per chain)
    address public immutable functionsRouter;
    address public immutable vrfCoordinator;
    address public immutable automationRegistrar;

    // Default Chainlink Functions configuration
    uint64 public defaultFunctionsSubscriptionId;
    bytes32 public defaultFunctionsDonId;
    string public defaultFunctionsSource;

    // Default Chainlink VRF configuration
    uint256 public defaultVRFSubscriptionId;
    bytes32 public defaultVRFKeyHash;

    // Pool creation fee (covers VRF + Automation costs)
    uint256 public creationFee;

    // Automation registration parameters
    uint32 public automationGasLimit;
    uint96 public automationFundingAmount;

    // Admin
    address public admin;

    // ============ Errors ============
    error OnlyAdmin();
    error InsufficientCreationFee(uint256 sent, uint256 required);
    error TransferFailed();
    error InvalidAddress();

    // ============ Modifiers ============
    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    // ============ Constructor ============
    constructor(
        address _functionsRouter,
        address _vrfCoordinator,
        address _automationRegistrar,
        uint64 _functionsSubscriptionId,
        bytes32 _functionsDonId,
        uint256 _vrfSubscriptionId,
        bytes32 _vrfKeyHash,
        uint256 _creationFee
    ) {
        if (_functionsRouter == address(0)) revert InvalidAddress();
        if (_vrfCoordinator == address(0)) revert InvalidAddress();
        if (_automationRegistrar == address(0)) revert InvalidAddress();

        functionsRouter = _functionsRouter;
        vrfCoordinator = _vrfCoordinator;
        automationRegistrar = _automationRegistrar;
        defaultFunctionsSubscriptionId = _functionsSubscriptionId;
        defaultFunctionsDonId = _functionsDonId;
        defaultVRFSubscriptionId = _vrfSubscriptionId;
        defaultVRFKeyHash = _vrfKeyHash;
        creationFee = _creationFee;
        admin = msg.sender;

        // Default automation parameters
        automationGasLimit = 200000;
        automationFundingAmount = 0.1 ether; // Amount to fund upkeep
    }

    // ============ Admin Functions ============

    /// @notice Set the default Chainlink Functions JavaScript source
    /// @param source The JavaScript source code for fetching scores
    function setDefaultFunctionsSource(string calldata source) external onlyAdmin {
        defaultFunctionsSource = source;
    }

    /// @notice Update Functions subscription
    function setFunctionsSubscription(uint64 subscriptionId) external onlyAdmin {
        defaultFunctionsSubscriptionId = subscriptionId;
    }

    /// @notice Update Functions DON ID
    function setFunctionsDonId(bytes32 donId) external onlyAdmin {
        defaultFunctionsDonId = donId;
    }

    /// @notice Update VRF subscription
    function setVRFSubscription(uint256 subscriptionId) external onlyAdmin {
        defaultVRFSubscriptionId = subscriptionId;
    }

    /// @notice Update VRF key hash
    function setVRFKeyHash(bytes32 keyHash) external onlyAdmin {
        defaultVRFKeyHash = keyHash;
    }

    /// @notice Update creation fee
    function setCreationFee(uint256 _creationFee) external onlyAdmin {
        emit CreationFeeUpdated(creationFee, _creationFee);
        creationFee = _creationFee;
    }

    /// @notice Update automation parameters
    function setAutomationParams(uint32 _gasLimit, uint96 _fundingAmount) external onlyAdmin {
        automationGasLimit = _gasLimit;
        automationFundingAmount = _fundingAmount;
    }

    /// @notice Withdraw accumulated fees
    function withdrawFees(address to) external onlyAdmin {
        if (to == address(0)) revert InvalidAddress();
        uint256 balance = address(this).balance;
        (bool success,) = to.call{value: balance}("");
        if (!success) revert TransferFailed();
        emit FeesWithdrawn(to, balance);
    }

    /// @notice Transfer admin role
    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert InvalidAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    // ============ Factory Functions ============

    /// @notice Create a new Super Bowl Squares pool
    /// @param params Pool configuration parameters
    /// @return pool Address of the newly created pool contract
    function createPool(ISquaresPool.PoolParams calldata params) external payable returns (address pool) {
        // Check creation fee
        if (msg.value < creationFee) {
            revert InsufficientCreationFee(msg.value, creationFee);
        }

        // Deploy new pool contract
        SquaresPool newPool = new SquaresPool(
            functionsRouter,
            vrfCoordinator,
            msg.sender // operator
        );

        // Initialize with parameters
        newPool.initialize(params);

        // Set Chainlink Functions config
        newPool.setFunctionsConfig(
            defaultFunctionsSubscriptionId,
            defaultFunctionsDonId,
            defaultFunctionsSource
        );

        // Set VRF config
        newPool.setVRFConfig(
            defaultVRFSubscriptionId,
            defaultVRFKeyHash
        );

        pool = address(newPool);

        // NOTE: Pool must be manually added as VRF consumer by subscription owner
        // via Chainlink VRF UI at https://vrf.chain.link/

        // Register pool with Chainlink Automation (skip if no funding set)
        uint256 upkeepId = 0;
        if (automationFundingAmount > 0) {
            upkeepId = _registerAutomation(pool, params.name);
            poolUpkeepIds[pool] = upkeepId;
        }

        // Track pool
        allPools.push(pool);
        poolsByCreator[msg.sender].push(pool);

        emit PoolCreated(pool, msg.sender, params.name, params.squarePrice, params.paymentToken, upkeepId);

        // Refund excess payment
        if (msg.value > creationFee) {
            (bool success,) = msg.sender.call{value: msg.value - creationFee}("");
            if (!success) revert TransferFailed();
        }

        return pool;
    }

    /// @notice Register a pool with Chainlink Automation
    /// @param pool The pool address to register
    /// @param poolName The pool name for the upkeep
    /// @return upkeepId The registered upkeep ID
    function _registerAutomation(address pool, string memory poolName) internal returns (uint256 upkeepId) {
        IAutomationRegistrar.RegistrationParams memory registrationParams = IAutomationRegistrar.RegistrationParams({
            name: string(abi.encodePacked("Squares Pool: ", poolName)),
            encryptedEmail: "",
            upkeepContract: pool,
            gasLimit: automationGasLimit,
            adminAddress: admin, // Factory admin manages upkeeps
            triggerType: 0, // Conditional trigger
            checkData: "",
            triggerConfig: "",
            offchainConfig: "",
            amount: automationFundingAmount
        });

        // Register and fund the upkeep with native ETH
        upkeepId = IAutomationRegistrar(automationRegistrar).registerUpkeep{value: automationFundingAmount}(
            registrationParams
        );

        return upkeepId;
    }

    // ============ View Functions ============

    /// @notice Get all pools created by a specific address
    function getPoolsByCreator(address creator) external view returns (address[] memory) {
        return poolsByCreator[creator];
    }

    /// @notice Get all pools with pagination
    function getAllPools(uint256 offset, uint256 limit) external view returns (address[] memory pools, uint256 total) {
        total = allPools.length;

        if (offset >= total) {
            return (new address[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        pools = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            pools[i - offset] = allPools[i];
        }

        return (pools, total);
    }

    /// @notice Get the total number of pools
    function getPoolCount() external view returns (uint256) {
        return allPools.length;
    }

    /// @notice Get pool count for a specific creator
    function getPoolCountByCreator(address creator) external view returns (uint256) {
        return poolsByCreator[creator].length;
    }

    /// @notice Get the upkeep ID for a pool
    function getPoolUpkeepId(address pool) external view returns (uint256) {
        return poolUpkeepIds[pool];
    }

    // ============ Receive ETH ============
    receive() external payable {}
}
