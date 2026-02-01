// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";

/// @title DeploySepolia
/// @notice Deployment script for Sepolia testnet with ETH-only Aave integration
/// @dev Aave on Sepolia uses their own test tokens for USDC, so only ETH/WETH works
contract DeploySepolia is Script {
    // Admin address (has full control: pause creation, set fees, withdraw, etc.)
    address constant ADMIN = 0x51E5E6F9933fD28B62d714C3f7febECe775b6b95;

    // Sepolia Chainlink VRF V2.5 configuration
    address constant VRF_COORDINATOR = 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B;
    bytes32 constant VRF_KEY_HASH = 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae;

    // Aave V3 Sepolia addresses (ETH only - USDC not supported with Circle USDC)
    address constant AAVE_POOL = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;
    address constant WETH_GATEWAY = 0x387d311e47e80b498169e6fb51d3193167d89F7D;
    address constant AWETH = 0x5b071b590a59395fE4025A0Ccc1FcC931AAc1830;
    address constant AUSDC = address(0); // Not supported - Circle USDC not compatible with Aave Sepolia

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

        // Set Aave addresses (ETH pools will use Aave, USDC pools will not)
        factory.setAaveAddresses(AAVE_POOL, WETH_GATEWAY, AWETH, AUSDC);
        console.log("Aave integration: ENABLED for ETH only (USDC not supported on Sepolia)");

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
