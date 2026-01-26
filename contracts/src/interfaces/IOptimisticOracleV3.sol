// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface for UMA Optimistic Oracle V3
interface IOptimisticOracleV3 {
    struct Assertion {
        address asserter;
        bool settled;
        bool settlementResolution;
        uint64 assertionTime;
        uint64 expirationTime;
        address currency;
        uint256 bond;
        bytes32 identifier;
        bytes32 domainId;
    }

    /// @notice Asserts a truth about the world
    /// @param claim The truth claim being asserted
    /// @param asserter The account making the assertion
    /// @param callbackRecipient Contract to call on settlement (address(0) for no callback)
    /// @param sovereignSecurity Address for sovereign security (address(0) for default)
    /// @param liveness Time in seconds for the assertion to be disputed
    /// @param currency ERC20 token for bond
    /// @param bond Amount of bond required
    /// @param identifier Identifier for the assertion type
    /// @param domainId Domain identifier
    /// @return assertionId Unique ID for this assertion
    function assertTruth(
        bytes calldata claim,
        address asserter,
        address callbackRecipient,
        address sovereignSecurity,
        uint64 liveness,
        address currency,
        uint256 bond,
        bytes32 identifier,
        bytes32 domainId
    ) external returns (bytes32 assertionId);

    /// @notice Settles an assertion after the liveness period
    function settleAssertion(bytes32 assertionId) external;

    /// @notice Gets assertion details
    function getAssertion(bytes32 assertionId) external view returns (Assertion memory);

    /// @notice Gets the minimum bond for a currency
    function getMinimumBond(address currency) external view returns (uint256);

    /// @notice Default identifier for assertions
    function defaultIdentifier() external view returns (bytes32);
}

/// @notice Callback interface for assertion settlement
interface OptimisticOracleV3CallbackRecipient {
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;
    function assertionDisputedCallback(bytes32 assertionId) external;
}
