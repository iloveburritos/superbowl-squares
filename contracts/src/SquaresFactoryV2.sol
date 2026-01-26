// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SquaresPoolV2} from "./SquaresPoolV2.sol";
import {ISquaresPool} from "./interfaces/ISquaresPool.sol";

/// @title SquaresFactoryV2
/// @notice Factory for deploying Super Bowl Squares pools with Chainlink Functions score verification
contract SquaresFactoryV2 {
    // ============ Events ============
    event PoolCreated(
        address indexed pool,
        address indexed creator,
        string name,
        uint256 squarePrice,
        address paymentToken
    );

    // ============ State ============
    address[] public allPools;
    mapping(address => address[]) public poolsByCreator;

    // External contract addresses (immutable per chain)
    address public immutable vrfCoordinator;
    address public immutable functionsRouter;

    // Default Chainlink Functions configuration
    uint64 public defaultFunctionsSubscriptionId;
    bytes32 public defaultFunctionsDonId;
    string public defaultFunctionsSource;

    // Admin
    address public admin;

    // ============ Errors ============
    error OnlyAdmin();

    // ============ Modifiers ============
    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    // ============ Constructor ============
    constructor(
        address _vrfCoordinator,
        address _functionsRouter,
        uint64 _functionsSubscriptionId,
        bytes32 _functionsDonId
    ) {
        vrfCoordinator = _vrfCoordinator;
        functionsRouter = _functionsRouter;
        defaultFunctionsSubscriptionId = _functionsSubscriptionId;
        defaultFunctionsDonId = _functionsDonId;
        admin = msg.sender;
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

    /// @notice Transfer admin role
    function transferAdmin(address newAdmin) external onlyAdmin {
        admin = newAdmin;
    }

    // ============ Factory Functions ============

    /// @notice Create a new Super Bowl Squares pool
    /// @param params Pool configuration parameters
    /// @return pool Address of the newly created pool contract
    function createPool(ISquaresPool.PoolParams calldata params) external returns (address pool) {
        // Deploy new pool contract
        SquaresPoolV2 newPool = new SquaresPoolV2(
            vrfCoordinator,
            functionsRouter,
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

        pool = address(newPool);

        // Track pool
        allPools.push(pool);
        poolsByCreator[msg.sender].push(pool);

        emit PoolCreated(pool, msg.sender, params.name, params.squarePrice, params.paymentToken);

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
}
