// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";

/// @title DeployArbitrum
/// @notice Deployment script for Arbitrum One WITH full Aave V3 integration
/// @dev Pool funds are deposited to Aave to earn yield, which goes to admin after game ends
contract DeployArbitrum is Script {
    // Admin address (has full control: pause creation, set fees, withdraw, etc.)
    address constant ADMIN = 0x51E5E6F9933fD28B62d714C3f7febECe775b6b95;

    // Arbitrum Chainlink VRF V2.5 configuration
    address constant VRF_COORDINATOR = 0x3C0Ca683b403E37668AE3DC4FB62F4B29B6f7a3e;
    bytes32 constant VRF_KEY_HASH = 0x1770bdc7eec7771f7ba4ffd640f34260d7f095b79c92d34a5b2551d6f6cfd2be;

    // Arbitrum Aave V3 configuration
    address constant AAVE_POOL = 0x794a61358D6845594F94dc1DB02A252b5b4814aD;
    address constant WETH_GATEWAY = 0xecD4bd3121F9FD604ffaC631bF6d41ec12f1fafb;
    address constant A_WETH = 0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8;
    address constant A_USDC = 0x724dc807b04555b71ed48a6896b6F41593b8C637;

    function run() external {
        require(block.chainid == 42161, "This script is for Arbitrum only");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        SquaresFactory factory = new SquaresFactory(
            VRF_COORDINATOR,
            VRF_KEY_HASH,
            0 // No creation fee
        );

        // Set VRF funding amount (0.01 ETH per pool - Arbitrum has lower gas costs)
        factory.setVRFFundingAmount(0.01 ether);

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
