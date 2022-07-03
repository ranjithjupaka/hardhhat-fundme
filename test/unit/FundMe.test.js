const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("FundMe", () => {
      let FundMe, mockV3Aggregator, deployer
      const sendVal = ethers.utils.parseEther("1")
      beforeEach(async () => {
        // const accounts = await ethers.getSigners()
        // deployer = accounts[0]
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"])
        FundMe = await ethers.getContract("FundMe", deployer)
        mockV3Aggregator = await ethers.getContract(
          "MockV3Aggregator",
          deployer
        )
      })

      describe("constructor", async () => {
        it("sets the aggregator address correctly", async () => {
          const response = await FundMe.getPriceFeed()
          assert.equal(response, mockV3Aggregator.address)
        })
      })

      describe("fund", async () => {
        it("Fails if we dont send enough ether", async () => {
          await expect(FundMe.fund()).to.be.revertedWith(
            "You need to spend more ETH!"
          )
        })

        it("updates the funded amount data structure", async () => {
          await FundMe.fund({ value: sendVal })
          const response = await FundMe.getAddressToAmountFunded(deployer)
          assert.equal(response.toString(), sendVal.toString())
        })

        it("updates the funders array", async () => {
          await FundMe.fund({ value: sendVal })
          const response = await FundMe.getFunder(0)
          assert.equal(response, deployer)
        })
      })

      describe("withdraw", async () => {
        beforeEach(async () => {
          await FundMe.fund({ value: sendVal })
        })

        it("allows only owner to withdraw", async () => {
          const accounts = await ethers.getSigners()
          const FundMeConnectedContract = await FundMe.connect(accounts[1])
          await expect(FundMeConnectedContract.withdraw()).to.be.revertedWith(
            "Only owner can withdraw"
          )
        })

        it("withdraw from single funder", async () => {
          const startingFundMeBalance = await FundMe.provider.getBalance(
            FundMe.address
          )
          const startingDeployerBalance = await FundMe.provider.getBalance(
            deployer
          )

          const transResponse = await FundMe.withdraw()
          const transReceipt = await transResponse.wait()
          const { gasUsed, effectiveGasPrice } = transReceipt
          const gasCost = gasUsed.mul(effectiveGasPrice)

          const finalFundMeBalance = await FundMe.provider.getBalance(
            FundMe.address
          )
          const finalDeployerBalance = await FundMe.provider.getBalance(
            deployer
          )

          assert.equal(finalFundMeBalance, 0)
          assert.equal(
            finalDeployerBalance.add(gasCost).toString(),
            startingDeployerBalance.add(startingFundMeBalance).toString()
          )
        })

        it("withdraw with multiple funders", async () => {
          // Arrange
          const accounts = await ethers.getSigners()
          for (i = 1; i < 6; i++) {
            const FundMeConnectedContract = await FundMe.connect(accounts[i])
            await FundMeConnectedContract.fund({ value: sendVal })
          }
          const startingFundMeBalance = await FundMe.provider.getBalance(
            FundMe.address
          )
          const startingDeployerBalance = await FundMe.provider.getBalance(
            deployer
          )

          const transactionResponse = await FundMe.cheaperWithdraw()
          const transactionReceipt = await transactionResponse.wait()
          const { gasUsed, effectiveGasPrice } = transactionReceipt
          const withdrawGasCost = gasUsed.mul(effectiveGasPrice)
          console.log(`GasCost: ${withdrawGasCost}`)
          console.log(`GasUsed: ${gasUsed}`)
          console.log(`GasPrice: ${effectiveGasPrice}`)
          const endingFundMeBalance = await FundMe.provider.getBalance(
            FundMe.address
          )
          const endingDeployerBalance = await FundMe.provider.getBalance(
            deployer
          )
          // Assert
          assert.equal(
            startingFundMeBalance.add(startingDeployerBalance).toString(),
            endingDeployerBalance.add(withdrawGasCost).toString()
          )
          // Make a getter for storage variables
          await expect(FundMe.getFunder(0)).to.be.reverted

          for (i = 1; i < 6; i++) {
            assert.equal(
              await FundMe.getAddressToAmountFunded(accounts[i].address),
              0
            )
          }
        })
      })
    })
