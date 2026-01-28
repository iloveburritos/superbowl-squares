// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAutomationRegistrar} from "../../src/interfaces/IAutomationRegistrar.sol";

/// @title MockAutomationRegistrar
/// @notice Mock Automation Registrar for testing
contract MockAutomationRegistrar is IAutomationRegistrar {
    uint256 private _upkeepCounter;
    mapping(uint256 => UpkeepInfo) public upkeeps;

    struct UpkeepInfo {
        string name;
        address upkeepContract;
        uint32 gasLimit;
        address adminAddress;
        uint8 triggerType;
        uint96 balance;
        bool exists;
    }

    event UpkeepRegistered(
        uint256 indexed upkeepId,
        address indexed upkeepContract,
        string name,
        uint32 gasLimit,
        address adminAddress,
        uint96 amount
    );

    /// @notice Register a new upkeep
    function registerUpkeep(
        RegistrationParams calldata requestParams
    ) external payable override returns (uint256 upkeepID) {
        upkeepID = ++_upkeepCounter;

        upkeeps[upkeepID] = UpkeepInfo({
            name: requestParams.name,
            upkeepContract: requestParams.upkeepContract,
            gasLimit: requestParams.gasLimit,
            adminAddress: requestParams.adminAddress,
            triggerType: requestParams.triggerType,
            balance: requestParams.amount,
            exists: true
        });

        emit UpkeepRegistered(
            upkeepID,
            requestParams.upkeepContract,
            requestParams.name,
            requestParams.gasLimit,
            requestParams.adminAddress,
            requestParams.amount
        );

        return upkeepID;
    }

    /// @notice Get the minimum registration amount
    function getMinimumRegistrationAmount() external pure override returns (uint96) {
        return 0.1 ether;
    }

    /// @notice Get upkeep info (for testing)
    function getUpkeepInfo(uint256 upkeepId) external view returns (UpkeepInfo memory) {
        return upkeeps[upkeepId];
    }

    /// @notice Check if upkeep exists (for testing)
    function upkeepExists(uint256 upkeepId) external view returns (bool) {
        return upkeeps[upkeepId].exists;
    }

    /// @notice Simulate performing upkeep (for testing)
    /// @param upkeepId The upkeep ID
    function performUpkeep(uint256 upkeepId) external {
        require(upkeeps[upkeepId].exists, "Upkeep not found");

        address target = upkeeps[upkeepId].upkeepContract;

        // Check if upkeep is needed
        (bool checkSuccess, bytes memory checkData) = target.call(
            abi.encodeWithSignature("checkUpkeep(bytes)", "")
        );
        require(checkSuccess, "checkUpkeep failed");

        (bool upkeepNeeded, bytes memory performData) = abi.decode(checkData, (bool, bytes));
        require(upkeepNeeded, "Upkeep not needed");

        // Perform the upkeep
        (bool performSuccess,) = target.call(
            abi.encodeWithSignature("performUpkeep(bytes)", performData)
        );
        require(performSuccess, "performUpkeep failed");
    }

    /// @notice Add funds to an upkeep
    function addFunds(uint256 upkeepId) external payable {
        require(upkeeps[upkeepId].exists, "Upkeep not found");
        upkeeps[upkeepId].balance += uint96(msg.value);
    }

    receive() external payable {}
}
