// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";

/// @title Deploy
/// @notice Deployment script for Super Bowl Squares contracts
contract Deploy is Script {
    // Chain-specific addresses
    struct ChainConfig {
        address vrfCoordinator;
        address umaOracle;
        address umaBondToken; // Usually USDC or WETH
    }

    function run() external {
        uint256 chainId = block.chainid;
        ChainConfig memory config = getConfig(chainId);

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        SquaresFactory factory = new SquaresFactory(
            config.vrfCoordinator,
            config.umaOracle,
            config.umaBondToken
        );

        console.log("SquaresFactory deployed at:", address(factory));
        console.log("Chain ID:", chainId);

        vm.stopBroadcast();
    }

    function getConfig(uint256 chainId) internal pure returns (ChainConfig memory) {
        // Ethereum Mainnet
        if (chainId == 1) {
            return ChainConfig({
                vrfCoordinator: 0x271682DEB8C4E0901D1a1550aD2e64D568E69909,
                umaOracle: 0xfb55F43fB9F48F63f9269DB7Dde3BbBe1ebDC0dE,
                umaBondToken: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 // USDC
            });
        }

        // Ethereum Sepolia
        if (chainId == 11155111) {
            return ChainConfig({
                vrfCoordinator: 0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625,
                umaOracle: 0x9923D42eF695B5dd9911D05Ac944d4cAca3c4EAB, // Sepolia UMA
                umaBondToken: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 // Sepolia USDC
            });
        }

        // Base Mainnet
        if (chainId == 8453) {
            return ChainConfig({
                vrfCoordinator: 0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634,
                umaOracle: 0xfb55F43fB9F48F63f9269DB7Dde3BbBe1ebDC0dE,
                umaBondToken: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 // Base USDC
            });
        }

        // Base Sepolia
        if (chainId == 84532) {
            return ChainConfig({
                vrfCoordinator: 0xD7f86b4b8Cae7D942340FF628F82735b7a20893a,
                umaOracle: 0x9923D42eF695B5dd9911D05Ac944d4cAca3c4EAB,
                umaBondToken: 0x036CbD53842c5426634e7929541eC2318f3dCF7e // Base Sepolia USDC
            });
        }

        // Arbitrum One
        if (chainId == 42161) {
            return ChainConfig({
                vrfCoordinator: 0x41034678D6C633D8a95c75e1138A360a28bA15d1,
                umaOracle: 0xa6147867264374F324524E30C02C331cF28aa879,
                umaBondToken: 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 // Arbitrum USDC
            });
        }

        // Arbitrum Sepolia
        if (chainId == 421614) {
            return ChainConfig({
                vrfCoordinator: 0x5CE8D5A2BC84beb22a398CCA51996F7930313D61,
                umaOracle: 0x9923D42eF695B5dd9911D05Ac944d4cAca3c4EAB,
                umaBondToken: 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d // Arbitrum Sepolia USDC
            });
        }

        // Local / Anvil
        if (chainId == 31337) {
            return ChainConfig({
                vrfCoordinator: address(0x1), // Mock
                umaOracle: address(0x2), // Mock
                umaBondToken: address(0x3) // Mock
            });
        }

        revert("Unsupported chain");
    }
}
