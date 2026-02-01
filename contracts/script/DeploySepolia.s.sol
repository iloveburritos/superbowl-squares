// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";

/// @title DeploySepolia
/// @notice Deployment script for Sepolia testnet WITHOUT Aave integration
/// @dev Aave on Sepolia uses different test tokens than Circle USDC, so we skip Aave
contract DeploySepolia is Script {
    // Admin address (has full control: pause creation, set fees, withdraw, etc.)
    address constant ADMIN = 0x51E5E6F9933fD28B62d714C3f7febECe775b6b95;

    // Sepolia Chainlink VRF V2.5 configuration
    address constant VRF_COORDINATOR = 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B;
    bytes32 constant VRF_KEY_HASH = 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae;

    function run() external {
        require(block.chainid == 11155111, "This script is for Sepolia only");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        SquaresFactory factory = new SquaresFactory(
            VRF_COORDINATOR,
            VRF_KEY_HASH,
            0 // No creation fee
        );

        // Set VRF funding amount (1 ETH per pool)
        factory.setVRFFundingAmount(1 ether);

        // NOTE: We intentionally DO NOT set Aave addresses for Sepolia
        // Aave on Sepolia uses their own test tokens, not Circle USDC
        // Pools will work normally, just without yield generation
        console.log("Aave integration: DISABLED (Sepolia testnet)");

        // Set score admin (same as admin for unified control)
        factory.setScoreAdmin(ADMIN);

        // Transfer admin to ADMIN address
        factory.transferAdmin(ADMIN);

        console.log("============================================");
        console.log("SquaresFactory deployed at:", address(factory));
        console.log("Chain: Sepolia (11155111)");
        console.log("VRF Coordinator:", VRF_COORDINATOR);
        console.log("VRF Subscription ID:", factory.defaultVRFSubscriptionId());
        console.log("Admin:", ADMIN);
        console.log("Score Admin:", ADMIN);
        console.log("============================================");

        vm.stopBroadcast();
    }
}
