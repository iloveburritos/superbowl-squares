// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SquaresPoolV2} from "../src/SquaresPoolV2.sol";
import {SquaresFactoryV2} from "../src/SquaresFactoryV2.sol";
import {ISquaresPool} from "../src/interfaces/ISquaresPool.sol";
import {IFunctionsClient, FunctionsRequest, FunctionsRequestLib} from "../src/interfaces/IFunctionsClient.sol";
import {MockVRFCoordinator} from "./mocks/MockVRFCoordinator.sol";
import {MockFunctionsRouter} from "./mocks/MockFunctionsRouter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @title ChainlinkFunctionsIntegrationTest
/// @notice Focused tests for Chainlink Functions integration edge cases and security
contract ChainlinkFunctionsIntegrationTest is Test {
    using FunctionsRequestLib for FunctionsRequest;

    SquaresFactoryV2 public factory;
    SquaresPoolV2 public pool;
    MockVRFCoordinator public vrfCoordinator;
    MockFunctionsRouter public functionsRouter;

    address public operator = address(0x1);
    address public alice = address(0x2);
    address public bob = address(0x3);
    address public attacker = address(0xBad);

    uint64 public constant FUNCTIONS_SUBSCRIPTION_ID = 123;
    bytes32 public constant FUNCTIONS_DON_ID = bytes32("DON1");

    // Realistic JavaScript source code for score fetching
    string public constant REAL_FUNCTIONS_SOURCE =
        "const quarter = args[0];"
        "const gameId = args[1];"
        ""
        "// Fetch from ESPN"
        "const espnRes = await Functions.makeHttpRequest({"
        "  url: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`"
        "});"
        ""
        "// Fetch from NFL.com"
        "const nflRes = await Functions.makeHttpRequest({"
        "  url: `https://api.nfl.com/v1/games/${gameId}`"
        "});"
        ""
        "// Parse and verify"
        "const espnScore = espnRes.data.score;"
        "const nflScore = nflRes.data.score;"
        ""
        "const verified = espnScore.team1 === nflScore.team1 && espnScore.team2 === nflScore.team2;"
        "const encoded = (espnScore.team1 << 16) | (espnScore.team2 << 8) | (verified ? 1 : 0);"
        "return Functions.encodeUint256(encoded);";

    function setUp() public {
        // Deploy mocks
        vrfCoordinator = new MockVRFCoordinator();
        functionsRouter = new MockFunctionsRouter();

        // Deploy factory
        factory = new SquaresFactoryV2(
            address(vrfCoordinator),
            address(functionsRouter),
            FUNCTIONS_SUBSCRIPTION_ID,
            FUNCTIONS_DON_ID
        );

        factory.setDefaultFunctionsSource(REAL_FUNCTIONS_SOURCE);

        // Create and setup pool
        _createAndSetupPool();

        // Fund accounts
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(attacker, 100 ether);
    }

    function _createAndSetupPool() internal {
        ISquaresPool.PoolParams memory params = ISquaresPool.PoolParams({
            name: "Super Bowl LX",
            squarePrice: 0.1 ether,
            paymentToken: address(0),
            maxSquaresPerUser: 0,
            payoutPercentages: [uint8(20), uint8(20), uint8(20), uint8(40)],
            teamAName: "Patriots",
            teamBName: "Seahawks",
            purchaseDeadline: block.timestamp + 7 days,
            vrfDeadline: block.timestamp + 8 days,
            vrfSubscriptionId: 1,
            vrfKeyHash: bytes32(0),
            umaDisputePeriod: 0,
            umaBondAmount: 0
        });

        vm.prank(operator);
        address poolAddr = factory.createPool(params);
        pool = SquaresPoolV2(payable(poolAddr));

        // Fund alice before buying squares
        vm.deal(alice, 100 ether);

        // Buy all squares
        uint8[] memory positions = new uint8[](100);
        for (uint8 i = 0; i < 100; i++) {
            positions[i] = i;
        }
        vm.prank(alice);
        pool.buySquares{value: 10 ether}(positions);

        // Setup for scoring
        vm.prank(operator);
        pool.closePool();

        vm.prank(operator);
        uint256 requestId = pool.requestRandomNumbers();

        uint256[] memory randomWords = new uint256[](2);
        randomWords[0] = 12345;
        randomWords[1] = 67890;
        vrfCoordinator.fulfillRandomWords(requestId, randomWords);
    }

    // ============ Response Encoding/Decoding Tests ============

    function test_ResponseDecoding_ValidScores() public {
        // Test various score combinations by creating separate pools
        uint8[5] memory teamAScores = [uint8(0), uint8(7), uint8(21), uint8(100), uint8(255)];
        uint8[5] memory teamBScores = [uint8(0), uint8(3), uint8(17), uint8(99), uint8(127)];

        for (uint256 i = 0; i < teamAScores.length; i++) {
            // Create fresh pool for each iteration
            if (i > 0) {
                _createAndSetupPool();
            }

            vm.prank(alice);
            bytes32 requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);

            functionsRouter.setNextResponse(teamAScores[i], teamBScores[i], true);
            functionsRouter.autoFulfill(requestId);

            ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
            assertEq(score.teamAScore, teamAScores[i], "Team A score mismatch");
            assertEq(score.teamBScore, teamBScores[i], "Team B score mismatch");
        }
    }

    function test_ResponseDecoding_MaxValues() public {
        vm.prank(alice);
        bytes32 requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);

        // Maximum uint8 values (255, 255)
        functionsRouter.setNextResponse(255, 255, true);
        functionsRouter.autoFulfill(requestId);

        ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
        assertEq(score.teamAScore, 255);
        assertEq(score.teamBScore, 255);
    }

    // ============ Verification Logic Tests ============

    function test_VerificationFlag_TrueSettlesScore() public {
        vm.prank(alice);
        bytes32 requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);

        functionsRouter.setNextResponse(14, 7, true);
        functionsRouter.autoFulfill(requestId);

        ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
        assertTrue(score.settled);

        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.Q1_SCORED));
    }

    function test_VerificationFlag_FalseDoesNotSettle() public {
        vm.prank(alice);
        bytes32 requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);

        functionsRouter.setNextResponse(14, 7, false); // Not verified
        functionsRouter.autoFulfill(requestId);

        ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
        assertFalse(score.settled);
        assertFalse(score.submitted); // Reset for retry

        // State should NOT have advanced
        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.NUMBERS_ASSIGNED));
    }

    // ============ Error Handling Tests ============

    function test_ErrorResponse_AllowsRetry() public {
        vm.prank(alice);
        bytes32 requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);

        // Simulate various API errors
        bytes[] memory errorMessages = new bytes[](4);
        errorMessages[0] = "API rate limited";
        errorMessages[1] = "Timeout";
        errorMessages[2] = "Invalid response";
        errorMessages[3] = bytes(abi.encodePacked("Error code: ", uint256(500)));

        for (uint256 i = 0; i < errorMessages.length; i++) {
            if (i > 0) {
                vm.prank(alice);
                requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);
            }

            functionsRouter.fulfillRequestWithError(requestId, errorMessages[i]);

            ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
            assertFalse(score.submitted, "Should allow retry after error");
            assertFalse(score.settled);
        }
    }

    function test_ErrorResponse_EmitsEvent() public {
        vm.prank(alice);
        bytes32 requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);

        vm.expectEmit(true, false, false, true);
        emit SquaresPoolV2.ScoreVerified(ISquaresPool.Quarter.Q1, 0, 0, false);

        functionsRouter.fulfillRequestWithError(requestId, "API error");
    }

    // ============ Request ID Mapping Tests ============

    function test_RequestIdToQuarter_MappedCorrectly() public {
        // Q1
        vm.prank(alice);
        bytes32 q1RequestId = pool.fetchScore(ISquaresPool.Quarter.Q1);
        assertEq(uint8(pool.requestIdToQuarter(q1RequestId)), uint8(ISquaresPool.Quarter.Q1));

        // Fulfill Q1 and proceed
        functionsRouter.setNextResponse(7, 3, true);
        functionsRouter.autoFulfill(q1RequestId);

        // Q2
        vm.prank(alice);
        bytes32 q2RequestId = pool.fetchScore(ISquaresPool.Quarter.Q2);
        assertEq(uint8(pool.requestIdToQuarter(q2RequestId)), uint8(ISquaresPool.Quarter.Q2));

        // Both mappings should exist
        assertEq(uint8(pool.requestIdToQuarter(q1RequestId)), uint8(ISquaresPool.Quarter.Q1));
        assertEq(uint8(pool.requestIdToQuarter(q2RequestId)), uint8(ISquaresPool.Quarter.Q2));
    }

    function test_RequestIdToQuarter_HandlesMultipleRequests() public {
        // First request fails
        vm.prank(alice);
        bytes32 requestId1 = pool.fetchScore(ISquaresPool.Quarter.Q1);

        functionsRouter.fulfillRequestWithError(requestId1, "Failed");

        // Second request (retry)
        vm.prank(bob);
        bytes32 requestId2 = pool.fetchScore(ISquaresPool.Quarter.Q1);

        // Both should map to Q1
        assertEq(uint8(pool.requestIdToQuarter(requestId1)), uint8(ISquaresPool.Quarter.Q1));
        assertEq(uint8(pool.requestIdToQuarter(requestId2)), uint8(ISquaresPool.Quarter.Q1));
    }

    // ============ Security: Unauthorized Callback Tests ============

    function test_Callback_RevertIfNotRouter() public {
        vm.prank(alice);
        bytes32 requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);

        // Attacker tries to call callback directly
        uint256 fakeResponse = (7 << 16) | (3 << 8) | 1;

        vm.prank(attacker);
        vm.expectRevert(SquaresPoolV2.OnlyFunctionsRouter.selector);
        pool.handleOracleFulfillment(requestId, abi.encode(fakeResponse), "");
    }

    function test_Callback_RevertIfFromOtherContract() public {
        vm.prank(alice);
        bytes32 requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);

        // Deploy malicious contract
        MaliciousCallback malicious = new MaliciousCallback(address(pool));

        uint256 fakeResponse = (7 << 16) | (3 << 8) | 1;

        vm.expectRevert(SquaresPoolV2.OnlyFunctionsRouter.selector);
        malicious.callCallback(requestId, abi.encode(fakeResponse));
    }

    function test_Callback_CannotSpoof() public {
        vm.prank(alice);
        bytes32 requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);

        // Try multiple spoof attempts
        address[] memory spoofAddresses = new address[](5);
        spoofAddresses[0] = address(0);
        spoofAddresses[1] = operator;
        spoofAddresses[2] = address(factory);
        spoofAddresses[3] = address(pool);
        spoofAddresses[4] = address(vrfCoordinator);

        uint256 fakeResponse = (99 << 16) | (0 << 8) | 1; // Attacker wants 99-0 score

        for (uint256 i = 0; i < spoofAddresses.length; i++) {
            vm.prank(spoofAddresses[i]);
            vm.expectRevert(SquaresPoolV2.OnlyFunctionsRouter.selector);
            pool.handleOracleFulfillment(requestId, abi.encode(fakeResponse), "");
        }
    }

    // ============ State Machine Security Tests ============

    function test_CannotSkipQuarters() public {
        // Try to fetch Q2 without Q1 being scored
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                SquaresPoolV2.InvalidState.selector,
                ISquaresPool.PoolState.NUMBERS_ASSIGNED,
                ISquaresPool.PoolState.Q1_SCORED
            )
        );
        pool.fetchScore(ISquaresPool.Quarter.Q2);

        // Score Q1
        vm.prank(alice);
        bytes32 requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);
        functionsRouter.setNextResponse(7, 3, true);
        functionsRouter.autoFulfill(requestId);

        // Now try Q3 without Q2
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                SquaresPoolV2.InvalidState.selector,
                ISquaresPool.PoolState.Q1_SCORED,
                ISquaresPool.PoolState.Q2_SCORED
            )
        );
        pool.fetchScore(ISquaresPool.Quarter.Q3);

        // Try FINAL without Q2 or Q3
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                SquaresPoolV2.InvalidState.selector,
                ISquaresPool.PoolState.Q1_SCORED,
                ISquaresPool.PoolState.Q3_SCORED
            )
        );
        pool.fetchScore(ISquaresPool.Quarter.FINAL);
    }

    function test_CannotResubmitScoredQuarter() public {
        // Score Q1
        vm.prank(alice);
        bytes32 requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);
        functionsRouter.setNextResponse(7, 3, true);
        functionsRouter.autoFulfill(requestId);

        // Try to score Q1 again (state has moved to Q1_SCORED, need to be in NUMBERS_ASSIGNED)
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                SquaresPoolV2.InvalidState.selector,
                ISquaresPool.PoolState.Q1_SCORED,
                ISquaresPool.PoolState.NUMBERS_ASSIGNED
            )
        );
        pool.fetchScore(ISquaresPool.Quarter.Q1);
    }

    // ============ Concurrent Request Prevention Tests ============

    function test_CannotHaveMultiplePendingRequests() public {
        // First request
        vm.prank(alice);
        pool.fetchScore(ISquaresPool.Quarter.Q1);

        // Second request should fail
        vm.prank(bob);
        vm.expectRevert(SquaresPoolV2.ScoreAlreadyPending.selector);
        pool.fetchScore(ISquaresPool.Quarter.Q1);
    }

    function test_PendingRequestClearedOnError() public {
        // First request
        vm.prank(alice);
        bytes32 requestId1 = pool.fetchScore(ISquaresPool.Quarter.Q1);

        // Error clears pending
        functionsRouter.fulfillRequestWithError(requestId1, "Error");

        // Can now make new request
        vm.prank(bob);
        bytes32 requestId2 = pool.fetchScore(ISquaresPool.Quarter.Q1);
        assertTrue(requestId2 != requestId1);
    }

    function test_PendingRequestClearedOnNoConsensus() public {
        // First request
        vm.prank(alice);
        bytes32 requestId1 = pool.fetchScore(ISquaresPool.Quarter.Q1);

        // No consensus clears pending
        functionsRouter.setNextResponse(7, 3, false);
        functionsRouter.autoFulfill(requestId1);

        // Can now make new request
        vm.prank(bob);
        bytes32 requestId2 = pool.fetchScore(ISquaresPool.Quarter.Q1);
        assertTrue(requestId2 != requestId1);
    }

    // ============ CBOR Encoding Tests ============

    function test_CBOREncoding_BasicString() public {
        FunctionsRequest memory req;
        req.source = "return 1;";
        req.args = new string[](0);

        bytes memory encoded = req.encodeCBOR();

        // Should produce valid CBOR
        assertTrue(encoded.length > 0);
        // Map with 2 entries starts with 0xa2
        assertEq(uint8(encoded[0]), 0xa2);
    }

    function test_CBOREncoding_WithArgs() public {
        FunctionsRequest memory req;
        req.source = "return args[0];";
        req.args = new string[](2);
        req.args[0] = "1";
        req.args[1] = "401547417";

        bytes memory encoded = req.encodeCBOR();

        assertTrue(encoded.length > 0);
    }

    function test_CBOREncoding_LongSource() public {
        FunctionsRequest memory req;
        // Create source longer than 256 bytes
        bytes memory longSource = new bytes(300);
        for (uint256 i = 0; i < 300; i++) {
            longSource[i] = "x";
        }
        req.source = string(longSource);
        req.args = new string[](0);

        bytes memory encoded = req.encodeCBOR();

        assertTrue(encoded.length > 300);
    }

    // ============ Gas Limit Tests ============

    function test_CallbackGasLimit_IsSet() public {
        // The callback gas limit is hardcoded to 300000
        // This test documents the expected value
        // Verify the callback gas limit by making a request and checking the router captured it
        vm.prank(alice);
        bytes32 requestId = pool.fetchScore(ISquaresPool.Quarter.Q1);

        MockFunctionsRouter.RequestDetails memory details = functionsRouter.getRequestDetails(requestId);
        assertEq(details.callbackGasLimit, 300000);
    }

    // ============ Operator Fallback Tests ============

    function test_OperatorFallback_WorksWhenFunctionsFails() public {
        // Simulate persistent API failures
        vm.prank(alice);
        bytes32 requestId1 = pool.fetchScore(ISquaresPool.Quarter.Q1);
        functionsRouter.fulfillRequestWithError(requestId1, "API down");

        vm.prank(alice);
        bytes32 requestId2 = pool.fetchScore(ISquaresPool.Quarter.Q1);
        functionsRouter.fulfillRequestWithError(requestId2, "API down");

        // Operator can manually submit
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 14, 7);

        ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
        assertTrue(score.settled);
        assertEq(score.teamAScore, 14);
        assertEq(score.teamBScore, 7);
    }

    function test_OperatorFallback_CannotBeUsedByNonOperator() public {
        vm.prank(attacker);
        vm.expectRevert(SquaresPoolV2.OnlyOperator.selector);
        pool.submitScore(ISquaresPool.Quarter.Q1, 99, 0);
    }

    function test_OperatorFallback_OverridesPendingRequest() public {
        // Start Functions request
        vm.prank(alice);
        pool.fetchScore(ISquaresPool.Quarter.Q1);

        // Operator can override while request is pending
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.Q1, 14, 7);

        ISquaresPool.Score memory score = pool.getScore(ISquaresPool.Quarter.Q1);
        assertTrue(score.settled);
    }

    // ============ Integration: Full Multi-Quarter Flow ============

    function test_FullFlow_AllQuartersWithFunctions() public {
        // Q1: Normal Functions flow
        vm.prank(alice);
        bytes32 q1Request = pool.fetchScore(ISquaresPool.Quarter.Q1);
        functionsRouter.setNextResponse(7, 3, true);
        functionsRouter.autoFulfill(q1Request);

        vm.prank(alice);
        pool.claimPayout(ISquaresPool.Quarter.Q1);

        // Q2: Error then retry
        vm.prank(bob);
        bytes32 q2Request1 = pool.fetchScore(ISquaresPool.Quarter.Q2);
        functionsRouter.fulfillRequestWithError(q2Request1, "Timeout");

        vm.prank(bob);
        bytes32 q2Request2 = pool.fetchScore(ISquaresPool.Quarter.Q2);
        functionsRouter.setNextResponse(14, 10, true);
        functionsRouter.autoFulfill(q2Request2);

        vm.prank(alice);
        pool.claimPayout(ISquaresPool.Quarter.Q2);

        // Q3: No consensus then success
        vm.prank(alice);
        bytes32 q3Request1 = pool.fetchScore(ISquaresPool.Quarter.Q3);
        functionsRouter.setNextResponse(21, 17, false); // No consensus
        functionsRouter.autoFulfill(q3Request1);

        vm.prank(alice);
        bytes32 q3Request2 = pool.fetchScore(ISquaresPool.Quarter.Q3);
        functionsRouter.setNextResponse(21, 17, true);
        functionsRouter.autoFulfill(q3Request2);

        vm.prank(alice);
        pool.claimPayout(ISquaresPool.Quarter.Q3);

        // Final: Operator fallback
        vm.prank(operator);
        pool.submitScore(ISquaresPool.Quarter.FINAL, 28, 24);

        vm.prank(alice);
        pool.claimPayout(ISquaresPool.Quarter.FINAL);

        // Verify final state
        (, ISquaresPool.PoolState state, , , , , ,) = pool.getPoolInfo();
        assertEq(uint8(state), uint8(ISquaresPool.PoolState.FINAL_SCORED));
    }
}

// ============ Helper Contracts ============

contract MaliciousCallback {
    address public pool;

    constructor(address _pool) {
        pool = _pool;
    }

    function callCallback(bytes32 requestId, bytes memory response) external {
        IFunctionsClient(pool).handleOracleFulfillment(requestId, response, "");
    }
}
