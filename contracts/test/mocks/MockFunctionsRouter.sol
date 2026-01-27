// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFunctionsRouter, IFunctionsClient} from "../../src/interfaces/IFunctionsClient.sol";

/// @title MockFunctionsRouter
/// @notice Mock Chainlink Functions Router for testing
contract MockFunctionsRouter is IFunctionsRouter {
    uint256 private requestIdCounter;
    mapping(bytes32 => address) public requestIdToConsumer;
    mapping(bytes32 => RequestDetails) public requests;

    struct RequestDetails {
        address consumer;
        uint64 subscriptionId;
        bytes32 donId;
        uint32 callbackGasLimit;
        bytes data;
        bool fulfilled;
    }

    // Test control variables
    bool public shouldFail;
    bytes public nextErrorResponse;
    uint256 public nextResponseValue;

    event RequestSent(bytes32 indexed requestId, address consumer, bytes data);

    function sendRequest(
        uint64 subscriptionId,
        bytes calldata data,
        uint16, /* dataVersion */
        uint32 callbackGasLimit,
        bytes32 donId
    ) external override returns (bytes32 requestId) {
        requestIdCounter++;
        requestId = bytes32(requestIdCounter);

        requestIdToConsumer[requestId] = msg.sender;
        requests[requestId] = RequestDetails({
            consumer: msg.sender,
            subscriptionId: subscriptionId,
            donId: donId,
            callbackGasLimit: callbackGasLimit,
            data: data,
            fulfilled: false
        });

        emit RequestSent(requestId, msg.sender, data);
        return requestId;
    }

    /// @notice Fulfill a request with a successful response
    /// @param requestId The request to fulfill
    /// @param response Encoded response data
    function fulfillRequest(bytes32 requestId, bytes calldata response) external {
        RequestDetails storage request = requests[requestId];
        require(request.consumer != address(0), "Request not found");
        require(!request.fulfilled, "Already fulfilled");

        request.fulfilled = true;

        IFunctionsClient(request.consumer).handleOracleFulfillment(
            requestId,
            response,
            "" // No error
        );
    }

    /// @notice Fulfill a request with an error
    /// @param requestId The request to fulfill
    /// @param err Error message
    function fulfillRequestWithError(bytes32 requestId, bytes calldata err) external {
        RequestDetails storage request = requests[requestId];
        require(request.consumer != address(0), "Request not found");
        require(!request.fulfilled, "Already fulfilled");

        request.fulfilled = true;

        IFunctionsClient(request.consumer).handleOracleFulfillment(
            requestId,
            "", // No response
            err
        );
    }

    /// @notice Simulate automatic fulfillment with preset response
    /// @param requestId The request to fulfill
    function autoFulfill(bytes32 requestId) external {
        RequestDetails storage request = requests[requestId];
        require(request.consumer != address(0), "Request not found");
        require(!request.fulfilled, "Already fulfilled");

        request.fulfilled = true;

        if (shouldFail) {
            IFunctionsClient(request.consumer).handleOracleFulfillment(
                requestId,
                "",
                nextErrorResponse
            );
        } else {
            IFunctionsClient(request.consumer).handleOracleFulfillment(
                requestId,
                abi.encode(nextResponseValue),
                ""
            );
        }
    }

    // ============ Test Helper Functions ============

    /// @notice Set the next response to be a verified score
    /// @param teamAScore Team A's score (0-255)
    /// @param teamBScore Team B's score (0-255)
    /// @param verified Whether the score was verified by multiple sources
    function setNextResponse(uint8 teamAScore, uint8 teamBScore, bool verified) external {
        // Encode: (teamAScore << 16) | (teamBScore << 8) | verified
        uint256 encoded = (uint256(teamAScore) << 16) | (uint256(teamBScore) << 8) | (verified ? 1 : 0);
        nextResponseValue = encoded;
        shouldFail = false;
    }

    /// @notice Set the next request to fail
    /// @param errorMessage Error message to return
    function setNextError(bytes calldata errorMessage) external {
        shouldFail = true;
        nextErrorResponse = errorMessage;
    }

    /// @notice Reset to successful mode
    function resetToSuccess() external {
        shouldFail = false;
        nextErrorResponse = "";
    }

    /// @notice Get current request ID counter
    function getCurrentRequestId() external view returns (uint256) {
        return requestIdCounter;
    }

    /// @notice Check if a request was fulfilled
    function isRequestFulfilled(bytes32 requestId) external view returns (bool) {
        return requests[requestId].fulfilled;
    }

    /// @notice Get request details for inspection
    function getRequestDetails(bytes32 requestId) external view returns (RequestDetails memory) {
        return requests[requestId];
    }
}
