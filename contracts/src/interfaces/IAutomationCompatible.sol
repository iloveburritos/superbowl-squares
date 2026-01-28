// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AutomationCompatibleInterface
/// @notice Interface for Chainlink Automation compatible contracts
interface AutomationCompatibleInterface {
    /// @notice Check if upkeep is needed
    /// @param checkData Arbitrary data passed to checkUpkeep
    /// @return upkeepNeeded True if upkeep is needed
    /// @return performData Data to pass to performUpkeep
    function checkUpkeep(
        bytes calldata checkData
    ) external view returns (bool upkeepNeeded, bytes memory performData);

    /// @notice Perform the upkeep
    /// @param performData Data returned from checkUpkeep
    function performUpkeep(bytes calldata performData) external;
}
