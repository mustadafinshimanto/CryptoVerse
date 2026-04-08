// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CryptoVerseNFT
 * @author CryptoVerse
 * @notice A custom ERC-721 NFT contract with fully on-chain SVG art generation.
 *         Each NFT has unique, deterministic generative art stored entirely on-chain.
 * @dev Implements ERC-721 and ERC-721Metadata from scratch.
 *      No external dependencies — demonstrates deep Solidity knowledge.
 *      Compatible with Manta Pacific L2 and any EVM chain.
 */
contract CryptoVerseNFT {

    // ═══════════════════════════════════════
    //  Token Metadata
    // ═══════════════════════════════════════
    string public constant name = "CryptoVerse Genesis";
    string public constant symbol = "CVNFT";

    // ═══════════════════════════════════════
    //  State Variables
    // ═══════════════════════════════════════
    uint256 public totalSupply;
    uint256 public constant MAX_SUPPLY = 1000;
    uint256 public mintPrice;
    address public owner;

    // Token ownership
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;

    // Approvals
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // Token enumeration (owner -> index -> tokenId)
    mapping(address => mapping(uint256 => uint256)) private _ownedTokens;
    mapping(uint256 => uint256) private _ownedTokensIndex;

    // On-chain art seed per token
    mapping(uint256 => uint256) private _tokenSeeds;

    // ═══════════════════════════════════════
    //  Events (ERC-721 Standard)
    // ═══════════════════════════════════════
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    // ═══════════════════════════════════════
    //  ERC-165 Interface Support
    // ═══════════════════════════════════════
    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return
            interfaceId == 0x80ac58cd || // ERC-721
            interfaceId == 0x5b5e139f || // ERC-721 Metadata
            interfaceId == 0x01ffc9a7;   // ERC-165
    }

    // ═══════════════════════════════════════
    //  Modifiers
    // ═══════════════════════════════════════
    modifier onlyOwner() {
        require(msg.sender == owner, "CVNFT: not contract owner");
        _;
    }

    modifier tokenExists(uint256 tokenId) {
        require(_owners[tokenId] != address(0), "CVNFT: token does not exist");
        _;
    }

    // ═══════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════
    constructor(uint256 _mintPrice) {
        owner = msg.sender;
        mintPrice = _mintPrice;
    }

    // ═══════════════════════════════════════
    //  ERC-721 Core Functions
    // ═══════════════════════════════════════

    function balanceOf(address _owner) public view returns (uint256) {
        require(_owner != address(0), "CVNFT: zero address query");
        return _balances[_owner];
    }

    function ownerOf(uint256 tokenId) public view tokenExists(tokenId) returns (address) {
        return _owners[tokenId];
    }

    function approve(address to, uint256 tokenId) public {
        address tokenOwner = ownerOf(tokenId);
        require(to != tokenOwner, "CVNFT: approval to current owner");
        require(
            msg.sender == tokenOwner || isApprovedForAll(tokenOwner, msg.sender),
            "CVNFT: not authorized"
        );
        _tokenApprovals[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    function getApproved(uint256 tokenId) public view tokenExists(tokenId) returns (address) {
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) public {
        require(operator != msg.sender, "CVNFT: approve to self");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address _owner, address operator) public view returns (bool) {
        return _operatorApprovals[_owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "CVNFT: not authorized");
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) public {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, data), "CVNFT: transfer to non ERC721Receiver implementer");
    }

    /**
     * @dev Internal function to invoke {IERC721Receiver-onERC721Received} on a target address.
     * The call is not executed if the target address is not a contract.
     */
    function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory data)
        private returns (bool)
    {
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 retval) {
                return retval == IERC721Receiver.onERC721Received.selector;
            } catch (bytes memory reason) {
                if (reason.length == 0) {
                    revert("CVNFT: transfer to non ERC721Receiver implementer");
                } else {
                    assembly {
                        revert(add(32, reason), mload(reason))
                    }
                }
            }
        } else {
            return true;
        }
    }

    // ═══════════════════════════════════════
    //  Minting
    // ═══════════════════════════════════════

    /**
     * @notice Mints a new NFT with unique on-chain generative art.
     * @dev The art seed is derived from block data + sender + tokenId for uniqueness.
     */
    function mint() external payable {
        require(totalSupply < MAX_SUPPLY, "CVNFT: max supply reached");
        require(msg.value >= mintPrice, "CVNFT: insufficient payment");

        uint256 tokenId = totalSupply + 1;
        totalSupply++;

        // Generate unique art seed from on-chain entropy
        _tokenSeeds[tokenId] = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            tokenId,
            blockhash(block.number - 1)
        )));

        _balances[msg.sender]++;
        _owners[tokenId] = msg.sender;

        // Update enumeration
        uint256 index = _balances[msg.sender] - 1;
        _ownedTokens[msg.sender][index] = tokenId;
        _ownedTokensIndex[tokenId] = index;

        emit Transfer(address(0), msg.sender, tokenId);
    }

    /**
     * @notice Owner can mint without paying (for airdrops/testing).
     */
    function ownerMint(address to, uint256 count) external onlyOwner {
        require(totalSupply + count <= MAX_SUPPLY, "CVNFT: would exceed max supply");

        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = totalSupply + 1;
            totalSupply++;

            _tokenSeeds[tokenId] = uint256(keccak256(abi.encodePacked(
                block.timestamp, msg.sender, tokenId, i
            )));

            _balances[to]++;
            _owners[tokenId] = to;

            uint256 index = _balances[to] - 1;
            _ownedTokens[to][index] = tokenId;
            _ownedTokensIndex[tokenId] = index;

            emit Transfer(address(0), to, tokenId);
        }
    }

    // ═══════════════════════════════════════
    //  On-Chain Metadata & SVG Art
    // ═══════════════════════════════════════

    /**
     * @notice Returns the fully on-chain token URI with base64-encoded SVG art.
     * @dev No IPFS or external storage needed — everything is generated on-chain.
     */
    function tokenURI(uint256 tokenId) public view tokenExists(tokenId) returns (string memory) {
        uint256 seed = _tokenSeeds[tokenId];

        // Generate deterministic color palette from seed
        string memory primaryHue = _uint2str((seed % 360));
        string memory secondaryHue = _uint2str(((seed / 360) % 360));
        string memory tertiaryHue = _uint2str(((seed / 129600) % 360));

        // Determine shape pattern (0-3)
        uint256 pattern = (seed / 46656000) % 4;

        // Build SVG art
        string memory svg = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
            '<defs>',
            '<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
            '<stop offset="0%" stop-color="hsl(', primaryHue, ',70%,8%)"/>',
            '<stop offset="100%" stop-color="hsl(', secondaryHue, ',60%,15%)"/>',
            '</linearGradient>',
            '<linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">',
            '<stop offset="0%" stop-color="hsl(', primaryHue, ',80%,60%)"/>',
            '<stop offset="100%" stop-color="hsl(', tertiaryHue, ',70%,50%)"/>',
            '</linearGradient>',
            '</defs>',
            '<rect width="400" height="400" fill="url(#bg)"/>',
            _generatePattern(seed, pattern, primaryHue, secondaryHue, tertiaryHue),
            _generateCenterpiece(seed, primaryHue),
            '<text x="200" y="370" text-anchor="middle" fill="rgba(255,255,255,0.4)" ',
            'font-family="monospace" font-size="12">CryptoVerse Genesis #',
            _uint2str(tokenId),
            '</text></svg>'
        ));

        // Build JSON metadata
        string memory json = string(abi.encodePacked(
            '{"name":"CryptoVerse Genesis #', _uint2str(tokenId),
            '","description":"Fully on-chain generative art NFT from the CryptoVerse collection. Each piece is unique and stored entirely on the blockchain.",',
            '"image":"data:image/svg+xml;base64,', _base64Encode(bytes(svg)),
            '","attributes":[',
            '{"trait_type":"Pattern","value":"', _patternName(pattern), '"},',
            '{"trait_type":"Primary Hue","value":"', primaryHue, '"},',
            '{"trait_type":"Secondary Hue","value":"', secondaryHue, '"},',
            '{"trait_type":"Seed","value":"', _uint2str(seed % 1000000), '"}',
            ']}'
        ));

        return string(abi.encodePacked(
            "data:application/json;base64,",
            _base64Encode(bytes(json))
        ));
    }

    // ═══════════════════════════════════════
    //  SVG Generation Helpers (Internal)
    // ═══════════════════════════════════════

    function _generatePattern(
        uint256 seed,
        uint256 pattern,
        string memory h1,
        string memory h2,
        string memory h3
    ) internal pure returns (string memory) {
        if (pattern == 0) return _concentricCircles(seed, h1, h2);
        if (pattern == 1) return _gridPattern(seed, h1, h3);
        if (pattern == 2) return _diagonalLines(seed, h2, h3);
        return _orbitalRings(seed, h1, h2, h3);
    }

    function _concentricCircles(uint256 seed, string memory h1, string memory h2)
        internal pure returns (string memory)
    {
        uint256 count = 3 + (seed % 4);
        bytes memory circles;
        for (uint256 i = 0; i < count; i++) {
            uint256 r = 160 - (i * 30);
            string memory hue = i % 2 == 0 ? h1 : h2;
            uint256 opacity = 10 + (i * 5);
            circles = abi.encodePacked(circles,
                '<circle cx="200" cy="200" r="', _uint2str(r),
                '" fill="none" stroke="hsl(', hue, ',70%,60%)" stroke-width="1" opacity="0.',
                _uint2str(opacity), '"/>'
            );
        }
        return string(circles);
    }

    function _gridPattern(uint256 seed, string memory h1, string memory h3)
        internal pure returns (string memory)
    {
        bytes memory grid;
        uint256 spacing = 40 + (seed % 20);
        for (uint256 x = spacing; x < 400; x += spacing) {
            grid = abi.encodePacked(grid,
                '<line x1="', _uint2str(x), '" y1="0" x2="', _uint2str(x),
                '" y2="400" stroke="hsl(', h1, ',60%,50%)" stroke-width="0.5" opacity="0.15"/>'
            );
        }
        for (uint256 y = spacing; y < 400; y += spacing) {
            grid = abi.encodePacked(grid,
                '<line x1="0" y1="', _uint2str(y), '" x2="400" y2="', _uint2str(y),
                '" stroke="hsl(', h3, ',60%,50%)" stroke-width="0.5" opacity="0.15"/>'
            );
        }
        return string(grid);
    }

    function _diagonalLines(uint256 seed, string memory h2, string memory h3)
        internal pure returns (string memory)
    {
        bytes memory lines;
        uint256 count = 5 + (seed % 6);
        for (uint256 i = 0; i < count; i++) {
            uint256 offset = (i * 70) % 400;
            string memory hue = i % 2 == 0 ? h2 : h3;
            lines = abi.encodePacked(lines,
                '<line x1="0" y1="', _uint2str(offset),
                '" x2="400" y2="', _uint2str((offset + 200) % 400),
                '" stroke="hsl(', hue, ',60%,50%)" stroke-width="1" opacity="0.2"/>'
            );
        }
        return string(lines);
    }

    function _orbitalRings(uint256 seed, string memory h1, string memory h2, string memory h3)
        internal pure returns (string memory)
    {
        string[3] memory hues = [h1, h2, h3];
        bytes memory rings;
        for (uint256 i = 0; i < 3; i++) {
            uint256 rx = 80 + (((seed >> (i * 8)) % 60));
            uint256 ry = 50 + (((seed >> (i * 8 + 4)) % 40));
            rings = abi.encodePacked(rings,
                '<ellipse cx="200" cy="200" rx="', _uint2str(rx),
                '" ry="', _uint2str(ry),
                '" fill="none" stroke="hsl(', hues[i],
                ',70%,55%)" stroke-width="1.5" opacity="0.3" transform="rotate(',
                _uint2str((i * 60) + (seed % 30)), ' 200 200)"/>'
            );
        }
        return string(rings);
    }

    function _generateCenterpiece(uint256 seed, string memory hue)
        internal pure returns (string memory)
    {
        uint256 size = 30 + (seed % 30);
        return string(abi.encodePacked(
            '<polygon points="200,', _uint2str(200 - size),
            ' ', _uint2str(200 + size), ',200 200,', _uint2str(200 + size),
            ' ', _uint2str(200 - size), ',200" fill="url(#accent)" opacity="0.6"/>',
            '<polygon points="200,', _uint2str(200 - size + 10),
            ' ', _uint2str(200 + size - 10), ',200 200,', _uint2str(200 + size - 10),
            ' ', _uint2str(200 - size + 10), ',200" fill="hsl(', hue, ',80%,70%)" opacity="0.3"/>'
        ));
    }

    function _patternName(uint256 pattern) internal pure returns (string memory) {
        if (pattern == 0) return "Concentric";
        if (pattern == 1) return "Grid";
        if (pattern == 2) return "Diagonal";
        return "Orbital";
    }

    // ═══════════════════════════════════════
    //  Internal Transfer Logic
    // ═══════════════════════════════════════

    function _transfer(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "CVNFT: transfer from incorrect owner");
        require(to != address(0), "CVNFT: transfer to zero address");

        // Clear approvals
        _tokenApprovals[tokenId] = address(0);

        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address tokenOwner = ownerOf(tokenId);
        return (
            spender == tokenOwner ||
            getApproved(tokenId) == spender ||
            isApprovedForAll(tokenOwner, spender)
        );
    }

    // ═══════════════════════════════════════
    //  Owner Functions
    // ═══════════════════════════════════════

    function setMintPrice(uint256 _price) external onlyOwner {
        mintPrice = _price;
    }

    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "CVNFT: no balance to withdraw");
        (bool success, ) = owner.call{value: balance}("");
        require(success, "CVNFT: withdrawal failed");
    }

    // ═══════════════════════════════════════
    //  Enumeration (per owner)
    // ═══════════════════════════════════════

    function tokenOfOwnerByIndex(address _owner, uint256 index) public view returns (uint256) {
        require(index < balanceOf(_owner), "CVNFT: index out of bounds");
        return _ownedTokens[_owner][index];
    }

    // ═══════════════════════════════════════
    //  Utility Functions
    // ═══════════════════════════════════════

    function _uint2str(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function _base64Encode(bytes memory data) internal pure returns (string memory) {
        bytes memory TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        if (data.length == 0) return "";

        uint256 encodedLen = 4 * ((data.length + 2) / 3);
        bytes memory result = new bytes(encodedLen);

        uint256 i;
        uint256 j;
        for (i = 0; i + 2 < data.length; i += 3) {
            uint256 val = (uint256(uint8(data[i])) << 16) |
                          (uint256(uint8(data[i + 1])) << 8) |
                          uint256(uint8(data[i + 2]));
            result[j++] = TABLE[(val >> 18) & 0x3F];
            result[j++] = TABLE[(val >> 12) & 0x3F];
            result[j++] = TABLE[(val >> 6) & 0x3F];
            result[j++] = TABLE[val & 0x3F];
        }

        if (data.length % 3 == 1) {
            uint256 val = uint256(uint8(data[i])) << 16;
            result[j++] = TABLE[(val >> 18) & 0x3F];
            result[j++] = TABLE[(val >> 12) & 0x3F];
            result[j++] = bytes1("=");
            result[j++] = bytes1("=");
        } else if (data.length % 3 == 2) {
            uint256 val = (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i + 1])) << 8);
            result[j++] = TABLE[(val >> 18) & 0x3F];
            result[j++] = TABLE[(val >> 12) & 0x3F];
            result[j++] = TABLE[(val >> 6) & 0x3F];
            result[j++] = bytes1("=");
        }

        return string(result);
    }

    /**
     * @notice Returns the art seed for a given token.
     */
    function getTokenSeed(uint256 tokenId) external view tokenExists(tokenId) returns (uint256) {
        return _tokenSeeds[tokenId];
    }
}

/**
 * @title IERC721Receiver interface
 * @dev Interface for any contract that wants to support safeTransfers from ERC721 asset contracts.
 */
interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}
