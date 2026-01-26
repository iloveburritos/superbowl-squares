// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVRFCoordinatorV2Plus} from "../../src/interfaces/IVRF.sol";

/// @title MockVRFCoordinator
/// @notice Mock VRF Coordinator for testing
contract MockVRFCoordinator is IVRFCoordinatorV2Plus {
    uint256 private requestIdCounter;
    mapping(uint256 => address) public requestIdToConsumer;

    function requestRandomWords(RandomWordsRequest calldata) external override returns (uint256 requestId) {
        requestIdCounter++;
        requestId = requestIdCounter;
        requestIdToConsumer[requestId] = msg.sender;
        return requestId;
    }

    /// @notice Fulfill random words for testing
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        address consumer = requestIdToConsumer[requestId];
        require(consumer != address(0), "Request not found");

        // Call the consumer's callback
        (bool success,) = consumer.call(
            abi.encodeWithSignature("rawFulfillRandomWords(uint256,uint256[])", requestId, randomWords)
        );
        require(success, "Callback failed");
    }

    /// @notice Get current request ID counter
    function getCurrentRequestId() external view returns (uint256) {
        return requestIdCounter;
    }
}
