const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CryptoVerseToken", function () {
  let Token;
  let token;
  let owner;
  let addr1;
  let addr2;
  const initialSupply = 1000;
  const maxSupply = 10000;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    Token = await ethers.getContractFactory("CryptoVerseToken");
    token = await Token.deploy(initialSupply, maxSupply);
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("Should assign the initial supply to the owner", async function () {
      const ownerBalance = await token.balanceOf(owner.address);
      const decimals = await token.decimals();
      expect(ownerBalance).to.equal(ethers.parseUnits(initialSupply.toString(), decimals));
    });

    it("Should set the correct max supply", async function () {
      const decimals = await token.decimals();
      expect(await token.maxSupply()).to.equal(ethers.parseUnits(maxSupply.toString(), decimals));
    });
  });

  describe("Transactions", function () {
    it("Should transfer tokens between accounts", async function () {
      const decimals = await token.decimals();
      const amount = ethers.parseUnits("50", decimals);
      await token.transfer(addr1.address, amount);
      expect(await token.balanceOf(addr1.address)).to.equal(amount);

      await token.connect(addr1).transfer(addr2.address, amount);
      expect(await token.balanceOf(addr2.address)).to.equal(amount);
    });

    it("Should fail if sender doesn't have enough tokens", async function () {
      const initialOwnerBalance = await token.balanceOf(owner.address);
      await expect(
        token.connect(addr1).transfer(owner.address, 1)
      ).to.be.revertedWith("CVT: insufficient balance");

      expect(await token.balanceOf(owner.address)).to.equal(initialOwnerBalance);
    });
  });

  describe("Allowances", function () {
    it("Should update allowance after approve", async function () {
      await token.approve(addr1.address, 100);
      expect(await token.allowance(owner.address, addr1.address)).to.equal(100);
    });

    it("Should increase and decrease allowance", async function () {
      await token.approve(addr1.address, 100);
      await token.increaseAllowance(addr1.address, 50);
      expect(await token.allowance(owner.address, addr1.address)).to.equal(150);

      await token.decreaseAllowance(addr1.address, 30);
      expect(await token.allowance(owner.address, addr1.address)).to.equal(120);
    });

    it("Should fail to decrease allowance below zero", async function () {
      await token.approve(addr1.address, 10);
      await expect(
        token.decreaseAllowance(addr1.address, 20)
      ).to.be.revertedWith("CVT: decreased allowance below zero");
    });
  });

  describe("Minting and Burning", function () {
    it("Should allow owner to mint tokens", async function () {
      const amount = 500;
      await token.mint(addr1.address, amount);
      expect(await token.balanceOf(addr1.address)).to.equal(amount);
    });

    it("Should fail if non-owner tries to mint", async function () {
      await expect(
        token.connect(addr1).mint(addr1.address, 100)
      ).to.be.revertedWith("CVT: caller is not the owner");
    });

    it("Should fail if minting exceeds max supply", async function () {
      const decimals = await token.decimals();
      const max = await token.maxSupply();
      const current = await token.totalSupply();
      const tooMuch = max - current + 1n;
      await expect(
        token.mint(owner.address, tooMuch)
      ).to.be.revertedWith("CVT: would exceed max supply");
    });

    it("Should allow anyone to burn their own tokens", async function () {
      const amount = 100;
      const initialTotalSupply = await token.totalSupply();
      await token.burn(amount);
      expect(await token.totalSupply()).to.equal(initialTotalSupply - BigInt(amount));
    });
  });

  describe("Pausable", function () {
    it("Should pause and unpause transfers", async function () {
      await token.pause();
      await expect(token.transfer(addr1.address, 100)).to.be.revertedWith("CVT: token transfers are paused");
      
      await token.unpause();
      await token.transfer(addr1.address, 100);
      expect(await token.balanceOf(addr1.address)).to.equal(100);
    });

    it("Should only allow owner to pause/unpause", async function () {
      await expect(token.connect(addr1).pause()).to.be.revertedWith("CVT: caller is not the owner");
    });
  });
});
