// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";

/// @title Deploy
/// @notice Deployment script for Super Bowl Squares contracts with Chainlink VRF
contract Deploy is Script {
    // Chain-specific Chainlink configuration
    struct ChainConfig {
        address vrfCoordinator;
        bytes32 vrfKeyHash;
        uint256 creationFee;
    }

    // Score admin address
    address constant SCORE_ADMIN = 0x51E5E6F9933fD28B62d714C3f7febECe775b6b95;

    function run() external {
        uint256 chainId = block.chainid;
        ChainConfig memory config = getConfig(chainId);

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        SquaresFactory factory = new SquaresFactory(
            config.vrfCoordinator,
            config.vrfKeyHash,
            config.creationFee
        );

        // Set VRF funding amount (1 ETH per pool)
        factory.setVRFFundingAmount(1 ether);

        // Set score admin
        factory.setScoreAdmin(SCORE_ADMIN);

        console.log("SquaresFactory deployed at:", address(factory));
        console.log("Chain ID:", chainId);
        console.log("VRF Coordinator:", config.vrfCoordinator);
        console.log("VRF Subscription ID (factory-owned):", factory.defaultVRFSubscriptionId());
        console.log("Score Admin:", SCORE_ADMIN);

        vm.stopBroadcast();
    }

    function getConfig(uint256 chainId) internal pure returns (ChainConfig memory) {
        // Ethereum Sepolia
        if (chainId == 11155111) {
            return ChainConfig({
                vrfCoordinator: 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B,
                vrfKeyHash: 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae, // 500 gwei gas lane
                creationFee: 0 // No fee for now
            });
        }

        // Ethereum Mainnet
        if (chainId == 1) {
            return ChainConfig({
                vrfCoordinator: 0xD7f86b4b8Cae7D942340FF628F82735b7a20893a,
                vrfKeyHash: 0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9, // 500 gwei
                creationFee: 0
            });
        }

        // Base Mainnet
        if (chainId == 8453) {
            return ChainConfig({
                vrfCoordinator: 0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634,
                vrfKeyHash: 0x00b81bab01011043e7c98e1a4e82f227b719fcbb9e61fa2db0892ed435ccbb7d,
                creationFee: 0
            });
        }

        // Base Sepolia
        if (chainId == 84532) {
            return ChainConfig({
                vrfCoordinator: 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE,
                vrfKeyHash: 0x9e9e46732b32662b9adc6f3abdf6c5e926a666d174a4d6b8e39c4cca76a38897,
                creationFee: 0
            });
        }

        // Arbitrum One
        if (chainId == 42161) {
            return ChainConfig({
                vrfCoordinator: 0x3C0Ca683b403E37668AE3DC4FB62F4B29B6f7a3e,
                vrfKeyHash: 0x1770bdc7eec7771f7ba4ffd640f34260d7f095b79c92d34a5b2551d6f6cfd2be,
                creationFee: 0
            });
        }

        // Arbitrum Sepolia
        if (chainId == 421614) {
            return ChainConfig({
                vrfCoordinator: 0x5CE8D5A2BC84beb22a398CCA51996F7930313D61,
                vrfKeyHash: 0x1770bdc7eec7771f7ba4ffd640f34260d7f095b79c92d34a5b2551d6f6cfd2be,
                creationFee: 0
            });
        }

        // Local / Anvil
        if (chainId == 31337) {
            return ChainConfig({
                vrfCoordinator: address(0x2),
                vrfKeyHash: bytes32(0),
                creationFee: 0
            });
        }

        revert("Unsupported chain");
    }
}
