// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOptimisticOracleV3, OptimisticOracleV3CallbackRecipient} from "../../src/interfaces/IOptimisticOracleV3.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";

/// @title MockUMAOracle
/// @notice Mock UMA Optimistic Oracle V3 for testing
contract MockUMAOracle is IOptimisticOracleV3 {
    bytes32 private constant DEFAULT_IDENTIFIER = keccak256("ASSERT_TRUTH");

    uint256 private assertionIdCounter;
    mapping(bytes32 => Assertion) public assertions;
    mapping(bytes32 => bytes) public assertionClaims;
    mapping(bytes32 => address) public assertionCallbacks;

    uint256 public minimumBond = 100e6; // 100 USDC default

    function assertTruth(
        bytes calldata claim,
        address asserter,
        address callbackRecipient,
        address, // sovereignSecurity
        uint64 liveness,
        address currency,
        uint256 bond,
        bytes32 identifier,
        bytes32 domainId
    ) external override returns (bytes32 assertionId) {
        assertionIdCounter++;
        assertionId = bytes32(assertionIdCounter);

        // Transfer bond from asserter
        IERC20(currency).transferFrom(msg.sender, address(this), bond);

        assertions[assertionId] = Assertion({
            asserter: asserter,
            settled: false,
            settlementResolution: false,
            assertionTime: uint64(block.timestamp),
            expirationTime: uint64(block.timestamp + liveness),
            currency: currency,
            bond: bond,
            identifier: identifier,
            domainId: domainId
        });

        assertionClaims[assertionId] = claim;
        assertionCallbacks[assertionId] = callbackRecipient;

        return assertionId;
    }

    function settleAssertion(bytes32 assertionId) external override {
        Assertion storage assertion = assertions[assertionId];
        require(!assertion.settled, "Already settled");
        require(block.timestamp >= assertion.expirationTime, "Liveness period not passed");

        assertion.settled = true;
        assertion.settlementResolution = true; // Default to true (not disputed)

        // Return bond to asserter
        IERC20(assertion.currency).transfer(assertion.asserter, assertion.bond);

        // Call callback if set
        address callback = assertionCallbacks[assertionId];
        if (callback != address(0)) {
            OptimisticOracleV3CallbackRecipient(callback).assertionResolvedCallback(assertionId, true);
        }
    }

    function getAssertion(bytes32 assertionId) external view override returns (Assertion memory) {
        return assertions[assertionId];
    }

    function getMinimumBond(address) external view override returns (uint256) {
        return minimumBond;
    }

    function defaultIdentifier() external pure override returns (bytes32) {
        return DEFAULT_IDENTIFIER;
    }

    // ============ Test Helpers ============

    /// @notice Resolve assertion as disputed (false)
    function disputeAssertion(bytes32 assertionId) external {
        Assertion storage assertion = assertions[assertionId];
        require(!assertion.settled, "Already settled");

        assertion.settled = true;
        assertion.settlementResolution = false;

        // Bond is slashed (kept by oracle in real implementation)
        // For testing, we just mark as disputed

        address callback = assertionCallbacks[assertionId];
        if (callback != address(0)) {
            OptimisticOracleV3CallbackRecipient(callback).assertionDisputedCallback(assertionId);
            OptimisticOracleV3CallbackRecipient(callback).assertionResolvedCallback(assertionId, false);
        }
    }

    /// @notice Fast forward assertion to be settleable
    function setAssertionExpired(bytes32 assertionId) external {
        assertions[assertionId].expirationTime = uint64(block.timestamp);
    }

    /// @notice Set minimum bond for testing
    function setMinimumBond(uint256 _minimumBond) external {
        minimumBond = _minimumBond;
    }
}
