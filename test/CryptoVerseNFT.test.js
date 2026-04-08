const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CryptoVerseNFT", function () {
  let NFT;
  let nft;
  let owner;
  let addr1;
  let addr2;
  const mintPrice = ethers.parseEther("0.1");

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    NFT = await ethers.getContractFactory("CryptoVerseNFT");
    nft = await NFT.deploy(mintPrice);
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await nft.owner()).to.equal(owner.address);
    });

    it("Should set the correct mint price", async function () {
      expect(await nft.mintPrice()).to.equal(mintPrice);
    });
  });

  describe("Minting", function () {
    it("Should allow minting with correct payment", async function () {
      await nft.connect(addr1).mint({ value: mintPrice });
      expect(await nft.balanceOf(addr1.address)).to.equal(1);
      expect(await nft.ownerOf(1)).to.equal(addr1.address);
    });

    it("Should fail if payment is insufficient", async function () {
      await expect(
        nft.connect(addr1).mint({ value: ethers.parseEther("0.05") })
      ).to.be.revertedWith("CVNFT: insufficient payment");
    });

    it("Should allow owner to mint for free", async function () {
      await nft.ownerMint(addr2.address, 5);
      expect(await nft.balanceOf(addr2.address)).to.equal(5);
    });
  });

  describe("Transfers and Safe Transfers", function () {
    beforeEach(async function () {
      await nft.connect(addr1).mint({ value: mintPrice });
    });

    it("Should transfer between EOAs", async function () {
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 1);
      expect(await nft.ownerOf(1)).to.equal(addr2.address);
    });

    it("Should safeTransfer between EOAs", async function () {
      await nft.connect(addr1).safeTransferFrom(addr1.address, addr2.address, 1);
      expect(await nft.ownerOf(1)).to.equal(addr2.address);
    });

    it("Should fail to safeTransfer to a contract that doesn't support ERC721Receiver", async function () {
        // CryptoVerseToken doesn't implement onERC721Received
        const Token = await ethers.getContractFactory("CryptoVerseToken");
        const token = await Token.deploy(0, 100);
        const tokenAddress = await token.getAddress();

        await expect(
            nft.connect(addr1).safeTransferFrom(addr1.address, tokenAddress, 1)
        ).to.be.revertedWith("CVNFT: transfer to non ERC721Receiver implementer");
    });
  });

  describe("Metadata", function () {
    it("Should return a valid tokenURI", async function () {
      await nft.connect(addr1).mint({ value: mintPrice });
      const uri = await nft.tokenURI(1);
      expect(uri).to.contain("data:application/json;base64,");
    });
  });

  describe("Withdrawal", function () {
    it("Should allow owner to withdraw balance", async function () {
      await nft.connect(addr1).mint({ value: mintPrice });
      const initialOwnerBalance = await ethers.provider.getBalance(owner.address);
      
      const tx = await nft.withdraw();
      const receipt = await tx.wait();
      const gasSpent = receipt.gasUsed * receipt.gasPrice;

      const finalOwnerBalance = await ethers.provider.getBalance(owner.address);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance + mintPrice - gasSpent);
    });
  });
});
