const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CryptoVerseVault", function () {
  let Vault;
  let vault;
  let owner;
  let addr1;
  const minDeposit = ethers.parseEther("0.001");

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    Vault = await ethers.getContractFactory("CryptoVerseVault");
    vault = await Vault.deploy();
    
    // Fund the vault for rewards
    await owner.sendTransaction({
      to: await vault.getAddress(),
      value: ethers.parseEther("10")
    });
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("Should set the initial reward rates", async function () {
      expect(await vault.tierRewardRate(0)).to.equal(50); // Flexible
      expect(await vault.tierRewardRate(30 * 24 * 60 * 60)).to.equal(200); // 30 days
    });
  });

  describe("Deposits", function () {
    it("Should allow flexible deposits", async function () {
      const amount = ethers.parseEther("1");
      await vault.connect(addr1).deposit(0, { value: amount });
      
      const userInfo = await vault.users(addr1.address);
      expect(userInfo.totalStaked).to.equal(amount);
      expect(await vault.totalValueLocked()).to.equal(amount);
    });

    it("Should fail if deposit is below minimum", async function () {
      await expect(
        vault.connect(addr1).deposit(0, { value: ethers.parseEther("0.0001") })
      ).to.be.revertedWith("Vault: below minimum deposit");
    });

    it("Should fail for invalid lock duration", async function () {
      await expect(
        vault.connect(addr1).deposit(100, { value: minDeposit })
      ).to.be.revertedWith("Vault: invalid lock duration");
    });
  });

  describe("Withdrawals", function () {
    it("Should allow flexible withdrawals at any time", async function () {
      const amount = ethers.parseEther("1");
      await vault.connect(addr1).deposit(0, { value: amount });
      
      // Fast forward time slightly to earn rewards
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 1 day
      await ethers.provider.send("evm_mine");

      const initialBalance = await ethers.provider.getBalance(addr1.address);
      const tx = await vault.connect(addr1).withdraw(0);
      const receipt = await tx.wait();
      const gasSpent = receipt.gasUsed * receipt.gasPrice;

      const finalBalance = await ethers.provider.getBalance(addr1.address);
      expect(finalBalance).to.be.gt(initialBalance - gasSpent + amount);
    });

    it("Should fail to withdraw locked stake early", async function () {
      const amount = ethers.parseEther("1");
      const thirtyDays = 30 * 24 * 60 * 60;
      await vault.connect(addr1).deposit(thirtyDays, { value: amount });
      
      await expect(
        vault.connect(addr1).withdraw(0)
      ).to.be.revertedWith("Vault: stake still locked");
    });

    it("Should allow locked withdrawal after lock period", async function () {
        const amount = ethers.parseEther("1");
        const thirtyDays = 30 * 24 * 60 * 60;
        await vault.connect(addr1).deposit(thirtyDays, { value: amount });
        
        await ethers.provider.send("evm_increaseTime", [thirtyDays + 1]);
        await ethers.provider.send("evm_mine");

        await expect(vault.connect(addr1).withdraw(0)).to.not.be.reverted;
    });

    it("Should allow emergency withdrawal (forfeit rewards)", async function () {
      const amount = ethers.parseEther("1");
      const thirtyDays = 30 * 24 * 60 * 60;
      await vault.connect(addr1).deposit(thirtyDays, { value: amount });
      
      const initialBalance = await ethers.provider.getBalance(addr1.address);
      const tx = await vault.connect(addr1).emergencyWithdraw(0);
      const receipt = await tx.wait();
      const gasSpent = receipt.gasUsed * receipt.gasPrice;

      const finalBalance = await ethers.provider.getBalance(addr1.address);
      // Final balance should be initial - gas + principal exactly (no rewards)
      expect(finalBalance).to.equal(initialBalance - gasSpent + amount);
    });
  });

  describe("Vault Management", function () {
    it("Should allow owner to set reward rates", async function () {
      await vault.setRewardRate(0, 100);
      expect(await vault.tierRewardRate(0)).to.equal(100);
    });

    it("Should allow owner to pause and unpause", async function () {
      await vault.pause();
      await expect(
        vault.connect(addr1).deposit(0, { value: minDeposit })
      ).to.be.revertedWith("Vault: contract is paused");

      await vault.unpause();
      await vault.connect(addr1).deposit(0, { value: minDeposit });
    });
  });
});
