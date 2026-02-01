// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SquaresFactory} from "../src/SquaresFactory.sol";

/// @title DeployBase
/// @notice Deployment script for Base Mainnet WITH full Aave V3 integration
/// @dev Pool funds are deposited to Aave to earn yield, which goes to admin after game ends
contract DeployBase is Script {
    // Admin address (has full control: pause creation, set fees, withdraw, etc.)
    address constant ADMIN = 0x51E5E6F9933fD28B62d714C3f7febECe775b6b95;

    // Base Chainlink VRF V2.5 configuration
    address constant VRF_COORDINATOR = 0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634;
    bytes32 constant VRF_KEY_HASH = 0x00b81bab01011043e7c98e1a4e82f227b719fcbb9e61fa2db0892ed435ccbb7d;

    // Base Aave V3 configuration
    address constant AAVE_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address constant WETH_GATEWAY = 0x8be473dcfA93132559b118a2e512E32B9AB2EEE7;
    address constant A_WETH = 0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7;
    address constant A_USDC = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;

    function run() external {
        require(block.chainid == 8453, "This script is for Base only");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        SquaresFactory factory = new SquaresFactory(
            VRF_COORDINATOR,
            VRF_KEY_HASH,
            0 // No creation fee
        );

        // Set VRF funding amount (0.01 ETH per pool - Base has lower gas costs)
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
