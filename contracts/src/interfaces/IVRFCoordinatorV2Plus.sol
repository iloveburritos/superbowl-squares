// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VRFV2PlusClient
/// @notice Library for VRF V2.5 request encoding
library VRFV2PlusClient {
    // extraArgs bytes prefix for V1
    bytes4 public constant EXTRA_ARGS_V1_TAG = bytes4(keccak256("VRF ExtraArgsV1"));

    struct ExtraArgsV1 {
        bool nativePayment;
    }

    struct RandomWordsRequest {
        bytes32 keyHash;
        uint256 subId;
        uint16 requestConfirmations;
        uint32 callbackGasLimit;
        uint32 numWords;
        bytes extraArgs;
    }

    function _argsToBytes(ExtraArgsV1 memory extraArgs) internal pure returns (bytes memory bts) {
        return abi.encodeWithSelector(EXTRA_ARGS_V1_TAG, extraArgs);
    }
}

/// @title IVRFCoordinatorV2Plus
/// @notice Interface for VRF Coordinator V2.5
interface IVRFCoordinatorV2Plus {
    /// @notice Request random words
    /// @param req The request parameters
    /// @return requestId The request ID
    function requestRandomWords(
        VRFV2PlusClient.RandomWordsRequest calldata req
    ) external returns (uint256 requestId);

    /// @notice Add a consumer to a subscription
    /// @param subId The subscription ID
    /// @param consumer The consumer address to add
    function addConsumer(uint256 subId, address consumer) external;

    /// @notice Remove a consumer from a subscription
    /// @param subId The subscription ID
    /// @param consumer The consumer address to remove
    function removeConsumer(uint256 subId, address consumer) external;

    /// @notice Get subscription details
    /// @param subId The subscription ID
    /// @return balance The subscription balance
    /// @return nativeBalance The native token balance
    /// @return reqCount The request count
    /// @return owner The subscription owner
    /// @return consumers The consumer addresses
    function getSubscription(
        uint256 subId
    )
        external
        view
        returns (
            uint96 balance,
            uint96 nativeBalance,
            uint64 reqCount,
            address owner,
            address[] memory consumers
        );

    /// @notice Check if pending request exists for a consumer
    function pendingRequestExists(uint256 subId) external view returns (bool);

    /// @notice Create a new subscription
    /// @return subId The new subscription ID
    function createSubscription() external returns (uint256 subId);

    /// @notice Fund a subscription with native tokens (ETH)
    /// @param subId The subscription ID to fund
    function fundSubscriptionWithNative(uint256 subId) external payable;
}

/// @title VRFConsumerBaseV2Plus
/// @notice Abstract base contract for VRF V2.5 consumers
abstract contract VRFConsumerBaseV2Plus {
    error OnlyCoordinatorCanFulfill(address have, address want);

    IVRFCoordinatorV2Plus public immutable vrfCoordinator;

    constructor(address _vrfCoordinator) {
        vrfCoordinator = IVRFCoordinatorV2Plus(_vrfCoordinator);
    }

    /// @notice Callback function for VRF coordinator to call with random words
    /// @param requestId The request ID
    /// @param randomWords The array of random words
    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        if (msg.sender != address(vrfCoordinator)) {
            revert OnlyCoordinatorCanFulfill(msg.sender, address(vrfCoordinator));
        }
        fulfillRandomWords(requestId, randomWords);
    }

    /// @notice Internal function to be overridden by consumer contracts
    /// @param requestId The request ID
    /// @param randomWords The array of random words
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal virtual;
}
