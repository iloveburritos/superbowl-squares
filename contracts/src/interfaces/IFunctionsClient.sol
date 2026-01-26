// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Chainlink Functions interfaces
/// @notice Interfaces for Chainlink Functions integration

interface IFunctionsRouter {
    function sendRequest(
        uint64 subscriptionId,
        bytes calldata data,
        uint16 dataVersion,
        uint32 callbackGasLimit,
        bytes32 donId
    ) external returns (bytes32 requestId);
}

interface IFunctionsClient {
    function handleOracleFulfillment(bytes32 requestId, bytes memory response, bytes memory err) external;
}

/// @notice Request struct for encoding
struct FunctionsRequest {
    string source;
    bytes encryptedSecretsReference;
    string[] args;
    bytes[] bytesArgs;
}

/// @notice Library for encoding Chainlink Functions requests
library FunctionsRequestLib {
    uint16 internal constant REQUEST_DATA_VERSION = 1;
    uint16 internal constant LOCATION_INLINE = 0;

    function encodeCBOR(FunctionsRequest memory self) internal pure returns (bytes memory) {
        // Simplified CBOR encoding for Functions request
        // In production, use the official @chainlink/functions-toolkit
        bytes memory sourceBytes = bytes(self.source);
        bytes memory argsEncoded = _encodeStringArray(self.args);

        // CBOR map with source and args
        return abi.encodePacked(
            hex"a2", // map(2)
            hex"66", "source", // text(6) "source"
            _encodeString(self.source),
            hex"64", "args", // text(4) "args"
            argsEncoded
        );
    }

    function _encodeString(string memory str) internal pure returns (bytes memory) {
        bytes memory strBytes = bytes(str);
        uint256 len = strBytes.length;

        if (len < 24) {
            return abi.encodePacked(uint8(0x60 + len), strBytes);
        } else if (len < 256) {
            return abi.encodePacked(hex"78", uint8(len), strBytes);
        } else {
            return abi.encodePacked(hex"79", uint16(len), strBytes);
        }
    }

    function _encodeStringArray(string[] memory arr) internal pure returns (bytes memory) {
        uint256 len = arr.length;
        bytes memory result;

        if (len < 24) {
            result = abi.encodePacked(uint8(0x80 + len));
        } else {
            result = abi.encodePacked(hex"98", uint8(len));
        }

        for (uint256 i = 0; i < len; i++) {
            result = abi.encodePacked(result, _encodeString(arr[i]));
        }

        return result;
    }
}
