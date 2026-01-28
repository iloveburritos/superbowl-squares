// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";

/// @title Deploy
/// @notice Deployment script for Super Bowl Squares contracts with Chainlink VRF + Automation
contract Deploy is Script {
    // Chain-specific Chainlink configuration
    struct ChainConfig {
        address functionsRouter;
        address vrfCoordinator;
        address automationRegistrar;
        uint64 functionsSubscriptionId;
        bytes32 functionsDonId;
        uint256 vrfSubscriptionId;
        bytes32 vrfKeyHash;
        uint256 creationFee;
    }

    function run() external {
        uint256 chainId = block.chainid;
        ChainConfig memory config = getConfig(chainId);

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        SquaresFactory factory = new SquaresFactory(
            config.functionsRouter,
            config.vrfCoordinator,
            config.automationRegistrar,
            config.functionsSubscriptionId,
            config.functionsDonId,
            config.vrfSubscriptionId,
            config.vrfKeyHash,
            config.creationFee
        );

        console.log("SquaresFactory deployed at:", address(factory));
        console.log("Chain ID:", chainId);
        console.log("Functions Router:", config.functionsRouter);
        console.log("VRF Coordinator:", config.vrfCoordinator);
        console.log("Automation Registrar:", config.automationRegistrar);
        console.log("VRF Subscription ID:", config.vrfSubscriptionId);

        vm.stopBroadcast();
    }

    function getConfig(uint256 chainId) internal pure returns (ChainConfig memory) {
        // Ethereum Sepolia
        if (chainId == 11155111) {
            return ChainConfig({
                functionsRouter: 0xb83E47C2bC239B3bf370bc41e1459A34b41238D0,
                vrfCoordinator: 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B,
                automationRegistrar: 0xb0E49c5D0d05cbc241d68c05BC5BA1d1B7B72976,
                functionsSubscriptionId: 0, // Set after deployment if needed
                functionsDonId: 0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000, // fun-ethereum-sepolia-1
                vrfSubscriptionId: 7304601871617629879982805552674872212807903032315921115837606413494623300471,
                vrfKeyHash: 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae, // 500 gwei gas lane
                creationFee: 0 // No fee for now
            });
        }

        // Ethereum Mainnet
        if (chainId == 1) {
            return ChainConfig({
                functionsRouter: 0x65Dcc24F8ff9e51F10DCc7Ed1e4e2A61e6E14bd6,
                vrfCoordinator: 0xD7f86b4b8Cae7D942340FF628F82735b7a20893a,
                automationRegistrar: 0x6B0B234fB2f380309D47A7E9391E29E9a179395a,
                functionsSubscriptionId: 0,
                functionsDonId: 0x66756e2d657468657265756d2d6d61696e6e65742d3100000000000000000000, // fun-ethereum-mainnet-1
                vrfSubscriptionId: 0, // Set before mainnet deployment
                vrfKeyHash: 0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9, // 500 gwei
                creationFee: 0
            });
        }

        // Base Mainnet
        if (chainId == 8453) {
            return ChainConfig({
                functionsRouter: 0xf9B8fc078197181C841c296C876945aaa425B278,
                vrfCoordinator: 0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634,
                automationRegistrar: 0xE226D5aCae908252CcA3F6CEFa577527650a9e1e,
                functionsSubscriptionId: 0,
                functionsDonId: 0x66756e2d626173652d6d61696e6e65742d310000000000000000000000000000, // fun-base-mainnet-1
                vrfSubscriptionId: 0,
                vrfKeyHash: 0x00b81bab01011043e7c98e1a4e82f227b719fcbb9e61fa2db0892ed435ccbb7d,
                creationFee: 0
            });
        }

        // Base Sepolia
        if (chainId == 84532) {
            return ChainConfig({
                functionsRouter: 0xf9B8fc078197181C841c296C876945aaa425B278,
                vrfCoordinator: 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE,
                automationRegistrar: 0x0000000000000000000000000000000000000001, // Placeholder
                functionsSubscriptionId: 0,
                functionsDonId: 0x66756e2d626173652d7365706f6c69612d310000000000000000000000000000, // fun-base-sepolia-1
                vrfSubscriptionId: 0,
                vrfKeyHash: 0x9e9e46732b32662b9adc6f3abdf6c5e926a666d174a4d6b8e39c4cca76a38897,
                creationFee: 0
            });
        }

        // Arbitrum One
        if (chainId == 42161) {
            return ChainConfig({
                functionsRouter: 0x97083E831F8F0638855e2A515c90EdCF158DF238,
                vrfCoordinator: 0x3C0Ca683b403E37668AE3DC4FB62F4B29B6f7a3e,
                automationRegistrar: 0x0000000000000000000000000000000000000001, // Placeholder
                functionsSubscriptionId: 0,
                functionsDonId: 0x66756e2d617262697472756d2d6d61696e6e65742d3100000000000000000000, // fun-arbitrum-mainnet-1
                vrfSubscriptionId: 0,
                vrfKeyHash: 0x1770bdc7eec7771f7ba4ffd640f34260d7f095b79c92d34a5b2551d6f6cfd2be,
                creationFee: 0
            });
        }

        // Arbitrum Sepolia
        if (chainId == 421614) {
            return ChainConfig({
                functionsRouter: 0x234a5fb5Bd614a7AA2FfAB244D603abFA0Ac5C5C,
                vrfCoordinator: 0x5CE8D5A2BC84beb22a398CCA51996F7930313D61,
                automationRegistrar: 0x0000000000000000000000000000000000000001, // Placeholder
                functionsSubscriptionId: 0,
                functionsDonId: 0x66756e2d617262697472756d2d7365706f6c69612d3100000000000000000000, // fun-arbitrum-sepolia-1
                vrfSubscriptionId: 0,
                vrfKeyHash: 0x1770bdc7eec7771f7ba4ffd640f34260d7f095b79c92d34a5b2551d6f6cfd2be,
                creationFee: 0
            });
        }

        // Local / Anvil
        if (chainId == 31337) {
            return ChainConfig({
                functionsRouter: address(0x1),
                vrfCoordinator: address(0x2),
                automationRegistrar: address(0x3),
                functionsSubscriptionId: 1,
                functionsDonId: bytes32(0),
                vrfSubscriptionId: 1,
                vrfKeyHash: bytes32(0),
                creationFee: 0
            });
        }

        revert("Unsupported chain");
    }
}
