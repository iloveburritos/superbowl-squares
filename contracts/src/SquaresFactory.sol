// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SquaresPool} from "./SquaresPool.sol";
import {ISquaresPool} from "./interfaces/ISquaresPool.sol";
import {IVRFCoordinatorV2Plus} from "./interfaces/IVRFCoordinatorV2Plus.sol";

/// @title SquaresFactory
/// @notice Factory for deploying Super Bowl Squares pools with Chainlink VRF
contract SquaresFactory {
    // ============ Events ============
    event PoolCreated(
        address indexed pool,
        address indexed creator,
        string name,
        uint256 squarePrice,
        address paymentToken
    );
    event VRFTriggeredForAllPools(uint256 poolsTriggered);
    event CreationFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);
    event ScoreAdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event VRFSubscriptionCreated(uint256 indexed subscriptionId);
    event VRFConsumerAdded(uint256 indexed subscriptionId, address indexed consumer);
    event VRFSubscriptionFunded(uint256 indexed subscriptionId, uint256 amount);
    event ScoreSubmittedToAllPools(uint8 indexed quarter, uint8 teamAScore, uint8 teamBScore);
    event PoolCreationPaused(bool paused);
    event AaveAddressesUpdated(address pool, address gateway, address aWETH, address aUSDC);

    // ============ State ============
    address[] public allPools;
    mapping(address => address[]) public poolsByCreator;
    mapping(bytes32 => bool) public poolNameExists;

    // External contract addresses (immutable per chain)
    address public immutable vrfCoordinator;

    // Default Chainlink VRF configuration
    uint256 public defaultVRFSubscriptionId;
    bytes32 public defaultVRFKeyHash;

    // Pool creation fee (covers VRF costs)
    uint256 public creationFee;

    // VRF funding amount (ETH to fund VRF per pool)
    uint96 public vrfFundingAmount;

    // Admin
    address public admin;

    // Score Admin - can submit scores to all pools
    address public scoreAdmin;

    // Pool creation pause state
    bool public poolCreationPaused;

    // Aave V3 configuration
    address public aavePool;
    address public wethGateway;
    address public aWETH;
    address public aUSDC;

    // ============ Errors ============
    error OnlyAdmin();
    error Unauthorized();
    error InsufficientCreationFee(uint256 sent, uint256 required);
    error TransferFailed();
    error InvalidAddress();
    error PoolCreationIsPaused();
    error PoolNameAlreadyExists(string name);

    // ============ Modifiers ============
    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    // ============ Constructor ============
    constructor(
        address _vrfCoordinator,
        bytes32 _vrfKeyHash,
        uint256 _creationFee
    ) {
        if (_vrfCoordinator == address(0)) revert InvalidAddress();

        vrfCoordinator = _vrfCoordinator;
        defaultVRFKeyHash = _vrfKeyHash;
        creationFee = _creationFee;
        admin = msg.sender;
        scoreAdmin = msg.sender; // Initially deployer is score admin

        // Create VRF subscription - factory becomes the owner
        defaultVRFSubscriptionId = IVRFCoordinatorV2Plus(_vrfCoordinator).createSubscription();
        emit VRFSubscriptionCreated(defaultVRFSubscriptionId);
    }

    // ============ Admin Functions ============

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

    /// @notice Update VRF funding amount per pool
    function setVRFFundingAmount(uint96 _amount) external onlyAdmin {
        vrfFundingAmount = _amount;
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

    /// @notice Set the score admin who can submit scores to all pools
    function setScoreAdmin(address _scoreAdmin) external onlyAdmin {
        if (_scoreAdmin == address(0)) revert InvalidAddress();
        emit ScoreAdminUpdated(scoreAdmin, _scoreAdmin);
        scoreAdmin = _scoreAdmin;
    }

    /// @notice Pause or unpause pool creation
    function setPoolCreationPaused(bool _paused) external onlyAdmin {
        poolCreationPaused = _paused;
        emit PoolCreationPaused(_paused);
    }

    /// @notice Set Aave V3 addresses for yield generation
    /// @param _pool Aave Pool contract address
    /// @param _gateway WETH Gateway contract address
    /// @param _aWETH aWETH token address
    /// @param _aUSDC aUSDC token address
    function setAaveAddresses(
        address _pool,
        address _gateway,
        address _aWETH,
        address _aUSDC
    ) external onlyAdmin {
        aavePool = _pool;
        wethGateway = _gateway;
        aWETH = _aWETH;
        aUSDC = _aUSDC;
        emit AaveAddressesUpdated(_pool, _gateway, _aWETH, _aUSDC);
    }

    // ============ Score Admin Functions ============

    /// @notice Submit score to all pools that are ready for this quarter
    /// @param quarter The quarter to submit (0=Q1, 1=Q2, 2=Q3, 3=Final)
    /// @param teamAScore Team A's score
    /// @param teamBScore Team B's score
    function submitScoreToAllPools(
        uint8 quarter,
        uint8 teamAScore,
        uint8 teamBScore
    ) external {
        if (msg.sender != scoreAdmin && msg.sender != admin) revert Unauthorized();

        uint256 poolCount = allPools.length;
        for (uint256 i = 0; i < poolCount; i++) {
            address pool = allPools[i];
            // Only submit to pools that are ready for this quarter
            // Use try/catch to skip pools that aren't ready or have errors
            try SquaresPool(payable(pool)).submitScoreFromFactory(quarter, teamAScore, teamBScore) {
                // Success
            } catch {
                // Skip pools that aren't ready or have errors
            }
        }

        emit ScoreSubmittedToAllPools(quarter, teamAScore, teamBScore);
    }

    /// @notice Trigger VRF for all pools that are ready (OPEN state, past vrfTriggerTime, has sales)
    function triggerVRFForAllPools() external {
        if (msg.sender != scoreAdmin && msg.sender != admin) revert Unauthorized();

        uint256 triggered = 0;
        uint256 poolCount = allPools.length;
        for (uint256 i = 0; i < poolCount; i++) {
            try SquaresPool(payable(allPools[i])).closePoolAndRequestVRFFromFactory() {
                triggered++;
            } catch {
                // Skip pools that aren't ready
            }
        }

        emit VRFTriggeredForAllPools(triggered);
    }

    // ============ Factory Functions ============

    /// @notice Create a new Super Bowl Squares pool
    /// @param params Pool configuration parameters
    /// @return pool Address of the newly created pool contract
    function createPool(ISquaresPool.PoolParams calldata params) external payable returns (address pool) {
        if (poolCreationPaused) revert PoolCreationIsPaused();

        // Check for duplicate pool name
        bytes32 nameHash = keccak256(bytes(params.name));
        if (poolNameExists[nameHash]) revert PoolNameAlreadyExists(params.name);
        poolNameExists[nameHash] = true;

        // Calculate total required (creation fee + VRF funding)
        uint256 totalRequired = creationFee + vrfFundingAmount;
        if (msg.value < totalRequired) {
            revert InsufficientCreationFee(msg.value, totalRequired);
        }

        // Deploy new pool contract
        SquaresPool newPool = new SquaresPool(
            vrfCoordinator,
            msg.sender // operator
        );

        // Initialize with parameters
        newPool.initialize(params);

        // Set VRF config
        newPool.setVRFConfig(
            defaultVRFSubscriptionId,
            defaultVRFKeyHash
        );

        // Set Aave config if configured
        if (aavePool != address(0)) {
            // Determine correct aToken based on payment token
            address poolAToken = params.paymentToken == address(0) ? aWETH : aUSDC;
            newPool.setAaveConfig(aavePool, wethGateway, poolAToken);
        }

        pool = address(newPool);

        // Add pool as VRF consumer (factory is subscription owner, so this works)
        IVRFCoordinatorV2Plus(vrfCoordinator).addConsumer(defaultVRFSubscriptionId, pool);
        emit VRFConsumerAdded(defaultVRFSubscriptionId, pool);

        // Fund the VRF subscription with native ETH
        if (vrfFundingAmount > 0) {
            IVRFCoordinatorV2Plus(vrfCoordinator).fundSubscriptionWithNative{value: vrfFundingAmount}(
                defaultVRFSubscriptionId
            );
            emit VRFSubscriptionFunded(defaultVRFSubscriptionId, vrfFundingAmount);
        }

        // Track pool
        allPools.push(pool);
        poolsByCreator[msg.sender].push(pool);

        emit PoolCreated(pool, msg.sender, params.name, params.squarePrice, params.paymentToken);

        // Refund excess payment
        if (msg.value > totalRequired) {
            (bool success,) = msg.sender.call{value: msg.value - totalRequired}("");
            if (!success) revert TransferFailed();
        }

        return pool;
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

    /// @notice Check if a pool name is already taken
    function isPoolNameTaken(string calldata name) external view returns (bool) {
        return poolNameExists[keccak256(bytes(name))];
    }

    // ============ Receive ETH ============
    receive() external payable {}
}
