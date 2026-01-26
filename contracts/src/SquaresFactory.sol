// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SquaresPool} from "./SquaresPool.sol";
import {ISquaresPool} from "./interfaces/ISquaresPool.sol";

/// @title SquaresFactory
/// @notice Factory contract for deploying Super Bowl Squares pools
contract SquaresFactory {
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
    address public immutable umaOracle;
    address public immutable umaBondToken;

    // ============ Constructor ============
    constructor(address _vrfCoordinator, address _umaOracle, address _umaBondToken) {
        vrfCoordinator = _vrfCoordinator;
        umaOracle = _umaOracle;
        umaBondToken = _umaBondToken;
    }

    // ============ Factory Functions ============

    /// @notice Create a new Super Bowl Squares pool
    /// @param params Pool configuration parameters
    /// @return pool Address of the newly created pool contract
    function createPool(ISquaresPool.PoolParams calldata params) external returns (address pool) {
        // Deploy new pool contract
        SquaresPool newPool = new SquaresPool(
            vrfCoordinator,
            umaOracle,
            umaBondToken,
            msg.sender // operator
        );

        // Initialize with parameters
        newPool.initialize(params);

        pool = address(newPool);

        // Track pool
        allPools.push(pool);
        poolsByCreator[msg.sender].push(pool);

        emit PoolCreated(pool, msg.sender, params.name, params.squarePrice, params.paymentToken);

        return pool;
    }

    // ============ View Functions ============

    /// @notice Get all pools created by a specific address
    /// @param creator Address of the pool creator
    /// @return Array of pool addresses
    function getPoolsByCreator(address creator) external view returns (address[] memory) {
        return poolsByCreator[creator];
    }

    /// @notice Get all pools with pagination
    /// @param offset Starting index
    /// @param limit Maximum number of pools to return
    /// @return pools Array of pool addresses
    /// @return total Total number of pools
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
