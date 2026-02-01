export const SquaresPoolABI = [
  // Player functions
  {
    type: 'function',
    name: 'buySquares',
    inputs: [
      { name: 'positions', type: 'uint8[]' },
      { name: 'password', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'claimPayout',
    inputs: [{ name: 'quarter', type: 'uint8' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // VRF functions
  {
    type: 'function',
    name: 'closePoolAndRequestVRFFromFactory',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // Score functions
  {
    type: 'function',
    name: 'submitScore',
    inputs: [
      { name: 'quarter', type: 'uint8' },
      { name: 'teamAScore', type: 'uint8' },
      { name: 'teamBScore', type: 'uint8' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'submitScoreFromFactory',
    inputs: [
      { name: 'quarter', type: 'uint8' },
      { name: 'teamAScore', type: 'uint8' },
      { name: 'teamBScore', type: 'uint8' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // View functions
  {
    type: 'function',
    name: 'getGrid',
    inputs: [],
    outputs: [{ type: 'address[100]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getNumbers',
    inputs: [],
    outputs: [
      { name: 'rows', type: 'uint8[10]' },
      { name: 'cols', type: 'uint8[10]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getWinner',
    inputs: [{ name: 'quarter', type: 'uint8' }],
    outputs: [
      { name: 'winner', type: 'address' },
      { name: 'payout', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPoolInfo',
    inputs: [],
    outputs: [
      { name: 'name', type: 'string' },
      { name: 'state', type: 'uint8' },
      { name: 'squarePrice', type: 'uint256' },
      { name: 'paymentToken', type: 'address' },
      { name: 'totalPot', type: 'uint256' },
      { name: 'squaresSold', type: 'uint256' },
      { name: 'teamAName', type: 'string' },
      { name: 'teamBName', type: 'string' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getScore',
    inputs: [{ name: 'quarter', type: 'uint8' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'teamAScore', type: 'uint8' },
          { name: 'teamBScore', type: 'uint8' },
          { name: 'submitted', type: 'bool' },
          { name: 'settled', type: 'bool' },
          { name: 'requestId', type: 'bytes32' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPayoutPercentages',
    inputs: [],
    outputs: [{ type: 'uint8[4]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getVRFStatus',
    inputs: [],
    outputs: [
      { name: 'vrfTriggerTime', type: 'uint256' },
      { name: 'vrfRequested', type: 'bool' },
      { name: 'vrfRequestId', type: 'uint256' },
      { name: 'numbersAssigned', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getFinalDistributionShare',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'share', type: 'uint256' },
      { name: 'claimed', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUnclaimedInfo',
    inputs: [],
    outputs: [
      { name: 'rolledAmount', type: 'uint256' },
      { name: 'distributionPool', type: 'uint256' },
      { name: 'distributionReady', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'hasClaimed',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'quarter', type: 'uint8' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'operator',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'factory',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'state',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'purchaseDeadline',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vrfTriggerTime',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vrfRequested',
    inputs: [],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vrfRequestId',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'numbersSet',
    inputs: [],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'userSquareCount',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'maxSquaresPerUser',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'passwordHash',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isPrivate',
    inputs: [],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },

  // Events
  {
    type: 'event',
    name: 'SquarePurchased',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'position', type: 'uint8', indexed: true },
      { name: 'price', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PoolClosed',
    inputs: [{ name: 'timestamp', type: 'uint256', indexed: false }],
  },
  {
    type: 'event',
    name: 'VRFRequested',
    inputs: [{ name: 'requestId', type: 'uint256', indexed: false }],
  },
  {
    type: 'event',
    name: 'NumbersAssigned',
    inputs: [
      { name: 'rowNumbers', type: 'uint8[10]', indexed: false },
      { name: 'colNumbers', type: 'uint8[10]', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ScoreSubmitted',
    inputs: [
      { name: 'quarter', type: 'uint8', indexed: true },
      { name: 'teamAScore', type: 'uint8', indexed: false },
      { name: 'teamBScore', type: 'uint8', indexed: false },
      { name: 'requestId', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ScoreSettled',
    inputs: [
      { name: 'quarter', type: 'uint8', indexed: true },
      { name: 'winner', type: 'address', indexed: false },
      { name: 'payout', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PayoutClaimed',
    inputs: [
      { name: 'winner', type: 'address', indexed: true },
      { name: 'quarter', type: 'uint8', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'UnclaimedWinningsRolled',
    inputs: [
      { name: 'quarter', type: 'uint8', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'newTotalRolled', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'FinalDistributionCalculated',
    inputs: [
      { name: 'totalAmount', type: 'uint256', indexed: false },
      { name: 'squaresSold', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'FinalDistributionClaimed',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'squaresOwned', type: 'uint256', indexed: false },
    ],
  },
] as const;
