// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SquaresLib
/// @notice Library for Super Bowl Squares game utilities
library SquaresLib {
    /// @notice Performs Fisher-Yates shuffle to assign random numbers 0-9 to positions
    /// @param seed Random seed from VRF
    /// @return numbers Array of 10 numbers (0-9) in shuffled order
    function fisherYatesShuffle(uint256 seed) internal pure returns (uint8[10] memory numbers) {
        // Initialize array with 0-9
        for (uint8 i = 0; i < 10; i++) {
            numbers[i] = i;
        }

        // Fisher-Yates shuffle
        for (uint256 i = 9; i > 0; i--) {
            // Generate random index from 0 to i
            uint256 j = uint256(keccak256(abi.encodePacked(seed, i))) % (i + 1);

            // Swap numbers[i] and numbers[j]
            uint8 temp = numbers[i];
            numbers[i] = numbers[uint8(j)];
            numbers[uint8(j)] = temp;
        }

        return numbers;
    }

    /// @notice Get the winning square position for a given score
    /// @param teamAScore Team A's score (full score, will be modulo 10)
    /// @param teamBScore Team B's score (full score, will be modulo 10)
    /// @param rowNumbers The random row number assignments (Team A)
    /// @param colNumbers The random column number assignments (Team B)
    /// @return position The winning square position (0-99)
    function getWinningPosition(
        uint8 teamAScore,
        uint8 teamBScore,
        uint8[10] memory rowNumbers,
        uint8[10] memory colNumbers
    ) internal pure returns (uint8) {
        uint8 teamALastDigit = teamAScore % 10;
        uint8 teamBLastDigit = teamBScore % 10;

        // Find row index for Team A's last digit
        uint8 rowIndex;
        for (uint8 i = 0; i < 10; i++) {
            if (rowNumbers[i] == teamALastDigit) {
                rowIndex = i;
                break;
            }
        }

        // Find column index for Team B's last digit
        uint8 colIndex;
        for (uint8 i = 0; i < 10; i++) {
            if (colNumbers[i] == teamBLastDigit) {
                colIndex = i;
                break;
            }
        }

        // Position = row * 10 + col
        return rowIndex * 10 + colIndex;
    }

    /// @notice Convert position (0-99) to row and column indices
    /// @param position Square position
    /// @return row Row index (0-9)
    /// @return col Column index (0-9)
    function positionToCoords(uint8 position) internal pure returns (uint8 row, uint8 col) {
        require(position < 100, "Invalid position");
        row = position / 10;
        col = position % 10;
    }

    /// @notice Convert row and column to position
    /// @param row Row index (0-9)
    /// @param col Column index (0-9)
    /// @return position Square position (0-99)
    function coordsToPosition(uint8 row, uint8 col) internal pure returns (uint8) {
        require(row < 10 && col < 10, "Invalid coordinates");
        return row * 10 + col;
    }

    /// @notice Validate payout percentages sum to 100
    /// @param percentages Array of 4 percentages [Q1, Q2, Q3, Final]
    /// @return valid True if percentages sum to 100
    function validatePayoutPercentages(uint8[4] memory percentages) internal pure returns (bool) {
        uint16 sum = uint16(percentages[0]) + uint16(percentages[1]) + uint16(percentages[2]) + uint16(percentages[3]);
        return sum == 100;
    }

    /// @notice Calculate payout amount for a quarter
    /// @param totalPot Total pot amount
    /// @param percentage Percentage for this quarter (0-100)
    /// @return payout Amount to pay out
    function calculatePayout(uint256 totalPot, uint8 percentage) internal pure returns (uint256) {
        return (totalPot * percentage) / 100;
    }

    /// @notice Build UMA assertion claim string for a score
    /// @param poolName Name of the pool
    /// @param quarter Quarter number (1-4)
    /// @param teamAName Team A name
    /// @param teamBName Team B name
    /// @param teamAScore Team A score
    /// @param teamBScore Team B score
    /// @return claim The assertion claim as bytes
    function buildScoreClaim(
        string memory poolName,
        uint8 quarter,
        string memory teamAName,
        string memory teamBName,
        uint8 teamAScore,
        uint8 teamBScore
    ) internal pure returns (bytes memory) {
        string memory quarterName;
        if (quarter == 1) quarterName = "Q1";
        else if (quarter == 2) quarterName = "Q2";
        else if (quarter == 3) quarterName = "Q3";
        else quarterName = "Final";

        return abi.encodePacked(
            "SuperBowl Squares Pool '",
            poolName,
            "' ",
            quarterName,
            " score: ",
            teamAName,
            "=",
            uint8ToString(teamAScore),
            ", ",
            teamBName,
            "=",
            uint8ToString(teamBScore)
        );
    }

    /// @notice Convert uint8 to string
    function uint8ToString(uint8 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint8 temp = value;
        uint8 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint8(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
