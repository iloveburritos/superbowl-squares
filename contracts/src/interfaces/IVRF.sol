// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface for Chainlink VRF Coordinator V2.5
interface IVRFCoordinatorV2Plus {
    struct RandomWordsRequest {
        bytes32 keyHash;
        uint256 subId;
        uint16 requestConfirmations;
        uint32 callbackGasLimit;
        uint32 numWords;
        bytes extraArgs;
    }

    function requestRandomWords(RandomWordsRequest calldata req) external returns (uint256 requestId);
}

/// @notice Interface for VRF Consumer contracts to inherit
abstract contract VRFConsumerBaseV2Plus {
    error OnlyCoordinatorCanFulfill(address have, address want);

    IVRFCoordinatorV2Plus public immutable i_vrfCoordinator;

    constructor(address _vrfCoordinator) {
        i_vrfCoordinator = IVRFCoordinatorV2Plus(_vrfCoordinator);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal virtual;

    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        if (msg.sender != address(i_vrfCoordinator)) {
            revert OnlyCoordinatorCanFulfill(msg.sender, address(i_vrfCoordinator));
        }
        fulfillRandomWords(requestId, randomWords);
    }
}
