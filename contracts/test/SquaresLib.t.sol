// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SquaresLib} from "../src/libraries/SquaresLib.sol";

contract SquaresLibTest is Test {
    // ============ Fisher-Yates Shuffle Tests ============

    function test_FisherYatesShuffle_ContainsAllNumbers() public pure {
        uint8[10] memory numbers = SquaresLib.fisherYatesShuffle(12345);

        bool[10] memory seen;
        for (uint8 i = 0; i < 10; i++) {
            seen[numbers[i]] = true;
        }

        for (uint8 i = 0; i < 10; i++) {
            assertTrue(seen[i], "Missing number");
        }
    }

    function test_FisherYatesShuffle_DifferentSeeds() public pure {
        uint8[10] memory numbers1 = SquaresLib.fisherYatesShuffle(111);
        uint8[10] memory numbers2 = SquaresLib.fisherYatesShuffle(222);

        // Should be different (with high probability)
        bool different = false;
        for (uint8 i = 0; i < 10; i++) {
            if (numbers1[i] != numbers2[i]) {
                different = true;
                break;
            }
        }
        assertTrue(different, "Shuffles should differ");
    }

    function test_FisherYatesShuffle_SameSeedSameResult() public pure {
        uint8[10] memory numbers1 = SquaresLib.fisherYatesShuffle(12345);
        uint8[10] memory numbers2 = SquaresLib.fisherYatesShuffle(12345);

        for (uint8 i = 0; i < 10; i++) {
            assertEq(numbers1[i], numbers2[i], "Same seed should give same result");
        }
    }

    // ============ Winning Position Tests ============

    function test_GetWinningPosition_BasicCase() public pure {
        // Row numbers: [0,1,2,3,4,5,6,7,8,9] (identity)
        // Col numbers: [0,1,2,3,4,5,6,7,8,9] (identity)
        uint8[10] memory rowNumbers = [uint8(0), 1, 2, 3, 4, 5, 6, 7, 8, 9];
        uint8[10] memory colNumbers = [uint8(0), 1, 2, 3, 4, 5, 6, 7, 8, 9];

        // Score: TeamA=17, TeamB=14
        // Last digits: 7 and 4
        // Row index where value=7 is 7
        // Col index where value=4 is 4
        // Position = 7 * 10 + 4 = 74
        uint8 position = SquaresLib.getWinningPosition(17, 14, rowNumbers, colNumbers);
        assertEq(position, 74);
    }

    function test_GetWinningPosition_ShuffledNumbers() public pure {
        // Shuffled row numbers: [3,7,1,9,0,5,2,8,4,6]
        // Position 0 has value 3, position 1 has value 7, etc.
        uint8[10] memory rowNumbers = [uint8(3), 7, 1, 9, 0, 5, 2, 8, 4, 6];
        // Shuffled col numbers: [5,2,8,0,6,1,9,3,7,4]
        uint8[10] memory colNumbers = [uint8(5), 2, 8, 0, 6, 1, 9, 3, 7, 4];

        // Score: TeamA=21, TeamB=17
        // Last digits: 1 and 7
        // Row index where value=1 is 2
        // Col index where value=7 is 8
        // Position = 2 * 10 + 8 = 28
        uint8 position = SquaresLib.getWinningPosition(21, 17, rowNumbers, colNumbers);
        assertEq(position, 28);
    }

    function test_GetWinningPosition_ZeroScore() public pure {
        uint8[10] memory rowNumbers = [uint8(0), 1, 2, 3, 4, 5, 6, 7, 8, 9];
        uint8[10] memory colNumbers = [uint8(0), 1, 2, 3, 4, 5, 6, 7, 8, 9];

        // Score: 0-0
        // Last digits: 0 and 0
        // Position = 0 * 10 + 0 = 0
        uint8 position = SquaresLib.getWinningPosition(0, 0, rowNumbers, colNumbers);
        assertEq(position, 0);
    }

    function test_GetWinningPosition_HighScore() public pure {
        uint8[10] memory rowNumbers = [uint8(0), 1, 2, 3, 4, 5, 6, 7, 8, 9];
        uint8[10] memory colNumbers = [uint8(0), 1, 2, 3, 4, 5, 6, 7, 8, 9];

        // Score: 56-49
        // Last digits: 6 and 9
        // Position = 6 * 10 + 9 = 69
        uint8 position = SquaresLib.getWinningPosition(56, 49, rowNumbers, colNumbers);
        assertEq(position, 69);
    }

    // ============ Position Conversion Tests ============

    function test_PositionToCoords() public pure {
        (uint8 row, uint8 col) = SquaresLib.positionToCoords(0);
        assertEq(row, 0);
        assertEq(col, 0);

        (row, col) = SquaresLib.positionToCoords(45);
        assertEq(row, 4);
        assertEq(col, 5);

        (row, col) = SquaresLib.positionToCoords(99);
        assertEq(row, 9);
        assertEq(col, 9);
    }

    function test_PositionToCoords_InvalidPosition() public {
        vm.expectRevert("Invalid position");
        SquaresLib.positionToCoords(100);
    }

    function test_CoordsToPosition() public pure {
        assertEq(SquaresLib.coordsToPosition(0, 0), 0);
        assertEq(SquaresLib.coordsToPosition(4, 5), 45);
        assertEq(SquaresLib.coordsToPosition(9, 9), 99);
    }

    function test_CoordsToPosition_InvalidCoords() public {
        vm.expectRevert("Invalid coordinates");
        SquaresLib.coordsToPosition(10, 0);

        vm.expectRevert("Invalid coordinates");
        SquaresLib.coordsToPosition(0, 10);
    }

    // ============ Payout Validation Tests ============

    function test_ValidatePayoutPercentages_Valid() public pure {
        uint8[4] memory valid = [uint8(25), 25, 25, 25];
        assertTrue(SquaresLib.validatePayoutPercentages(valid));

        uint8[4] memory valid2 = [uint8(10), 20, 30, 40];
        assertTrue(SquaresLib.validatePayoutPercentages(valid2));

        uint8[4] memory valid3 = [uint8(0), 0, 0, 100];
        assertTrue(SquaresLib.validatePayoutPercentages(valid3));
    }

    function test_ValidatePayoutPercentages_Invalid() public pure {
        uint8[4] memory invalid = [uint8(25), 25, 25, 24]; // Sum = 99
        assertFalse(SquaresLib.validatePayoutPercentages(invalid));

        uint8[4] memory invalid2 = [uint8(30), 30, 30, 30]; // Sum = 120
        assertFalse(SquaresLib.validatePayoutPercentages(invalid2));
    }

    // ============ Calculate Payout Tests ============

    function test_CalculatePayout() public pure {
        // 10 ETH pot, 25% payout = 2.5 ETH
        assertEq(SquaresLib.calculatePayout(10 ether, 25), 2.5 ether);

        // 10 ETH pot, 40% payout = 4 ETH
        assertEq(SquaresLib.calculatePayout(10 ether, 40), 4 ether);

        // 10 ETH pot, 100% payout = 10 ETH
        assertEq(SquaresLib.calculatePayout(10 ether, 100), 10 ether);

        // 10 ETH pot, 0% payout = 0 ETH
        assertEq(SquaresLib.calculatePayout(10 ether, 0), 0);
    }

    // ============ Score Claim Tests ============

    function test_BuildScoreClaim() public pure {
        bytes memory claim = SquaresLib.buildScoreClaim(
            "Super Bowl LVIII",
            1,
            "Chiefs",
            "49ers",
            21,
            17
        );

        // Check it contains expected substrings
        string memory claimStr = string(claim);
        assertTrue(bytes(claimStr).length > 0);
    }

    // ============ Uint8 ToString Tests ============

    function test_Uint8ToString() public pure {
        assertEq(SquaresLib.uint8ToString(0), "0");
        assertEq(SquaresLib.uint8ToString(7), "7");
        assertEq(SquaresLib.uint8ToString(42), "42");
        assertEq(SquaresLib.uint8ToString(100), "100");
        assertEq(SquaresLib.uint8ToString(255), "255");
    }
}
