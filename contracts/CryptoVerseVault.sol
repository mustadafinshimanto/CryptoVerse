// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CryptoVerseVault
 * @author CryptoVerse
 * @notice A DeFi staking vault contract demonstrating core DeFi patterns:
 *         deposits, withdrawals, time-locked staking, reward accrual,
 *         reentrancy protection, and emergency withdrawal mechanisms.
 * @dev Designed for educational purposes and portfolio demonstration.
 *      Compatible with Manta Pacific L2 and any EVM chain.
 */
contract CryptoVerseVault {

    // ═══════════════════════════════════════
    //  Data Structures
    // ═══════════════════════════════════════
    struct Stake {
        uint256 amount;          // Amount of ETH staked
        uint256 timestamp;       // When the stake was created
        uint256 lockDuration;    // Lock period in seconds
        uint256 rewardRate;      // Reward rate (basis points per lock period)
        bool    withdrawn;       // Whether this stake has been withdrawn
    }

    struct UserInfo {
        uint256 totalStaked;     // Total ETH currently staked by this user
        uint256 totalRewards;    // Total rewards earned by this user
        uint256 stakeCount;      // Number of stakes made
    }

    // ═══════════════════════════════════════
    //  State Variables
    // ═══════════════════════════════════════
    address public owner;
    bool    public paused;
    bool    private _locked;     // Reentrancy guard

    uint256 public totalValueLocked;
    uint256 public totalRewardsDistributed;
    uint256 public totalStakers;

    // Lock tier configuration (duration => reward rate in basis points)
    // 100 bps = 1%
    uint256 public constant TIER_FLEXIBLE = 0;        // No lock
    uint256 public constant TIER_30_DAYS  = 30 days;
    uint256 public constant TIER_90_DAYS  = 90 days;
    uint256 public constant TIER_180_DAYS = 180 days;

    mapping(uint256 => uint256) public tierRewardRate;

    // User data
    mapping(address => UserInfo) public users;
    mapping(address => Stake[]) public userStakes;
    mapping(address => bool) private _isStaker;

    // Minimum deposit
    uint256 public minDeposit = 0.001 ether;

    // ═══════════════════════════════════════
    //  Events
    // ═══════════════════════════════════════
    event Deposited(address indexed user, uint256 amount, uint256 lockDuration, uint256 stakeIndex);
    event Withdrawn(address indexed user, uint256 amount, uint256 reward, uint256 stakeIndex);
    event EmergencyWithdraw(address indexed user, uint256 amount, uint256 stakeIndex);
    event RewardRateUpdated(uint256 tier, uint256 newRate);
    event Paused(address account);
    event Unpaused(address account);

    // ═══════════════════════════════════════
    //  Modifiers
    // ═══════════════════════════════════════
    modifier onlyOwner() {
        require(msg.sender == owner, "Vault: not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Vault: contract is paused");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "Vault: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    // ═══════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════
    constructor() {
        owner = msg.sender;

        // Set default reward rates (basis points)
        tierRewardRate[TIER_FLEXIBLE] = 50;    // 0.5% for flexible
        tierRewardRate[TIER_30_DAYS]  = 200;   // 2% for 30 days
        tierRewardRate[TIER_90_DAYS]  = 500;   // 5% for 90 days
        tierRewardRate[TIER_180_DAYS] = 1200;  // 12% for 180 days
    }

    // ═══════════════════════════════════════
    //  Core Functions
    // ═══════════════════════════════════════

    /**
     * @notice Deposits ETH into the vault with a specified lock duration.
     * @param lockDuration The lock period (0, 30 days, 90 days, or 180 days).
     */
    function deposit(uint256 lockDuration) external payable whenNotPaused nonReentrant {
        require(msg.value >= minDeposit, "Vault: below minimum deposit");
        require(
            lockDuration == TIER_FLEXIBLE ||
            lockDuration == TIER_30_DAYS  ||
            lockDuration == TIER_90_DAYS  ||
            lockDuration == TIER_180_DAYS,
            "Vault: invalid lock duration"
        );

        uint256 rewardRate = tierRewardRate[lockDuration];
        require(rewardRate > 0, "Vault: tier not configured");

        // Create stake record
        Stake memory newStake = Stake({
            amount: msg.value,
            timestamp: block.timestamp,
            lockDuration: lockDuration,
            rewardRate: rewardRate,
            withdrawn: false
        });

        uint256 stakeIndex = userStakes[msg.sender].length;
        userStakes[msg.sender].push(newStake);

        // Update user info
        users[msg.sender].totalStaked += msg.value;
        users[msg.sender].stakeCount++;

        // Update global stats
        totalValueLocked += msg.value;

        if (!_isStaker[msg.sender]) {
            _isStaker[msg.sender] = true;
            totalStakers++;
        }

        emit Deposited(msg.sender, msg.value, lockDuration, stakeIndex);
    }

    /**
     * @notice Withdraws a specific stake with accrued rewards (if lock period has elapsed).
     * @param stakeIndex The index of the stake to withdraw.
     */
    function withdraw(uint256 stakeIndex) external nonReentrant {
        require(stakeIndex < userStakes[msg.sender].length, "Vault: invalid stake index");

        Stake storage stake = userStakes[msg.sender][stakeIndex];
        require(!stake.withdrawn, "Vault: already withdrawn");

        // Check lock period
        if (stake.lockDuration > 0) {
            require(
                block.timestamp >= stake.timestamp + stake.lockDuration,
                "Vault: stake still locked"
            );
        }

        // Calculate reward
        uint256 reward = _calculateReward(stake);

        stake.withdrawn = true;

        uint256 totalPayout = stake.amount + reward;

        // Update state
        users[msg.sender].totalStaked -= stake.amount;
        users[msg.sender].totalRewards += reward;
        totalValueLocked -= stake.amount;
        totalRewardsDistributed += reward;

        // Transfer funds
        (bool success, ) = msg.sender.call{value: totalPayout}("");
        require(success, "Vault: transfer failed");

        emit Withdrawn(msg.sender, stake.amount, reward, stakeIndex);
    }

    /**
     * @notice Emergency withdrawal — retrieves principal without rewards.
     *         Allows withdrawal even during lock period (forfeits rewards).
     * @param stakeIndex The index of the stake to withdraw.
     */
    function emergencyWithdraw(uint256 stakeIndex) external nonReentrant {
        require(stakeIndex < userStakes[msg.sender].length, "Vault: invalid stake index");

        Stake storage stake = userStakes[msg.sender][stakeIndex];
        require(!stake.withdrawn, "Vault: already withdrawn");

        uint256 amount = stake.amount;
        stake.withdrawn = true;

        // Update state (no rewards)
        users[msg.sender].totalStaked -= amount;
        totalValueLocked -= amount;

        // Transfer only principal
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Vault: transfer failed");

        emit EmergencyWithdraw(msg.sender, amount, stakeIndex);
    }

    // ═══════════════════════════════════════
    //  View Functions
    // ═══════════════════════════════════════

    /**
     * @notice Calculates the pending reward for a specific stake.
     * @param user The staker's address.
     * @param stakeIndex The index of the stake.
     * @return pendingReward The reward amount accrued.
     */
    function pendingReward(address user, uint256 stakeIndex) external view returns (uint256) {
        require(stakeIndex < userStakes[user].length, "Vault: invalid index");
        Stake storage stake = userStakes[user][stakeIndex];
        if (stake.withdrawn) return 0;
        return _calculateReward(stake);
    }

    /**
     * @notice Returns the time remaining until a stake can be withdrawn.
     * @param user The staker's address.
     * @param stakeIndex The index of the stake.
     * @return remaining Seconds remaining (0 if unlocked).
     */
    function timeUntilUnlock(address user, uint256 stakeIndex) external view returns (uint256) {
        require(stakeIndex < userStakes[user].length, "Vault: invalid index");
        Stake storage stake = userStakes[user][stakeIndex];

        if (stake.lockDuration == 0 || stake.withdrawn) return 0;

        uint256 unlockTime = stake.timestamp + stake.lockDuration;
        if (block.timestamp >= unlockTime) return 0;

        return unlockTime - block.timestamp;
    }

    /**
     * @notice Returns all stakes for a user.
     */
    function getUserStakes(address user) external view returns (Stake[] memory) {
        return userStakes[user];
    }

    /**
     * @notice Returns comprehensive vault information in a single call.
     */
    function vaultInfo() external view returns (
        uint256 _tvl,
        uint256 _totalRewards,
        uint256 _totalStakers,
        uint256 _flexRate,
        uint256 _30dRate,
        uint256 _90dRate,
        uint256 _180dRate,
        uint256 _minDeposit,
        bool _paused
    ) {
        return (
            totalValueLocked,
            totalRewardsDistributed,
            totalStakers,
            tierRewardRate[TIER_FLEXIBLE],
            tierRewardRate[TIER_30_DAYS],
            tierRewardRate[TIER_90_DAYS],
            tierRewardRate[TIER_180_DAYS],
            minDeposit,
            paused
        );
    }

    // ═══════════════════════════════════════
    //  Internal Reward Calculation
    // ═══════════════════════════════════════

    function _calculateReward(Stake storage stake) internal view returns (uint256) {
        if (stake.lockDuration == 0) {
            // Flexible: pro-rated reward based on time elapsed
            uint256 elapsed = block.timestamp - stake.timestamp;
            // Annual rate = rewardRate bps, so daily = rewardRate / 365
            // reward = amount * rate / 10000 * elapsed / 365 days
            return (stake.amount * stake.rewardRate * elapsed) / (10000 * 365 days);
        } else {
            // Fixed: full reward if lock period completed
            if (block.timestamp >= stake.timestamp + stake.lockDuration) {
                return (stake.amount * stake.rewardRate) / 10000;
            }
            // Partial reward if not yet completed (pro-rated)
            uint256 elapsed = block.timestamp - stake.timestamp;
            return (stake.amount * stake.rewardRate * elapsed) / (10000 * stake.lockDuration);
        }
    }

    // ═══════════════════════════════════════
    //  Owner Functions
    // ═══════════════════════════════════════

    function setRewardRate(uint256 tier, uint256 rate) external onlyOwner {
        tierRewardRate[tier] = rate;
        emit RewardRateUpdated(tier, rate);
    }

    function setMinDeposit(uint256 _minDeposit) external onlyOwner {
        minDeposit = _minDeposit;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice Allows the owner to fund the vault with reward liquidity.
     */
    function fundRewards() external payable onlyOwner {
        require(msg.value > 0, "Vault: zero funding");
    }

    /**
     * @notice Allows owner to withdraw excess contract balance (beyond TVL).
     */
    function withdrawExcess() external onlyOwner {
        uint256 excess = address(this).balance - totalValueLocked;
        require(excess > 0, "Vault: no excess balance");
        (bool success, ) = owner.call{value: excess}("");
        require(success, "Vault: transfer failed");
    }

    /**
     * @notice Transfers contract ownership.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Vault: zero address");
        owner = newOwner;
    }

    // Accept direct ETH transfers (for reward funding)
    receive() external payable {}
}
