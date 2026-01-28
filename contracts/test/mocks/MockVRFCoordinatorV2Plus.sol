// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVRFCoordinatorV2Plus, VRFV2PlusClient} from "../../src/interfaces/IVRFCoordinatorV2Plus.sol";

/// @title MockVRFCoordinatorV2Plus
/// @notice Mock VRF Coordinator for testing
contract MockVRFCoordinatorV2Plus is IVRFCoordinatorV2Plus {
    uint256 private _requestCounter;
    mapping(uint256 => address) public requestIdToConsumer;
    mapping(uint256 => address[]) public subscriptionConsumers;
    mapping(uint256 => uint96) public subscriptionBalances;

    // Pending request tracking
    uint256 public lastRequestId;
    bytes32 public lastKeyHash;
    uint256 public lastSubId;
    uint16 public lastRequestConfirmations;
    uint32 public lastCallbackGasLimit;
    uint32 public lastNumWords;

    event RandomWordsRequested(
        uint256 indexed requestId,
        address indexed consumer,
        uint256 subId,
        bytes32 keyHash,
        uint16 requestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords
    );

    event ConsumerAdded(uint256 indexed subId, address indexed consumer);
    event ConsumerRemoved(uint256 indexed subId, address indexed consumer);

    /// @notice Request random words
    function requestRandomWords(
        VRFV2PlusClient.RandomWordsRequest calldata req
    ) external override returns (uint256 requestId) {
        requestId = ++_requestCounter;
        requestIdToConsumer[requestId] = msg.sender;

        lastRequestId = requestId;
        lastKeyHash = req.keyHash;
        lastSubId = req.subId;
        lastRequestConfirmations = req.requestConfirmations;
        lastCallbackGasLimit = req.callbackGasLimit;
        lastNumWords = req.numWords;

        emit RandomWordsRequested(
            requestId,
            msg.sender,
            req.subId,
            req.keyHash,
            req.requestConfirmations,
            req.callbackGasLimit,
            req.numWords
        );

        return requestId;
    }

    /// @notice Fulfill random words (for testing)
    /// @param requestId The request ID to fulfill
    /// @param randomWords The random words to return
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        address consumer = requestIdToConsumer[requestId];
        require(consumer != address(0), "Request not found");

        // Call the consumer's rawFulfillRandomWords
        (bool success,) = consumer.call(
            abi.encodeWithSignature("rawFulfillRandomWords(uint256,uint256[])", requestId, randomWords)
        );
        require(success, "Callback failed");
    }

    /// @notice Fulfill with a single random word (convenience function)
    /// @param requestId The request ID to fulfill
    /// @param randomWord The random word to return
    function fulfillRandomWord(uint256 requestId, uint256 randomWord) external {
        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = randomWord;

        address consumer = requestIdToConsumer[requestId];
        require(consumer != address(0), "Request not found");

        (bool success,) = consumer.call(
            abi.encodeWithSignature("rawFulfillRandomWords(uint256,uint256[])", requestId, randomWords)
        );
        require(success, "Callback failed");
    }

    /// @notice Add a consumer to a subscription
    function addConsumer(uint256 subId, address consumer) external override {
        subscriptionConsumers[subId].push(consumer);
        emit ConsumerAdded(subId, consumer);
    }

    /// @notice Remove a consumer from a subscription
    function removeConsumer(uint256 subId, address consumer) external override {
        address[] storage consumers = subscriptionConsumers[subId];
        for (uint256 i = 0; i < consumers.length; i++) {
            if (consumers[i] == consumer) {
                consumers[i] = consumers[consumers.length - 1];
                consumers.pop();
                emit ConsumerRemoved(subId, consumer);
                return;
            }
        }
    }

    /// @notice Get subscription details
    function getSubscription(
        uint256 subId
    )
        external
        view
        override
        returns (
            uint96 balance,
            uint96 nativeBalance,
            uint64 reqCount,
            address owner,
            address[] memory consumers
        )
    {
        return (
            subscriptionBalances[subId],
            uint96(address(this).balance),
            0,
            address(this),
            subscriptionConsumers[subId]
        );
    }

    /// @notice Check if pending request exists
    function pendingRequestExists(uint256 /* subId */) external pure override returns (bool) {
        return false;
    }

    /// @notice Fund a subscription (for testing)
    function fundSubscription(uint256 subId, uint96 amount) external {
        subscriptionBalances[subId] += amount;
    }

    /// @notice Create a subscription (for testing)
    function createSubscription() external returns (uint256 subId) {
        subId = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender)));
        return subId;
    }

    receive() external payable {}
}
