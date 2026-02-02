// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";

/// @title DeployBase
/// @notice Deployment script for Base Mainnet WITH full Aave V3 integration
/// @dev Pool funds are deposited to Aave to earn yield, which goes to admin after game ends
contract DeployBase is Script {
    // Admin address (has full control: pause creation, set fees, withdraw, etc.)
    address constant ADMIN = 0xc4364F3a17bb60F3A56aDbe738414eeEB523C6B2;

    // Base Chainlink VRF V2.5 configuration
    address constant VRF_COORDINATOR = 0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634;
    bytes32 constant VRF_KEY_HASH = 0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab;

    // Base Aave V3 configuration
    address constant AAVE_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address constant WETH_GATEWAY = 0xa0d9C1E9E48Ca30c8d8C3B5D69FF5dc1f6DFfC24;
    address constant A_WETH = 0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7;
    address constant A_USDC = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;
    // Native USDC token address on Base
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        require(block.chainid == 8453, "This script is for Base only");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        SquaresFactory factory = new SquaresFactory(
            VRF_COORDINATOR,
            VRF_KEY_HASH,
            0 // No creation fee
        );

        // Set VRF funding amount (0.0005 ETH per pool - ~50x buffer at 0.02 gwei)
        factory.setVRFFundingAmount(0.0005 ether);

        // Set Aave addresses for yield generation
        factory.setAaveAddresses(
            AAVE_POOL,
            WETH_GATEWAY,
            A_WETH,
            A_USDC,
            USDC
        );

        // Set score admin (same as admin for unified control)
        factory.setScoreAdmin(ADMIN);

        // Transfer admin to ADMIN address
        factory.transferAdmin(ADMIN);

        console.log("============================================");
        console.log("SquaresFactory deployed at:", address(factory));
        console.log("Chain: Base (8453)");
        console.log("VRF Coordinator:", VRF_COORDINATOR);
        console.log("VRF Subscription ID:", factory.defaultVRFSubscriptionId());
        console.log("Admin:", ADMIN);
        console.log("Score Admin:", ADMIN);
        console.log("--------------------------------------------");
        console.log("Aave Integration: ENABLED");
        console.log("Aave Pool:", AAVE_POOL);
        console.log("WETH Gateway:", WETH_GATEWAY);
        console.log("aWETH:", A_WETH);
        console.log("aUSDC:", A_USDC);
        console.log("============================================");

        vm.stopBroadcast();
    }
}
