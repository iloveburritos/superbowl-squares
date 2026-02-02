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

    // Chain-specific Aave V3 configuration
    struct AaveConfig {
        address pool;
        address wethGateway;
        address aWETH;
        address aUSDC;
        address usdc;
    }

    // Admin address (has full control: pause creation, set fees, withdraw, etc.)
    // This address will be both admin AND scoreAdmin
    address constant ADMIN = 0x51E5E6F9933fD28B62d714C3f7febECe775b6b95;

    function run() external {
        uint256 chainId = block.chainid;
        ChainConfig memory config = getConfig(chainId);
        AaveConfig memory aaveConfig = getAaveConfig(chainId);

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        SquaresFactory factory = new SquaresFactory(
            config.vrfCoordinator,
            config.vrfKeyHash,
            config.creationFee
        );

        // Set VRF funding amount (1 ETH per pool)
        factory.setVRFFundingAmount(1 ether);

        // Set Aave addresses if configured for this chain
        if (aaveConfig.pool != address(0)) {
            factory.setAaveAddresses(
                aaveConfig.pool,
                aaveConfig.wethGateway,
                aaveConfig.aWETH,
                aaveConfig.aUSDC,
                aaveConfig.usdc
            );
            console.log("Aave Pool:", aaveConfig.pool);
            console.log("WETH Gateway:", aaveConfig.wethGateway);
        }

        // Set score admin (same as admin for unified control)
        factory.setScoreAdmin(ADMIN);

        // Transfer admin to ADMIN address (deployer wallet may differ)
        factory.transferAdmin(ADMIN);

        console.log("SquaresFactory deployed at:", address(factory));
        console.log("Chain ID:", chainId);
        console.log("VRF Coordinator:", config.vrfCoordinator);
        console.log("VRF Subscription ID (factory-owned):", factory.defaultVRFSubscriptionId());
        console.log("Admin:", ADMIN);
        console.log("Score Admin:", ADMIN);

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

    function getAaveConfig(uint256 chainId) internal pure returns (AaveConfig memory) {
        // Ethereum Sepolia (ETH only - Circle USDC not compatible with Aave Sepolia)
        if (chainId == 11155111) {
            return AaveConfig({
                pool: 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951,
                wethGateway: 0x387d311e47e80b498169e6fb51d3193167d89F7D,
                aWETH: 0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c,
                aUSDC: address(0),
                usdc: address(0) // Only ETH pools allowed on Sepolia
            });
        }

        // Ethereum Mainnet
        if (chainId == 1) {
            return AaveConfig({
                pool: 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2,
                wethGateway: 0xD322A49006FC828F9B5B37Ab215F99B4E5caB19C,
                aWETH: 0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8,
                aUSDC: 0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c,
                usdc: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
            });
        }

        // Base Mainnet
        if (chainId == 8453) {
            return AaveConfig({
                pool: 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5,
                wethGateway: 0x8be473dcfA93132559b118a2e512E32B9AB2EEE7,
                aWETH: 0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7,
                aUSDC: 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB,
                usdc: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
            });
        }

        // Arbitrum One
        if (chainId == 42161) {
            return AaveConfig({
                pool: 0x794a61358D6845594F94dc1DB02A252b5b4814aD,
                wethGateway: 0xecD4bd3121F9FD604ffaC631bF6d41ec12f1fafb,
                aWETH: 0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8,
                aUSDC: 0x724dc807b04555b71ed48a6896b6F41593b8C637,
                usdc: 0xaf88d065e77c8cC2239327C5EDb3A432268e5831
            });
        }

        // Chains without Aave (testnets, local)
        return AaveConfig({
            pool: address(0),
            wethGateway: address(0),
            aWETH: address(0),
            aUSDC: address(0),
            usdc: address(0)
        });
    }
}
