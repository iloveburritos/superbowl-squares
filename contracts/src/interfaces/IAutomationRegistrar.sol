// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAutomationRegistrar
/// @notice Interface for Chainlink Automation Registrar 2.1
/// @dev Used for programmatic upkeep registration with native token funding
interface IAutomationRegistrar {
    /// @notice Registration parameters for creating an upkeep
    struct RegistrationParams {
        string name;
        bytes encryptedEmail;
        address upkeepContract;
        uint32 gasLimit;
        address adminAddress;
        uint8 triggerType;
        bytes checkData;
        bytes triggerConfig;
        bytes offchainConfig;
        uint96 amount;
    }

    /// @notice Register a new upkeep
    /// @param requestParams The registration parameters
    /// @return upkeepID The ID of the registered upkeep
    function registerUpkeep(
        RegistrationParams calldata requestParams
    ) external payable returns (uint256 upkeepID);

    /// @notice Get the minimum registration amount
    /// @return The minimum amount required for registration
    function getMinimumRegistrationAmount() external view returns (uint96);
}

/// @title IAutomationRegistry
/// @notice Interface for the Automation Registry to manage upkeeps
interface IAutomationRegistry {
    /// @notice Add funds to an upkeep
    /// @param id The upkeep ID
    function addFunds(uint256 id) external payable;

    /// @notice Get upkeep info
    /// @param id The upkeep ID
    function getUpkeep(uint256 id) external view returns (
        address target,
        uint32 performGas,
        bytes memory checkData,
        uint96 balance,
        address admin,
        uint64 maxValidBlocknumber,
        uint32 lastPerformedBlockNumber,
        uint96 amountSpent,
        bool paused,
        bytes memory offchainConfig
    );

    /// @notice Cancel an upkeep
    /// @param id The upkeep ID
    function cancelUpkeep(uint256 id) external;

    /// @notice Pause an upkeep
    /// @param id The upkeep ID
    function pauseUpkeep(uint256 id) external;

    /// @notice Unpause an upkeep
    /// @param id The upkeep ID
    function unpauseUpkeep(uint256 id) external;
}
