// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";

/// @title DeployMainnet
/// @notice Deployment script for Ethereum Mainnet WITH full Aave V3 integration
/// @dev Pool funds are deposited to Aave to earn yield, which goes to admin after game ends
contract DeployMainnet is Script {
    // Admin address (has full control: pause creation, set fees, withdraw, etc.)
    address constant ADMIN = 0xc4364F3a17bb60F3A56aDbe738414eeEB523C6B2;

    // Mainnet Chainlink VRF V2.5 configuration
    address constant VRF_COORDINATOR = 0xD7f86b4b8Cae7D942340FF628F82735b7a20893a;
    bytes32 constant VRF_KEY_HASH = 0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9;

    // Mainnet Aave V3 configuration
    address constant AAVE_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address constant WETH_GATEWAY = 0xD322A49006FC828F9B5B37Ab215F99B4E5caB19C;
    address constant A_WETH = 0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8;
    address constant A_USDC = 0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c;

    function run() external {
        require(block.chainid == 1, "This script is for Mainnet only");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        SquaresFactory factory = new SquaresFactory(
            VRF_COORDINATOR,
            VRF_KEY_HASH,
            0 // No creation fee
        );

        // Set VRF funding amount (0.005 ETH per pool - ~50x buffer at 0.2 gwei)
        factory.setVRFFundingAmount(0.005 ether);

        // Set Aave addresses for yield generation
        factory.setAaveAddresses(
            AAVE_POOL,
            WETH_GATEWAY,
            A_WETH,
            A_USDC
        );

        // Set score admin (same as admin for unified control)
        factory.setScoreAdmin(ADMIN);

        // Transfer admin to ADMIN address
        factory.transferAdmin(ADMIN);

        console.log("============================================");
        console.log("SquaresFactory deployed at:", address(factory));
        console.log("Chain: Ethereum Mainnet (1)");
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
