// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CryptoVerseToken (CVT)
 * @author CryptoVerse
 * @notice A custom ERC-20 token implementation built from scratch.
 *         Demonstrates Solidity fundamentals: mappings, modifiers, events,
 *         access control, and the complete ERC-20 interface.
 * @dev Fully ERC-20 compliant without external dependencies.
 *      Designed for deployment on any EVM chain including Manta Pacific L2.
 */
contract CryptoVerseToken {

    // ═══════════════════════════════════════
    //  Token Metadata
    // ═══════════════════════════════════════
    string public constant name = "CryptoVerse Token";
    string public constant symbol = "CVT";
    uint8  public constant decimals = 18;

    // ═══════════════════════════════════════
    //  State Variables
    // ═══════════════════════════════════════
    uint256 public totalSupply;
    uint256 public maxSupply;
    address public owner;
    bool    public paused;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    // Minting records for transparency
    uint256 public totalMinted;
    uint256 public totalBurned;

    // ═══════════════════════════════════════
    //  Events (ERC-20 Standard + Custom)
    // ═══════════════════════════════════════
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed to, uint256 amount, uint256 newTotalSupply);
    event Burn(address indexed from, uint256 amount, uint256 newTotalSupply);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address account);
    event Unpaused(address account);

    // ═══════════════════════════════════════
    //  Modifiers
    // ═══════════════════════════════════════
    modifier onlyOwner() {
        require(msg.sender == owner, "CVT: caller is not the owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "CVT: token transfers are paused");
        _;
    }

    modifier validAddress(address _addr) {
        require(_addr != address(0), "CVT: zero address not allowed");
        _;
    }

    // ═══════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════
    /**
     * @notice Deploys the CryptoVerse Token with an initial supply minted to the deployer.
     * @param _initialSupply The number of tokens (in whole units) to mint at deployment.
     * @param _maxSupply The maximum number of tokens (in whole units) that can ever exist.
     */
    constructor(uint256 _initialSupply, uint256 _maxSupply) {
        require(_maxSupply >= _initialSupply, "CVT: max supply must be >= initial supply");

        owner = msg.sender;
        maxSupply = _maxSupply * (10 ** decimals);

        if (_initialSupply > 0) {
            uint256 initialAmount = _initialSupply * (10 ** decimals);
            _balances[msg.sender] = initialAmount;
            totalSupply = initialAmount;
            totalMinted = initialAmount;

            emit Transfer(address(0), msg.sender, initialAmount);
            emit Mint(msg.sender, initialAmount, totalSupply);
        }
    }

    // ═══════════════════════════════════════
    //  ERC-20 Standard Functions
    // ═══════════════════════════════════════

    /**
     * @notice Returns the token balance of a given address.
     */
    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    /**
     * @notice Transfers tokens from the caller to a recipient.
     * @param to The recipient address.
     * @param amount The amount of tokens to transfer.
     * @return success True if the transfer was successful.
     */
    function transfer(address to, uint256 amount)
        public
        whenNotPaused
        validAddress(to)
        returns (bool success)
    {
        require(_balances[msg.sender] >= amount, "CVT: insufficient balance");

        _balances[msg.sender] -= amount;
        _balances[to] += amount;

        emit Transfer(msg.sender, to, amount);
        return true;
    }

    /**
     * @notice Returns the remaining number of tokens that spender is allowed to spend.
     */
    function allowance(address _owner, address spender) public view returns (uint256) {
        return _allowances[_owner][spender];
    }

    /**
     * @notice Sets the amount of tokens that spender is allowed to spend on behalf of the caller.
     * @dev To mitigate the race condition, it is recommended to use increaseAllowance
     *      and decreaseAllowance instead of this function.
     * @param spender The address authorized to spend.
     * @param amount The maximum amount they can spend.
     * @return success True if approval was successful.
     */
    function approve(address spender, uint256 amount)
        public
        validAddress(spender)
        returns (bool success)
    {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /**
     * @notice Atomically increases the allowance granted to `spender` by the caller.
     */
    function increaseAllowance(address spender, uint256 addedValue)
        public
        validAddress(spender)
        returns (bool)
    {
        _allowances[msg.sender][spender] += addedValue;
        emit Approval(msg.sender, spender, _allowances[msg.sender][spender]);
        return true;
    }

    /**
     * @notice Atomically decreases the allowance granted to `spender` by the caller.
     */
    function decreaseAllowance(address spender, uint256 subtractedValue)
        public
        validAddress(spender)
        returns (bool)
    {
        uint256 currentAllowance = _allowances[msg.sender][spender];
        require(currentAllowance >= subtractedValue, "CVT: decreased allowance below zero");
        
        unchecked {
            _allowances[msg.sender][spender] = currentAllowance - subtractedValue;
        }
        
        emit Approval(msg.sender, spender, _allowances[msg.sender][spender]);
        return true;
    }

    /**
     * @notice Transfers tokens from one address to another using the allowance mechanism.
     * @param from The address to transfer from.
     * @param to The address to transfer to.
     * @param amount The amount to transfer.
     * @return success True if the transfer was successful.
     */
    function transferFrom(address from, address to, uint256 amount)
        public
        whenNotPaused
        validAddress(to)
        returns (bool success)
    {
        require(_balances[from] >= amount, "CVT: insufficient balance");
        require(_allowances[from][msg.sender] >= amount, "CVT: insufficient allowance");

        _balances[from] -= amount;
        _balances[to] += amount;
        _allowances[from][msg.sender] -= amount;

        emit Transfer(from, to, amount);
        return true;
    }

    // ═══════════════════════════════════════
    //  Minting & Burning
    // ═══════════════════════════════════════

    /**
     * @notice Mints new tokens to a specified address. Only callable by the owner.
     * @param to The recipient of the newly minted tokens.
     * @param amount The amount of tokens to mint (in smallest units).
     */
    function mint(address to, uint256 amount)
        external
        onlyOwner
        validAddress(to)
    {
        require(totalSupply + amount <= maxSupply, "CVT: would exceed max supply");

        _balances[to] += amount;
        totalSupply += amount;
        totalMinted += amount;

        emit Transfer(address(0), to, amount);
        emit Mint(to, amount, totalSupply);
    }

    /**
     * @notice Burns tokens from the caller's balance, permanently reducing supply.
     * @param amount The amount of tokens to burn.
     */
    function burn(uint256 amount) external {
        require(_balances[msg.sender] >= amount, "CVT: burn amount exceeds balance");

        _balances[msg.sender] -= amount;
        totalSupply -= amount;
        totalBurned += amount;

        emit Transfer(msg.sender, address(0), amount);
        emit Burn(msg.sender, amount, totalSupply);
    }

    /**
     * @notice Burns tokens from a specified address using the allowance mechanism.
     * @param from The address whose tokens will be burned.
     * @param amount The amount to burn.
     */
    function burnFrom(address from, uint256 amount) external {
        require(_balances[from] >= amount, "CVT: burn amount exceeds balance");
        require(_allowances[from][msg.sender] >= amount, "CVT: burn amount exceeds allowance");

        _balances[from] -= amount;
        _allowances[from][msg.sender] -= amount;
        totalSupply -= amount;
        totalBurned += amount;

        emit Transfer(from, address(0), amount);
        emit Burn(from, amount, totalSupply);
    }

    // ═══════════════════════════════════════
    //  Owner Functions
    // ═══════════════════════════════════════

    /**
     * @notice Transfers ownership of the contract to a new account.
     */
    function transferOwnership(address newOwner)
        external
        onlyOwner
        validAddress(newOwner)
    {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice Pauses all token transfers. Emergency use only.
     */
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice Unpauses token transfers.
     */
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ═══════════════════════════════════════
    //  View Helpers
    // ═══════════════════════════════════════

    /**
     * @notice Returns comprehensive token information in a single call.
     */
    function tokenInfo() external view returns (
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _totalSupply,
        uint256 _maxSupply,
        uint256 _totalMinted,
        uint256 _totalBurned,
        address _owner,
        bool _paused
    ) {
        return (name, symbol, decimals, totalSupply, maxSupply, totalMinted, totalBurned, owner, paused);
    }
}
