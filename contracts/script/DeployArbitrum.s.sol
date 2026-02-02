// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";

/// @title DeployArbitrum
/// @notice Deployment script for Arbitrum One WITH full Aave V3 integration
/// @dev Pool funds are deposited to Aave to earn yield, which goes to admin after game ends
contract DeployArbitrum is Script {
    // Admin address (has full control: pause creation, set fees, withdraw, etc.)
    address constant ADMIN = 0xc4364F3a17bb60F3A56aDbe738414eeEB523C6B2;

    // Arbitrum Chainlink VRF V2.5 configuration (2 gwei lane - cheapest)
    address constant VRF_COORDINATOR = 0x3C0Ca683b403E37668AE3DC4FB62F4B29B6f7a3e;
    bytes32 constant VRF_KEY_HASH = 0x9e9e46732b32662b9adc6f3abdf6c5e926a666d174a4d6b8e39c4cca76a38897;

    // Arbitrum Aave V3 configuration
    address constant AAVE_POOL = 0x794a61358D6845594F94dc1DB02A252b5b4814aD;
    address constant WETH_GATEWAY = 0xB5Ee21786D28c5Ba61661550879475976B707099;
    address constant A_WETH = 0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8;
    // Native USDC aToken (NOT bridged USDC.e)
    address constant A_USDC = 0x724dc807b04555b71ed48a6896b6F41593b8C637;
    // Native USDC token address
    address constant USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    function run() external {
        require(block.chainid == 42161, "This script is for Arbitrum One only");

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
        console.log("Chain: Arbitrum One (42161)");
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
