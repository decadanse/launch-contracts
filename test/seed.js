const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, expectRevert, BN } = require("@openzeppelin/test-helpers");
const {
  utils: { parseEther, parseUnits },
  BigNumber,
} = ethers;

const init = require("./test-init.js");

const deploy = async () => {
  const setup = await init.initialize(await ethers.getSigners());

  setup.seed = await init.getContractInstance("Seed", setup.roles.prime);

  setup.token = await init.gettokenInstances(setup);

  setup.data = {};

  return setup;
};

const getDecimals = async (token) => await token.decimals();

const getTokenAmount = (tokenDecimal) => (amount) =>
    parseUnits(amount, tokenDecimal.toString());

describe("Contract: Seed", async () => {
  let setup;
  let root;
  let admin;
  let buyer1;
  let buyer2;
  let buyer3;
  let buyer4;
  let seedToken;
  let seedTokenDecimal;
  let getSeedAmounts;
  let fundingToken;
  let fundingTokenDecimal;
  let getFundingAmounts;
  let softCap;
  let hardCap;
  let price;
  let buyAmount;
  let smallBuyAmount;
  let buySeedAmount;
  let buySeedFee;
  let startTime;
  let endTime;
  let vestingDuration;
  let vestingCliff;
  let permissionedSeed;
  let fee;
  let seed;
  let metadata;
  let seedForDistribution;
  let seedForFee;
  let requiredSeedAmount;
  let claimAmount;
  let feeAmount;
  let totalClaimedByBuyer1;
  let seedAmount;
  let feeAmountOnClaim;
  let CLASS_VESTING_START_TIME;


  // constants
  const zero = 0;
  const one = 1;
  const hundred = 100;
  const hundredTwoETH = parseEther("102").toString();
  const twoHundredFourETH = parseEther("204").toString();
  const twoBN = new BN(2);
  const PRECISION = ethers.constants.WeiPerEther;
  const ninetyTwoDaysInSeconds = time.duration.days(92);
  const eightyNineDaysInSeconds = time.duration.days(89);
  const tenDaysInSeconds = time.duration.days(10);

  const CLASS_PERSONAL_FUNDING_LIMIT = ethers.BigNumber.from("100000000000000000000");
  const CLASS_SMALL_PERSONAL_FUNDING_LIMIT = ethers.BigNumber.from("20000000000000000000");
  const CLASS_18_PERSONAL_FUNDING_LIMIT = ethers.BigNumber.from("180000000000000000").toString(); // = 2 * smallBuyAmount
  const CLASS_20_PERSONAL_FUNDING_LIMIT = ethers.BigNumber.from("200000000000000000").toString(); 
  const CLASS_VESTING_DURATION =  10000000;
  const CLASS_FEE = parseEther("0.02").toString(); // 2%
  const SECOND_CLASS_FEE = parseEther("0.44").toString(); //44% 
  const e_twenty = 1e12;
  const e_fourteen = 1e14;

 

  context("» creator is avatar", () => {
    before("!! setup", async () => {
      setup = await deploy();

      const CustomDecimalERC20Mock = await ethers.getContractFactory(
          "CustomDecimalERC20Mock",
          setup.roles.root
      );

      // Tokens used
      // fundingToken = setup.token.fundingToken;
      fundingToken = await CustomDecimalERC20Mock.deploy("USDC", "USDC", 16);
      fundingTokenDecimal = (await getDecimals(fundingToken)).toString();
      getFundingAmounts = getTokenAmount(fundingTokenDecimal);

      // seedToken = setup.token.seedToken;
      seedToken = await CustomDecimalERC20Mock.deploy("Prime", "Prime", 12);
      seedTokenDecimal = (await getDecimals(seedToken)).toString();
      getSeedAmounts = getTokenAmount(seedTokenDecimal);

      // // Roles
      root = setup.roles.root;
      beneficiary = setup.roles.beneficiary;
      admin = setup.roles.prime;
      buyer1 = setup.roles.buyer1;
      buyer2 = setup.roles.buyer2;
      buyer3 = setup.roles.buyer3;
      buyer4 = setup.roles.buyer4;

      // // Parameters to initialize seed contract
      softCap = getFundingAmounts("10").toString();
      hardCap = getFundingAmounts("102").toString();
      price = parseUnits(
          "0.01",
          parseInt(fundingTokenDecimal) - parseInt(seedTokenDecimal) + 18
      ).toString();   
      buyAmount = getFundingAmounts("51").toString();
      smallBuyAmount = getFundingAmounts("9").toString();
      buySeedAmount = getSeedAmounts("5100").toString();
      startTime = await time.latest();
      endTime = await startTime.add(await time.duration.days(7));
      vestingDuration = time.duration.days(365); // 1 year
      vestingCliff = time.duration.days(90); // 3 months
      permissionedSeed = false;
      fee = parseEther("0.02").toString(); // 2%
      CLASS_VESTING_START_TIME = (await startTime.add(await time.duration.years(10))).toNumber();

      metadata = `0x`;

      buySeedFee = new BN(buySeedAmount)
          .mul(new BN(fee))
          .div(new BN(PRECISION.toString()));
      seedForDistribution = new BN(hardCap)
          .mul(new BN(PRECISION.toString()))
          .div(new BN(price));
      seedForFee = seedForDistribution
          .mul(new BN(fee))
          .div(new BN(PRECISION.toString()));
      requiredSeedAmount = seedForDistribution.add(seedForFee);
    });
    context("» contract is not initialized yet", () => {
      context("» parameters are valid", () => {
        context("» distribution period not yet started", () => {
          it("is not possible to buy", async () => {
            const alternativeSetup = await deploy();
            await alternativeSetup.seed.initialize(
                beneficiary.address,
                admin.address,
                [seedToken.address, fundingToken.address],
                [softCap, hardCap],
                price,
                (await startTime.add(await time.duration.hours(12))).toNumber(),
                (await endTime.add(await time.duration.hours(10))).toNumber(),
                vestingDuration.toNumber(),
                vestingCliff.toNumber(),
                permissionedSeed,
                fee
            );
            const signers = await ethers.getSigners();
            const randomSigner = signers[9];
            // endTime = 1648821001 --> 1700000000 = CLASS_VESTING_START_TIME
            await alternativeSetup.seed
                .connect(admin)
                .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
            await expectRevert(
                alternativeSetup.seed
                    .connect(randomSigner)
                    .buy(getFundingAmounts("1").add(buyAmount)),
                "Seed: only allowed during distribution period"
            );
          });
        });

        it("it initializes seed", async () => {
          // emulate creation & initialization via seedfactory & fund with seedTokens         
          let startTime = (await time.latest()).add(await time.duration.minutes(1));

          await setup.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              startTime.toNumber(),
              endTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );

          expect(await setup.seed.initialized()).to.equal(true);
          expect(await setup.seed.beneficiary()).to.equal(beneficiary.address);
          expect(await setup.seed.admin()).to.equal(admin.address);
          expect(await setup.seed.seedToken()).to.equal(seedToken.address);
          expect(await setup.seed.fundingToken()).to.equal(
              fundingToken.address
          );
          expect((await setup.seed.softCap()).toString()).to.equal(
              softCap.toString()
          );
          expect(await setup.seed.permissionedSeed()).to.equal(
              permissionedSeed
          );
          expect(await setup.seed.closed()).to.equal(false);
          expect((await setup.seed.seedAmountRequired()).toString()).to.equal(
              seedForDistribution.toString()
          );
          expect((await setup.seed.feeAmountRequired()).toString()).to.equal(
              seedForFee.toString()
          );
          expect((await setup.seed.seedRemainder()).toString()).to.equal(
              seedForDistribution.toString()
          );
          expect((await setup.seed.feeRemainder()).toString()).to.equal(
              seedForFee.toString()
          );
          expect((await setup.seed.isFunded()).toString()).to.equal("false");
        });

        it("sets", async() => {
        const SECOND_CLASS_FEE = parseEther("0.44").toString(); // 44%

        await setup.seed
            .connect(admin)
            .addClass(hardCap, hardCap, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, SECOND_CLASS_FEE);

        await setup.seed.connect(admin).setClass(buyer4.address, 1);
        time.increase(await time.duration.minutes(1));
        });
        it("it reverts on double initialization", async () => {
          await expectRevert(
              setup.seed.initialize(
                  beneficiary.address,
                  admin.address,
                  [seedToken.address, fundingToken.address],
                  [softCap, hardCap],
                  price,
                  startTime.toNumber(),
                  endTime.toNumber(),
                  vestingDuration.toNumber(),
                  vestingCliff.toNumber(),
                  permissionedSeed,
                  fee
              ),
              "Seed: contract already initialized"
          );
        });
        it("reverts when trying to add/remove whitelist", async () => {
          await expectRevert(
              setup.seed
                  .connect(admin)
                  .whitelistBatch([buyer1.address, buyer2.address], [0, 0]),
              "Seed: seed is not whitelisted"
          );
          await expectRevert(
              setup.seed.connect(admin).unwhitelist(buyer1.address),
              "Seed: seed is not whitelisted"
          );
        });
      });
    });
    context("# buy", () => {
      context("» generics", () => {
        before("!! top up buyer1 and buyer3 balance", async () => {
          await fundingToken
              .connect(root)
              .transfer(buyer1.address, getFundingAmounts("102"));
          await fundingToken
              .connect(buyer1)
              .approve(setup.seed.address, getFundingAmounts("102"));
          await fundingToken
              .connect(root)
              .transfer(buyer3.address, getFundingAmounts("102"));
          await fundingToken
              .connect(buyer3)
              .approve(setup.seed.address, getFundingAmounts("102"));
          await fundingToken
              .connect(root)
              .transfer(buyer4.address, getFundingAmounts("102"));
          await fundingToken
              .connect(buyer4)
              .approve(setup.seed.address, getFundingAmounts("102"));

          claimAmount = new BN(ninetyTwoDaysInSeconds).mul(
              new BN(buySeedAmount)
                  .mul(new BN(twoBN))
                  .div(new BN(vestingDuration))
          );
          feeAmount = new BN(claimAmount)
              .mul(new BN(fee))
              .div(new BN(PRECISION.toString()));
        });

        it("it cannot buy if not funded", async () => {
          await setup.seed
              .connect(admin)
              .addClass(hardCap, hardCap, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
          await expectRevert(
              setup.seed.connect(buyer1).buy(buyAmount),
              "Seed: sufficient seeds not provided"
          );
        });
        it("it funds the Seed contract with Seed Token", async () => {
          await seedToken
              .connect(root)
              .transfer(setup.seed.address, requiredSeedAmount.toString());
          expect(
              (await seedToken.balanceOf(setup.seed.address)).toString()
          ).to.equal(requiredSeedAmount.toString());
        });
        it("it cannot buy when paused", async () => {
          await setup.seed.connect(admin).pause();
          await expectRevert(
              setup.seed.connect(buyer1).buy(buyAmount),
              "Seed: should not be paused"
          );
          await setup.seed.connect(admin).unpause();
        });
        it("it buys tokens ", async () => {
          // seedAmount = (buyAmountt*PRECISION)/price;
          seedAmount = new BN(buyAmount)
              .mul(new BN(PRECISION.toString()))
              .div(new BN(price));

          await expect(setup.seed.connect(buyer1).buy(buyAmount))
              .to.emit(setup.seed, "SeedsPurchased")
              .withArgs(buyer1.address, seedAmount);
          expect(
              (await fundingToken.balanceOf(setup.seed.address)).toString()
          ).to.equal(
              Math.floor((buySeedAmount * price) / PRECISION).toString()
          );
        });
        it("cannot buy more than class allows", async () => {
          await expectRevert(
              setup.seed
                  .connect(buyer1)
                  .buy(getFundingAmounts("1").add(buyAmount)),
              "Seed: maximum class funding reached"
          );
        });
        it("cannot buy more than personal maximum allows", async () => {
          const alternativeSetup = await deploy();
          const CustomERC20MockFactory = await ethers.getContractFactory(
              "CustomERC20Mock",
              setup.roles.prime
          );
          const alternativeFundingToken = await CustomERC20MockFactory.deploy(
              "DAI Stablecoin",
              "DAI"
          );
          const fundingTokenDecimal = await getDecimals(
              alternativeFundingToken
          );
          const getFundingAmounts = getTokenAmount(fundingTokenDecimal);
          const softCap = getFundingAmounts("10").toString();
          const hardCap = getFundingAmounts("102").toString();
          const price = parseUnits(
              "0.01",
              parseInt(fundingTokenDecimal) - parseInt(seedTokenDecimal) + 18
          ).toString();
          const biggerStartTime = startTime.add(await time.duration.hours(1));
          const biggerEndTime = endTime.add(await time.duration.hours(2));
          await alternativeSetup.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, alternativeFundingToken.address],
              [softCap, hardCap],
              price,
              biggerStartTime.toNumber(),
              biggerEndTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );
          await alternativeSetup.seed
              .connect(admin)
              .addClass(hardCap, CLASS_SMALL_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);

          await alternativeFundingToken
              .connect(root)
              .transfer(buyer1.address, getFundingAmounts("104"));
          await alternativeFundingToken
              .connect(buyer1)
              .approve(alternativeSetup.seed.address, getFundingAmounts("104"));
          await seedToken
              .connect(root)
              .transfer(
                  alternativeSetup.seed.address,
                  requiredSeedAmount.toString()
          );
          await alternativeSetup.seed.connect(admin).setClass(buyer1.address, 1);

          time.increase(await time.duration.hours(1));

          await alternativeSetup.seed.connect(buyer1).buy(CLASS_SMALL_PERSONAL_FUNDING_LIMIT);

          await expectRevert(
            alternativeSetup.seed.connect(buyer1).buy(getFundingAmounts("4")),
              "Seed: maximum personal funding reached"
          );
        });
        it("minimumReached == true", async () => {
          expect(await setup.seed.minimumReached()).to.equal(true);
        });
        it("it returns amount of seed token bought and the fee", async () => {
          let { ["0"]: seedAmount, ["1"]: feeAmount } = await setup.seed
              .connect(buyer1)
              .callStatic.buy(buyAmount);
          expect((await seedAmount).toString()).to.equal(buySeedAmount.toString());
          expect((await feeAmount).toString()).to.equal(getSeedAmounts("102"));
        });
        it("updates fee mapping for locker", async () => {
          // get funding amount to calculate fee
          expect(
              (await setup.seed.feeForFunder(buyer1.address)).toString()
          ).to.equal(getSeedAmounts("102"));
        });
        it("updates the remaining seeds to distribution", async () => {
          expect((await setup.seed.seedRemainder()).toString()).to.equal(
              seedForDistribution.sub(new BN(buySeedAmount)).toString()
          );
        });
        it("updates the remaining seeds for fee", async () => {
          expect((await setup.seed.feeRemainder()).toString()).to.equal(
              seedForFee.sub(new BN(buySeedFee)).toString()
          );
        });
        it("updates the amount of funding token collected", async () => {
          expect((await setup.seed.fundingCollected()).toString()).to.equal(
              buyAmount.toString()
          );
        });
        it("it returns amount of the fee when feeAmount > feeRemainder", async () => {           
            let { ["1"]: feeAmount } = await setup.seed
                .connect(buyer4)
                .callStatic.buy(buyAmount);
            expect((await feeAmount).toString()).to.equal(getSeedAmounts("0"));
        });
        it("it fails on claiming seed tokens if the distribution has not yet finished", async () => {
          await expectRevert(
              setup.seed
                  .connect(buyer1)
                  .claim(buyer1.address, claimAmount.toString()),
              "Seed: the distribution has not yet finished"
          );
        });
        it("it returns 0 when calculating claim before vesting starts", async () => {
          expect(
              (await setup.seed.calculateClaim(buyer3.address)).toString()
          ).to.equal("0");
        });
        it("cannot buy more than maximum target", async () => {
            const alternativeSetup = await deploy();
            const CustomERC20MockFactory = await ethers.getContractFactory(
                "CustomERC20Mock",
                setup.roles.prime
            );
            const alternativeFundingToken = await CustomERC20MockFactory.deploy(
                "DAI Stablecoin",
                "DAI"
            );
            const fundingTokenDecimal = await getDecimals(
                alternativeFundingToken
            );
            const getFundingAmounts = getTokenAmount(fundingTokenDecimal);
            const softCap = getFundingAmounts("10").toString();
            const hardCap = getFundingAmounts("102").toString();
            const price = parseUnits(
                "0.01",
                parseInt(fundingTokenDecimal) - parseInt(seedTokenDecimal) + 18
            ).toString();
            const biggerStartTime = startTime.add(await time.duration.hours(2));
            const biggerEndTime = endTime.add(await time.duration.hours(3));
            await alternativeSetup.seed.initialize(
                beneficiary.address,
                admin.address,
                [seedToken.address, alternativeFundingToken.address],
                [softCap, hardCap],
                price,
                biggerStartTime.toNumber(),
                biggerEndTime.toNumber(),
                vestingDuration.toNumber(),
                vestingCliff.toNumber(),
                permissionedSeed,
                fee
            );
            await alternativeSetup.seed
                .connect(admin)
                .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
                
            await alternativeSetup.seed.addClass(hardCap, hardCap, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);

            await alternativeFundingToken
                .connect(root)
                .transfer(buyer1.address, getFundingAmounts("102"));
            await alternativeFundingToken
                .connect(buyer1)
                .approve(alternativeSetup.seed.address, getFundingAmounts("102"));
            await alternativeFundingToken
                .connect(root)
                .transfer(buyer3.address, getFundingAmounts("102"));
            await alternativeFundingToken
                .connect(buyer3)
                .approve(alternativeSetup.seed.address, getFundingAmounts("102"));
            await seedToken
                .connect(root)
                .transfer(
                    alternativeSetup.seed.address,
                    requiredSeedAmount.toString()
            );
            await alternativeSetup.seed.connect(admin).setClass(buyer1.address, 0);
            await alternativeSetup.seed.connect(admin).setClass(buyer3.address, 2);
            
            await alternativeSetup.seed.setClass(buyer1.address, 1);

            time.increase(await time.duration.hours(1));

            await alternativeSetup.seed
                .connect(buyer1)
                .buy(softCap);

            await expectRevert(
                alternativeSetup.seed
                    .connect(buyer3)
                    .buy(hardCap),
                "Seed: amount exceeds contract sale hardCap"
            );
        });
        it("updates lock when it buys tokens", async () => {
          // seedAmount = (buyAmountt*PRECISION)/price;
          seedAmount = new BN(buyAmount)
              .mul(new BN(PRECISION.toString()))
              .div(new BN(price));

          // get fundingAmount to calculate seedAmount
          let prevSeedAmount = await setup.seed.seedAmountForFunder(
              buyer1.address
          );
          // get funding amount to calculate fee
          let prevFeeAmount = await setup.seed.feeForFunder(buyer1.address);

          await expect(setup.seed.connect(buyer1).buy(buyAmount))
              .to.emit(setup.seed, "SeedsPurchased")
              .withArgs(buyer1.address, seedAmount);

          expect(
              (await fundingToken.balanceOf(setup.seed.address)).toString()
          ).to.equal((2 * buyAmount).toString());

          // get fundingAmount to calculate seedAmount
          expect(
              (await setup.seed.seedAmountForFunder(buyer1.address)).toString()
          ).to.equal(prevSeedAmount.mul(twoBN.toNumber()).toString());
          // get fundingAmount to calculate fee
          expect(
              (await setup.seed.feeForFunder(buyer1.address)).toString()
          ).to.equal(prevFeeAmount.mul(twoBN.toNumber()).toString());
        });
        it("maximumReached == true", async () => {
          expect(await setup.seed.maximumReached()).to.equal(true);
        });
        it("vestingStartTime == current timestamp", async () => {
          const timeDifference = 1;
          const expectedClaim = (await time.latest()).add(new BN(timeDifference));
          expect((await setup.seed.classes(0))[4].toString()).to.equal(
              expectedClaim.toString()
          );
        });
        it("updates the remaining seeds to distribution after another buy", async () => {
          expect((await setup.seed.seedRemainder()).toString()).to.equal(
              seedForDistribution.sub(new BN(buySeedAmount).mul(twoBN)).toString()
          );
        });
        it("updates the remaining seeds for fee after another buy", async () => {
          expect((await setup.seed.feeRemainder()).toString()).to.equal(
              seedForFee.sub(new BN(buySeedFee).mul(twoBN)).toString()
          );
        });
        it("return totalClaimed == 0", async () => {
          expect(
              (await setup.seed.funders(buyer1.address)).totalClaimed.toString()
          ).to.equal(zero.toString());
        });

        context("» ERC20 transfer fails", () => {
          it("reverts 'Seed: funding token transferFrom failed' ", async () => {
            const alternativeSetup = await deploy();
            const CustomERC20MockFactory = await ethers.getContractFactory(
                "CustomERC20Mock",
                setup.roles.prime
            );
            const alternativeFundingToken = await CustomERC20MockFactory.deploy(
                "DAI Stablecoin",
                "DAI"
            );
            const fundingTokenDecimal = await getDecimals(
                alternativeFundingToken
            );
            const getFundingAmounts = getTokenAmount(fundingTokenDecimal);
            const softCap = getFundingAmounts("10").toString();
            const hardCap = getFundingAmounts("102").toString();
            const price = parseUnits(
                "0.01",
                parseInt(fundingTokenDecimal) - parseInt(seedTokenDecimal) + 18
            ).toString();
            await alternativeSetup.seed.initialize(
                beneficiary.address,
                admin.address,
                [seedToken.address, alternativeFundingToken.address],
                [softCap, hardCap],
                price,
                startTime.toNumber(),
                endTime.toNumber(),
                vestingDuration.toNumber(),
                vestingCliff.toNumber(),
                permissionedSeed,
                fee
            );

            await alternativeSetup.seed
                .connect(admin)
                .addClass(e_fourteen, e_twenty, e_twenty, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);

            const requiredAmount = (
                await alternativeSetup.seed.seedAmountRequired()
            ).add(await alternativeSetup.seed.feeAmountRequired());
            await alternativeFundingToken
                .connect(root)
                .transfer(buyer1.address, hundredTwoETH);
            await seedToken
                .connect(root)
                .transfer(
                    alternativeSetup.seed.address,
                    requiredAmount.toString()
                );
            await alternativeSetup.seed
                .connect(admin)
                .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
            await expectRevert(
                alternativeSetup.seed.connect(buyer1).buy(getFundingAmounts("5")),
                "SafeERC20: ERC20 operation did not succeed"
            );
          });
        });
      });
    });
    context("# claim", () => {
      context("» softCap not reached", () => {
        let alternativeSetup;

        beforeEach(async () => {
          alternativeSetup = await deploy();

          await alternativeSetup.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              startTime.toNumber(),
              endTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );
          await alternativeSetup.seed
              .connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
          await fundingToken
              .connect(root)
              .transfer(buyer1.address, getFundingAmounts("102"));
          await fundingToken
              .connect(buyer1)
              .approve(alternativeSetup.seed.address, getFundingAmounts("102"));
          await seedToken
              .connect(root)
              .transfer(
                  alternativeSetup.seed.address,
                  requiredSeedAmount.toString()
              );
          await alternativeSetup.seed
              .connect(buyer1)
              .buy(getFundingAmounts("5"));

          await setup.seed
              .connect(admin)
              .addClass(e_fourteen, e_twenty, e_twenty, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);   
        });

        it("is not possible to buy", async () => {
          await expectRevert(
              alternativeSetup.seed
                  .connect(buyer1)
                  .claim(buyer1.address, getSeedAmounts("5")),
              "Seed: minimum funding amount not met"
          );
        });
      });

      context("» generics", () => {
        it("claim = 0 when not currentTime<endTime", async () => {
          expect(
              (await setup.seed.calculateClaim(buyer2.address)).toString()
          ).to.equal("0");
        });
        it("it cannot claim before vestingCliff", async () => {
          await time.increase(eightyNineDaysInSeconds);
          await expectRevert(
              setup.seed
                  .connect(buyer1)
                  .claim(buyer1.address, claimAmount.toString()),
              "Seed: amount claimable is 0"
          );
        });
        it("calculates correct claim", async () => {
          // increase time
          await time.increase(tenDaysInSeconds);
          const claim = await setup.seed.calculateClaim(buyer1.address);
          const vestingStartTime = (await setup.seed.classes(0))[4];//vestingStartTime();
          const timeDifference = 1; // vestingStartTime - currentClassVestingStartTime
          const expectedClaim = (await time.latest())
              .sub(new BN(vestingStartTime.toNumber()))
              .add(new BN(1)) //vestingStartTime = endTime + 1; in constructor
              .sub(new BN(timeDifference))
              .mul(new BN(buySeedAmount).mul(new BN(twoBN)))
              .div(new BN(vestingDuration.toNumber()));
          expect(claim.toString()).to.equal(expectedClaim.toString());
        });
        it("claim = 0 when not contributed", async () => {
          expect(
              (await setup.seed.calculateClaim(buyer2.address)).toString()
          ).to.equal("0");
        });
        it("it cannot claim if not vested", async () => {
          await expectRevert(
              setup.seed
                  .connect(buyer1)
                  .claim(
                      buyer2.address,
                      new BN(buySeedAmount)
                          .mul(new BN(twoBN))
                          .add(new BN(one))
                          .toString()
                  ),
              "Seed: amount claimable is 0"
          );
        });
        it("it cannot claim more than claimable amount", async () => {
          await expectRevert(
              setup.seed
                  .connect(buyer1)
                  .claim(
                      buyer1.address,
                      new BN(buySeedAmount)
                          .mul(new BN(twoBN))
                          .add(new BN(one))
                          .toString()
                  ),
              "Seed: request is greater than claimable amount"
          );
        });
        it("it returns amount of the fee", async () => {
          let feeSent = await setup.seed
              .connect(buyer1)
              .callStatic.claim(buyer1.address, claimAmount.toString());
          expect(feeSent.toString()).to.equal(feeAmount.toString());
        });
        it("it withdraws tokens after time passes", async () => {
          // claim lock

          // feeAmountOnClaim = (_claimAmount * fee) / 100;
          feeAmountOnClaim = new BN(claimAmount)
              .mul(new BN(fee))
              .div(new BN(PRECISION.toString()));

          await expect(
              setup.seed
                  .connect(buyer1)
                  .claim(buyer1.address, claimAmount.toString())
          )
              .to.emit(setup.seed, "TokensClaimed")
              .withArgs(
                  buyer1.address,
                  claimAmount,
                  beneficiary.address,
                  feeAmountOnClaim.toString()
              );
        });
        it("updates claim", async () => {
          expect(
              (await setup.seed.funders(buyer1.address)).totalClaimed.toString()
          ).to.equal(claimAmount.toString());
        });
        it("transfers correct fee to beneficiary", async () => {
          expect(
              (await seedToken.balanceOf(beneficiary.address)).toString()
          ).to.equal(feeAmount.toString());
        });
        it("updates the amount of seed claimed by the claim amount", async () => {
          totalClaimedByBuyer1 = claimAmount;
          expect((await setup.seed.seedClaimed()).toString()).to.equal(
              claimAmount.toString()
          );
        });
        it("updates the amount of seed transfered as fee to beneficiary", async () => {
          expect((await setup.seed.feeClaimed()).toString()).to.equal(
              feeAmount.toString()
          );
        });
        it("calculates and claims exact seed amount", async () => {
          const claim = await setup.seed.calculateClaim(buyer1.address);
          feeAmountOnClaim = new BN(claim.toString())
              .mul(new BN(fee))
              .div(new BN(PRECISION.toString()));

          totalClaimedByBuyer1 = totalClaimedByBuyer1.add(
              new BN(claim.toString())
          );

          await expect(setup.seed.connect(buyer1).claim(buyer1.address, claim))
              .to.emit(setup.seed, "TokensClaimed")
              .withArgs(
                  buyer1.address,
                  claim,
                  beneficiary.address,
                  feeAmountOnClaim.toString()
              );
        });
      });
      context("» claim after vesting duration", async () => {
        before("!! deploy new contract + top up buyer balance", async () => {
          let newStartTime = (await time.latest()).add(await time.duration.days(1));
          let newEndTime = await newStartTime.add(await time.duration.days(3));
          setup.data.seed = await init.getContractInstance(
              "Seed",
              setup.roles.prime
          );
          setup;

          await seedToken
              .connect(root)
              .transfer(setup.data.seed.address, requiredSeedAmount.toString());
          await fundingToken
              .connect(buyer2)
              .transfer(
                  buyer3.address,
                  await fundingToken.balanceOf(buyer2.address)
              );
          await fundingToken
              .connect(root)
              .transfer(
                  buyer2.address,
                  new BN(buyAmount).mul(new BN(twoBN)).toString()
              );
          await fundingToken
              .connect(buyer2)
              .approve(
                  setup.data.seed.address,
                  new BN(buyAmount).mul(new BN(twoBN)).toString()
              );
          await setup.data.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              newStartTime.toNumber(),
              newEndTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );    
          await setup.data.seed
              .connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, 2700000000, CLASS_FEE);

          await setup.data.seed
              .connect(admin)
              .addClass(e_fourteen, e_twenty, e_twenty, CLASS_VESTING_DURATION, 2700000000, CLASS_FEE);
        });

        it("it cannot claim before currentVestingStartTime", async () => {  
          await setup.data.seed
              .connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, 2700000000, CLASS_FEE);

          await setup.data.seed
              .connect(admin)
              .setClass(buyer1.address, 3);

          time.increase(await time.duration.days(1));

          await setup.data.seed
              .connect(buyer2)
              .buy(new BN(buyAmount).mul(new BN(twoBN)).toString());

          await setup.data.seed 
              .connect(buyer1)
              .buy(new BN(buyAmount)).toString();

          await expectRevert(
              setup.data.seed
                  .connect(buyer1)
                  .claim(buyer1.address, new BN(softCap).mul(new BN(twoBN)).toString()),
              "Seed: vesting start time for this class is not started yet"
          );
        });
        it("claims all seeds after vesting duration", async () => {
          time.increase(await time.duration.days(7));
          time.increase(vestingDuration.toNumber());
          setup.data.prevBalance = await seedToken.balanceOf(
              beneficiary.address
          );

          const claimTemp = new BN(buySeedAmount).mul(new BN(twoBN)).toString();
          feeAmountOnClaim = new BN(claimTemp)
              .mul(new BN(fee))
              .div(new BN(PRECISION.toString()));

          await expect(
              setup.data.seed
                  .connect(buyer2)
                  .claim(buyer2.address, claimTemp.toString())
          )
              .to.emit(setup.data.seed, "TokensClaimed")
              .withArgs(
                  buyer2.address,
                  claimTemp.toString(),
                  beneficiary.address,
                  feeAmountOnClaim.toString()
              );
        });
        it("it claims all the fee", async () => {
          const feeAmountRequired = await setup.data.seed.feeAmountRequired();
          const feeClaimed = await setup.data.seed.feeClaimed();
          expect(feeAmountRequired.toString()).to.equal(feeClaimed.toString());
        });
        it("funds DAO with all the fee", async () => {
          // get total fundingAmount and calculate fee here
          const fee = await setup.data.seed.feeForFunder(buyer2.address);
          expect(
              (await seedToken.balanceOf(beneficiary.address)).toString()
          ).to.equal(fee.add(setup.data.prevBalance).toString());
          delete setup.data.prevBalance;
        });
      });
      context("» claim when vesting duration is 0", async () => {
        before("!! deploy new contract + top up buyer balance", async () => {
          let newStartTime = await time.latest();
          let newEndTime = await newStartTime.add(await time.duration.days(7));

          setup.data.seed = await init.getContractInstance(
              "Seed",
              setup.roles.prime
          );
          setup;

          await seedToken
              .connect(root)
              .transfer(setup.data.seed.address, requiredSeedAmount.toString());
          await fundingToken
              .connect(buyer2)
              .transfer(
                  buyer3.address,
                  await fundingToken.balanceOf(buyer2.address)
              );
          await fundingToken
              .connect(root)
              .transfer(
                  buyer2.address,
                  new BN(buyAmount).mul(new BN(twoBN)).toString()
              );
          await fundingToken
              .connect(buyer2)
              .approve(
                  setup.data.seed.address,
                  new BN(buyAmount).mul(new BN(twoBN)).toString()
              );

          await setup.data.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              newStartTime.toNumber(),
              newEndTime.toNumber(),
              0,
              0,
              permissionedSeed,
              fee
          );

          await setup.data.seed
              .connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);


          await setup.data.seed
              .connect(buyer2)
              .buy(new BN(buyAmount).mul(new BN(twoBN)).toString());
        });
        it("claims all seeds after vesting duration", async () => {
          time.increase(await time.duration.days(7));

          setup.data.prevBalance = await seedToken.balanceOf(
              beneficiary.address
          );          

          // amountClaimable 1020000000 --> 10200000000000000/1020000000 = 1000000000
          const divisor = 1000000000;
          const claimTemp = new BN(buySeedAmount).mul(new BN(twoBN)).div(new BN(divisor)).toString();
          
          feeAmountOnClaim = new BN(claimTemp)
              .mul(new BN(fee))
              .div(new BN(PRECISION.toString()));

          await expect(
              setup.data.seed
                  .connect(buyer2)
                  .claim(buyer2.address, claimTemp.toString())
          )
              .to.emit(setup.data.seed, "TokensClaimed")
              .withArgs(
                  buyer2.address,
                  claimTemp.toString(),
                  beneficiary.address,
                  feeAmountOnClaim.toString()
              );
        });
        it("it claims all the fee for a buyer's claim", async () => {
          const fee = await setup.data.seed.feeForFunder(buyer2.address);
          // amountClaimable 1020000000 --> 10200000000000000/1020000000 = 1000000000
          const divisor = 1000000000;
          const dividedFee = fee / divisor;
          const feeClaimed = await setup.data.seed.feeClaimedForFunder(
              buyer2.address
          );          
          expect(dividedFee.toString()).to.equal(feeClaimed.toString());
        });
        it("it claims all the fee", async () => {
          const feeAmountRequired = await setup.data.seed.feeAmountRequired();
          const feeClaimed = await setup.data.seed.feeClaimed();
          const divisor = 1000000000;
          const dividedFeeAmountRequired = feeAmountRequired / divisor;
          expect(dividedFeeAmountRequired.toString()).to.equal(feeClaimed.toString());
        });
        it("funds DAO with all the fee", async () => {
          // get fundingAmount and calculate fee here
          const fee = await setup.data.seed.feeForFunder(buyer2.address);
          const divisor = new BN(1000000000);
          const dividedFeeAmountRequired = ethers.BigNumber.from((fee/divisor).toString());
          const sdpb = ethers.BigNumber.from(setup.data.prevBalance);
          const sum = ethers.BigNumber.from(dividedFeeAmountRequired.add(sdpb));
          expect(
              (await seedToken.balanceOf(beneficiary.address)).toString()
          ).to.equal((sum).toString());
          delete setup.data.prevBalance;
        });
      });
      context("» ERC20 transfer fails", () => {
        it("reverts 'Seed: seed token transfer failed' ", async () => {
          const alternativeSetup = await deploy();
          const CustomERC20MockFactory = await ethers.getContractFactory(
              "CustomERC20Mock",
              root
          );
          const fakeSeedToken = await CustomERC20MockFactory.deploy(
              "DAI Stablecoin",
              "DAI"
          );
          const altStartTime = await time.latest();
          const altEndTime = await altStartTime.add(
              await time.duration.days(7)
          );
          const altVestingDuration = time.duration.days(365);
          const altVestingCliff = time.duration.days(9);
          await alternativeSetup.seed.initialize(
              beneficiary.address,
              admin.address,
              [fakeSeedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              altStartTime.toNumber(),
              altEndTime.toNumber(),
              altVestingDuration.toNumber(),
              altVestingCliff.toNumber(),
              permissionedSeed,
              fee
          );
          await alternativeSetup.seed
              .connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
          await fundingToken
              .connect(root)
              .transfer(buyer1.address, getFundingAmounts("102"));
          await fundingToken
              .connect(buyer1)
              .approve(alternativeSetup.seed.address, getFundingAmounts("102"));
          await fakeSeedToken
              .connect(root)
              .transfer(
                  alternativeSetup.seed.address,
                  requiredSeedAmount.toString()
              );
          await alternativeSetup.seed
              .connect(buyer1)
              .buy(getFundingAmounts("102"));
          await time.increase(tenDaysInSeconds);
          const correctClaimAmount = await alternativeSetup.seed.calculateClaim(
              buyer1.address
          );
          await fakeSeedToken.burn(alternativeSetup.seed.address);
          await expectRevert(
              alternativeSetup.seed
                  .connect(buyer1)
                  .claim(buyer1.address, correctClaimAmount.toString()),
              "SafeERC20: ERC20 operation did not succeed"
          );
        });
      });
    });
    context("# retrieveFundingTokens", () => {
      context("» Seed: distribution hasn't started", () => {
        it("reverts 'Seed: distribution haven't started' ", async () => {
          let futureStartTime = (await time.latest()).add(
              await time.duration.days(2)
          );
          let futureEndTime = await futureStartTime.add(
              await time.duration.days(7)
          );

          const alternativeSetup = await deploy();
          await alternativeSetup.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              futureStartTime.toNumber(),
              futureEndTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );

          await expectRevert(
              alternativeSetup.seed.connect(buyer1).retrieveFundingTokens(),
              "Seed: distribution haven't started"
          );
        });
      });

      context("» generics", () => {
        before("!! deploy new contract + top up buyer balance", async () => {
          let newStartTime = await time.latest();
          let newEndTime = await newStartTime.add(await time.duration.days(7));

          setup.data.seed = await init.getContractInstance(
              "Seed",
              setup.roles.prime
          );

          await seedToken
              .connect(root)
              .transfer(setup.data.seed.address, requiredSeedAmount.toString());
          await fundingToken
              .connect(root)
              .transfer(buyer2.address, smallBuyAmount);
          await fundingToken
              .connect(buyer2)
              .approve(setup.data.seed.address, smallBuyAmount);

          await setup.data.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              newStartTime.toNumber(),
              newEndTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );
          await setup.data.seed
              .connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);

          await setup.data.seed.connect(buyer2).buy(smallBuyAmount);
        });
        it("it cannot return funding tokens if not bought", async () => {
          await expectRevert(
              setup.data.seed.connect(buyer1).retrieveFundingTokens(),
              "Seed: zero funding amount"
          );
        });
        it("returns funding amount when called", async () => {
          const fundingAmount = await setup.data.seed
              .connect(buyer2)
              .callStatic.retrieveFundingTokens();
          expect((await fundingAmount).toString()).to.equal(smallBuyAmount);
        });
        it("returns funding tokens to buyer", async () => {
          const fundingAmount = await setup.data.seed
              .connect(buyer2)
              .callStatic.retrieveFundingTokens();

          expect(
              (await fundingToken.balanceOf(buyer2.address)).toString()
          ).to.equal(zero.toString());

          await expect(setup.data.seed.connect(buyer2).retrieveFundingTokens())
              .to.emit(setup.data.seed, "FundingReclaimed")
              .withArgs(buyer2.address, fundingAmount);

          expect(
              (await fundingToken.balanceOf(buyer2.address)).toString()
          ).to.equal(smallBuyAmount.toString());
        });
        it("clears `fee` mapping", async () => {
          // get fundingAmount to calculate fee
          expect(
              (await setup.data.seed.feeForFunder(buyer2.address)).toString()
          ).to.equal(zero.toString());
        });
        it("clears `tokenLock.amount`", async () => {
          // get fundingAmount to calculate seedAmount
          expect(
              (
                  await setup.data.seed.seedAmountForFunder(buyer2.address)
              ).toString()
          ).to.equal(zero.toString());
        });
        it("updates `feeRemainder` ", async () => {
          expect((await setup.data.seed.feeRemainder()).toString()).to.equal(
              seedForFee.toString()
          );
        });
        it("updates remaining seeds", async () => {
          expect((await setup.data.seed.seedRemainder()).toString()).to.equal(
              seedForDistribution.toString()
          );
        });
        it("updates amount of funding token collected", async () => {
          expect(
              (await setup.data.seed.fundingCollected()).toString()
          ).to.equal("0");
        });
        it("cannot be called before funding minimum is reached", async () => {
          const currentBuyAmount = getFundingAmounts("10");
          await fundingToken
              .connect(root)
              .transfer(buyer2.address, currentBuyAmount);
          await fundingToken
              .connect(buyer2)
              .approve(setup.data.seed.address, currentBuyAmount);
          await setup.data.seed.connect(buyer2).buy(currentBuyAmount);
          await expectRevert(
              setup.data.seed.connect(buyer2).retrieveFundingTokens(),
              "Seed: minimum funding amount met"
          );
        });
      });
      context("» ERC20 transfer fails", () => {
        it("reverts 'Seed: cannot return funding tokens to msg.sender' ", async () => {
          const altStartTime = await time.latest();
          const altEndTime = await altStartTime.add(
              await time.duration.days(7)
          );
          const alternativeSetup = await deploy();
          const CustomERC20MockFactory = await ethers.getContractFactory(
              "CustomERC20Mock",
              setup.roles.prime
          );
          const alternativeFundingToken = await CustomERC20MockFactory.deploy(
              "DAI Stablecoin",
              "DAI"
          );
          await alternativeSetup.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, alternativeFundingToken.address],
              [softCap, hardCap],
              price,
              altStartTime.toNumber(),
              altEndTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );
          await alternativeSetup.seed
              .connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);

          await alternativeFundingToken
              .connect(root)
              .transfer(buyer1.address, getFundingAmounts("102"));
          await alternativeFundingToken
              .connect(buyer1)
              .approve(alternativeSetup.seed.address, getFundingAmounts("102"));
          await seedToken
              .connect(root)
              .transfer(
                  alternativeSetup.seed.address,
                  requiredSeedAmount.toString()
              );
          await alternativeSetup.seed
              .connect(buyer1)
              .buy(getFundingAmounts("5"));
          await alternativeFundingToken.burn(buyer1.address);
          await expectRevert(
              alternativeSetup.seed.connect(buyer1).retrieveFundingTokens(),
              "SafeERC20: ERC20 operation did not succeed"
          );
        });
      });
    });
    context("# close", () => {
      context("» generics", () => {
        before("!! deploy new contract + top up buyer balance", async () => {
          let newStartTime = await time.latest();
          let newEndTime = await newStartTime.add(await time.duration.days(7));

          setup.data.seed = await init.getContractInstance(
              "Seed",
              setup.roles.prime
          );
          await seedToken
              .connect(root)
              .transfer(setup.data.seed.address, requiredSeedAmount.toString());

          setup.data.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              newStartTime.toNumber(),
              newEndTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );
          await setup.data.seed
              .connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);

          await fundingToken
              .connect(buyer2)
              .approve(setup.data.seed.address, smallBuyAmount);
          await setup.data.seed.connect(buyer2).buy(smallBuyAmount);
        });
        it("can only be called by admin", async () => {
          await expectRevert(
              setup.data.seed.connect(buyer1).close(),
              "Seed: caller should be admin"
          );
        });
        it("does not refund anything when, closed == false but contribution didn't end", async () => {
          await expect(
              setup.data.seed.connect(admin).retrieveSeedTokens(admin.address)
          ).to.be.revertedWith(
              "Seed: The ability to buy seed tokens must have ended before remaining seed tokens can be withdrawn"
          );
        });
        it("close seed token distribution", async () => {
          expect(await setup.data.seed.closed()).to.equal(false);
          await setup.data.seed.connect(admin).close();
          expect(await setup.data.seed.closed()).to.equal(true);
        });
        it("refunds remaining seed tokens", async () => {
          let stBalance = await seedToken.balanceOf(setup.data.seed.address);
          await setup.data.seed
              .connect(admin)
              .retrieveSeedTokens(admin.address);
          expect(
              (await seedToken.balanceOf(admin.address)).toString()
          ).to.equal(stBalance.toString());
        });
        it("paused == false", async () => {
          expect(await setup.data.seed.paused()).to.equal(false);
        });
        it("it cannot buy when closed", async () => {
          await expectRevert(
              setup.data.seed.connect(buyer1).buy(buyAmount),
              "Seed: should not be closed"
          );
        });
        it("returns funding tokens to buyer", async () => {
          expect(
              (await fundingToken.balanceOf(buyer2.address)).toString()
          ).to.equal(zero.toString());

          const fundingAmount = await setup.data.seed
              .connect(buyer2)
              .callStatic.retrieveFundingTokens();

          await expect(setup.data.seed.connect(buyer2).retrieveFundingTokens())
              .to.emit(setup.data.seed, "FundingReclaimed")
              .withArgs(buyer2.address, fundingAmount);

          expect(
              (await fundingToken.balanceOf(buyer2.address)).toString()
          ).to.equal(smallBuyAmount.toString());
        });
      });
      context("» ERC20 transfer failure", () => {
        let alternativeSetup, fakeSeedToken;

        beforeEach(async () => {
          alternativeSetup = await deploy();
          const CustomERC20MockFactory = await ethers.getContractFactory(
              "CustomERC20Mock",
              root
          );
          fakeSeedToken = await CustomERC20MockFactory.deploy(
              "DAI Stablecoin",
              "DAI"
          );
          const altStartTime = await time.latest();
          const altEndTime = await altStartTime.add(
              await time.duration.days(7)
          );
          const altVestingDuration = time.duration.days(365);
          const altVestingCliff = time.duration.days(9);
          await alternativeSetup.seed.initialize(
              beneficiary.address,
              admin.address,
              [fakeSeedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              altStartTime.toNumber(),
              altEndTime.toNumber(),
              altVestingDuration.toNumber(),
              altVestingCliff.toNumber(),
              permissionedSeed,
              fee
          );
          await alternativeSetup.seed
              .connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);

          await fundingToken
              .connect(root)
              .transfer(buyer1.address, getFundingAmounts("102"));
          await fundingToken
              .connect(buyer1)
              .approve(alternativeSetup.seed.address, getFundingAmounts("102"));
          await fakeSeedToken
              .connect(root)
              .transfer(
                  alternativeSetup.seed.address,
                  requiredSeedAmount.toString()
              );          
        });

        it("reverts 'Seed: should transfer seed tokens to refund receiver' when time to refund is NOT reached", async () => {
          await alternativeSetup.seed
              .connect(alternativeSetup.roles.prime)
              .close();
          await fakeSeedToken.burn(alternativeSetup.seed.address);
          await expectRevert(
              alternativeSetup.seed.retrieveSeedTokens(root.address),
              "SafeERC20: ERC20 operation did not succeed"
          );
        });

        it("reverts 'Seed: should transfer seed tokens to refund receiver' when time to refund is NOT reached", async () => {
          await alternativeSetup.seed.connect(buyer1).buy(buyAmount);
          await time.increase(await time.duration.days(7));
          await alternativeSetup.seed
              .connect(alternativeSetup.roles.prime)
              .close();
          await expectRevert(
              alternativeSetup.seed.retrieveSeedTokens(root.address),
              "SafeERC20: ERC20 operation did not succeed"
          );
        });
      });
      context("» close after minimum reached", () => {
        before("!! deploy new contract + top up buyer balance", async () => {
          let newStartTime = await time.latest();
          let newEndTime = await newStartTime.add(await time.duration.days(7));

          setup.data.seed = await init.getContractInstance(
              "Seed",
              setup.roles.prime
          );
          setup;

          await fundingToken
              .connect(root)
              .transfer(buyer2.address, buyAmount.toString());
          await seedToken
              .connect(root)
              .transfer(setup.data.seed.address, requiredSeedAmount.toString());

          setup.data.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              newStartTime.toNumber(),
              newEndTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );
          await setup.data.seed
              .connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);


          await fundingToken
              .connect(buyer2)
              .approve(setup.data.seed.address, buyAmount);
          await setup.data.seed.connect(buyer2).buy(buyAmount);
        });
        it("it refunds only seed amount that are not bought", async () => {
          const buyFee = new BN(buySeedAmount)
              .mul(new BN(fee))
              .div(new BN(PRECISION.toString()));
          const prevBal = await seedToken.balanceOf(admin.address);
          await setup.data.seed.connect(admin).close();
          await setup.data.seed
              .connect(admin)
              .retrieveSeedTokens(admin.address);
          expect(
              (await seedToken.balanceOf(admin.address)).toString()
          ).to.equal(
              requiredSeedAmount
                  .add(new BN(prevBal.toString()))
                  .sub(new BN(buySeedAmount))
                  .sub(new BN(buyFee))
                  .toString()
          );
        });
        it("paused == false", async () => {
          expect(await setup.data.seed.paused()).to.equal(false);
        });
        it("it reverts setClass when Seed is closed", async () => {
          // await setup.data.seed.connect(admin).close();
          await expectRevert(
            setup.data.seed
                  .connect(admin)
                  .setClass(buyer3.address, 0),
            "Seed: should not be closed"
          );
        });
      });
      context(
          "retrieve seed tokens after minimum reached and contribution is closed",
          async () => {
            before("!! deploy new contract + top up buyer balance", async () => {
              let newStartTime = await time.latest();
              let newEndTime = await newStartTime.add(
                  await time.duration.days(7)
              );

              setup.data.seed = await init.getContractInstance(
                  "Seed",
                  setup.roles.prime
              );
              setup;

              await fundingToken
                  .connect(root)
                  .transfer(buyer2.address, buyAmount);
              await seedToken
                  .connect(root)
                  .transfer(setup.data.seed.address, requiredSeedAmount.toString());

              setup.data.seed.initialize(
                  beneficiary.address,
                  admin.address,
                  [seedToken.address, fundingToken.address],
                  [softCap, hardCap],
                  price,
                  newStartTime.toNumber(),
                  newEndTime.toNumber(),
                  vestingDuration.toNumber(),
                  vestingCliff.toNumber(),
                  permissionedSeed,
                  fee
              );

              await setup.data.seed
                  .connect(admin)
                  .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);

              await fundingToken
                  .connect(buyer2)
                  .approve(setup.data.seed.address, buyAmount);
              await setup.data.seed.connect(buyer2).buy(buyAmount);
            });
            it("cannot refund if only minimum is reached but contribution didn't end", async () => {
              await expect(
                  setup.data.seed.connect(admin).retrieveSeedTokens(admin.address)
              ).to.be.revertedWith(
                  "Seed: The ability to buy seed tokens must have ended before remaining seed tokens can be withdrawn"
              );
            });
            it("retrieves remaining seed tokens after minimumReached == true and contribution ended", async () => {
              await time.increase(time.duration.days(7));
              const buyFee = new BN(buySeedAmount)
                  .mul(new BN(fee))
                  .div(new BN(PRECISION.toString()));
              const prevBal = await seedToken.balanceOf(admin.address);
              await setup.data.seed.connect(admin).close();
              await setup.data.seed
                  .connect(admin)
                  .retrieveSeedTokens(admin.address);
              expect(
                  (await seedToken.balanceOf(admin.address)).toString()
              ).to.equal(
                  requiredSeedAmount
                      .add(new BN(prevBal.toString()))
                      .sub(new BN(buySeedAmount))
                      .sub(new BN(buyFee))
                      .toString()
              );
            });
          }
      );
    });
    context("# getter functions", () => {
      context("» checkWhitelisted", () => {
        it("returns correct bool", async () => {
          // default false - contract not whitelist contract
          expect(await setup.seed.whitelisted(buyer1.address)).to.equal(false);
        });
      });
      context("» getAmount", () => {
        it("returns correct amount", async () => {
          // get fundingAmount to calculate seedAmount
          expect(
              (await setup.seed.seedAmountForFunder(buyer1.address)).toString()
          ).to.equal(new BN(buySeedAmount).mul(new BN(twoBN)).toString());
        });
      });
      context("» getTotalClaimed", () => {
        it("returns correct claimed", async () => {
          expect(
              (await setup.seed.funders(buyer1.address)).totalClaimed.toString()
          ).to.equal(totalClaimedByBuyer1.toString());
        });
      });
      context("» getFee", () => {
        it("returns correct fee", async () => {
          let amount = new BN(buySeedAmount);
          let amountMinusFee = new BN(amount.mul(twoBN).div(new BN(hundred)));
          // get fundingAmount to calculate fee
          expect(
              (await setup.seed.feeForFunder(buyer1.address)).toString()
          ).to.equal(amountMinusFee.mul(twoBN).toString());
        });
      });
      describe("» getStartTime", () => {
        it("returns correct startTime", async () => {
          expect((await setup.seed.startTime()).toString()).to.equal(
              startTime.add(await time.duration.minutes(1)).toString()
          );
        });
      });
    });
    context("# admin functions", () => {
      before("!! setup", async () => {
        await setup.seed
            .connect(admin)
            .addClass(hardCap, e_twenty, e_twenty, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
      })
      context("» add class", () => {
        it("it adds class", () => {
          context("» generics", () => {
            it("it adds Customer class", async () => {
              await setup.seed
                  .connect(admin)
                  .addClass(hardCap, e_twenty, e_twenty, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
              expect(
                  (await setup.seed.classes(0))[0]
              ).to.equal((ethers.BigNumber.from(hardCap)));
            });
            it("it reverts when fee >= 45% for Customer class", async () => {
              const feeTooBig = parseEther("0.45").toString(); // 45%
              await expectRevert( 
                  setup.seed
                      .connect(admin)
                      .addClass(hardCap, e_twenty, e_twenty, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, feeTooBig),
                  "Seed: fee cannot be more than 45%"
              );
            });
          });
        });
        it("it adds batch of classes", () => {
          context("» generics", () => {
            it("it adds Customer class", async () => {
              await setup.seed
                  .connect(admin)
                  .addClassBatch([e_fourteen,e_twenty], [e_twenty,1e6], [e_twenty,1e6], [10000000,10000], [CLASS_VESTING_START_TIME, CLASS_VESTING_START_TIME], [CLASS_FEE, CLASS_FEE]);
              expect(
                  (await setup.seed.classes(3))[1]
              ).to.equal((ethers.BigNumber.from(e_twenty)));
            });
            it("it reverts when fee >= 45% for Customer class", async () => {
              const feeTooBig = parseEther("0.45").toString(); // 45%
              await expectRevert( 
                  setup.seed
                      .connect(admin)
                      .addClassBatch([e_fourteen,e_twenty], [e_twenty,1e6], [e_twenty,1e6], [10000000,10000], [CLASS_VESTING_START_TIME, CLASS_VESTING_START_TIME], [feeTooBig, feeTooBig]),
                  "Seed: fee cannot be more than 45%"
              );
            });
          });
        });
        
        it("it reverts when trying to add > 100 classes", () => { 
          context("» generics", () => {
            it("it adds Customer class", async () => {
              const arr1 = Array.from(Array(101).keys());
              const cvdArr = Array.from(Array(101).fill(CLASS_VESTING_DURATION));
              const cvstArr = Array.from(Array(101).fill(CLASS_VESTING_START_TIME));
              const feeArr = Array.from(Array(101).fill(CLASS_FEE));
              await expectRevert( 
                  setup.seed
                      .connect(admin)
                      .addClassBatch(arr1, arr1, arr1, cvdArr, cvstArr, feeArr),
                  "Seed: Can't add batch with more then 100 classes"
              );
            });
          });
        });

        it("it reverts when trying to add batch of Class", () => {
          context("» generics", () => {
            it("it adds Customer class", async () => {
              await expectRevert(
                  setup.seed
                      .connect(admin)
                      .addClassBatch([hardCap,e_twenty], [e_twenty], [e_twenty,1e6], [CLASS_VESTING_DURATION,10000], [CLASS_VESTING_START_TIME, CLASS_VESTING_START_TIME], [CLASS_FEE, CLASS_FEE]),
              "Seed: All provided arrays should be same size");
            });
          });
        });
        
        it("it reverts when trying to set non existent class with setClass", async () => {
          await expectRevert(
              setup.seed
                  .connect(admin)
                  .setClass(buyer3.address, 101),
              "Seed: incorrect class chosen"
          );
        });
        it("it reverts when trying to create class with vesting start time <= endTime", async () => {
          await expectRevert(
              setup.seed
                  .connect(admin)
                  .addClass(hardCap, hardCap, price, CLASS_VESTING_DURATION, endTime.toString(), CLASS_FEE),
              "Seed: vesting start time can't be less than endTime"
          );
        });
        it("it reverts when trying to create class with vesting start time <= endTime", async () => {
          await expectRevert(
            setup.seed
                .connect(admin)
                .addClassBatch([hardCap,e_twenty], [e_twenty, e_twenty], [e_twenty,1e6], [CLASS_VESTING_DURATION,10000], [endTime.toString(), startTime.toString()], [CLASS_FEE, CLASS_FEE]),
            "Seed: vesting start time can't be less than endTime"
          );
        });
      })
      context("» change class", () => {
        before("!! deploy new contract + top up buyer balance", async () => {
          let newStartTime = (await time.latest()).add(await time.duration.days(1));
          let newEndTime = await newStartTime.add(await time.duration.days(2));

          setup.data.seed = await init.getContractInstance(
              "Seed",
              setup.roles.prime
          );

          await seedToken
              .connect(root)
              .transfer(setup.data.seed.address, requiredSeedAmount.toString());
          await fundingToken
              .connect(root)
              .transfer(buyer2.address, smallBuyAmount);
          await fundingToken
              .connect(buyer2)
              .approve(setup.data.seed.address, smallBuyAmount);

          await setup.data.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              newStartTime.toNumber(),
              newEndTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );
          await setup.data.seed
              .connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
        });
          it("it changes Customer class", async () => {
            await setup.data.seed
                .connect(admin)
                .addClass(hardCap, e_twenty, e_twenty, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
            await setup.data.seed
                .connect(admin)
                .changeClass(0, e_twenty, e_twenty, e_twenty, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);   
            expect(
                (await setup.data.seed.classes(0))[0]
            ).to.equal((ethers.BigNumber.from(e_twenty)));
          });
          it("it reverts when incorrect class choosen", async () => {
            await expectRevert( 
              setup.data.seed
                  .connect(admin)
                  .changeClass(101, hardCap, e_twenty, e_twenty, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE),
                "Seed: incorrect class chosen"
            );
          });   
          it("it reverts when choosen vesting start time is less than endTime", async () => {
            let tooSmallVestingStartTime = (await time.latest()).toNumber();
            await expectRevert( 
              setup.data.seed
                  .connect(admin)
                  .changeClass(0, hardCap, e_twenty, e_twenty, CLASS_VESTING_DURATION, tooSmallVestingStartTime, CLASS_FEE),
                "Seed: vesting start time can't be less than endTime"
            );
          });   
          it("it reverts when fee >= 45% for choosen clas", async () => {
            const feeTooBig = parseEther("0.45").toString(); // 45%
            await expectRevert( 
              setup.data.seed
                  .connect(admin)
                  .changeClass(0, hardCap, e_twenty, e_twenty, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, feeTooBig),
                "Seed: fee cannot be more than 45%"
            );
          });  
          it("it reverts when vesting is already started", async () => {
            await time.increase(time.duration.days(2));
            await expectRevert( 
              setup.data.seed
                  .connect(admin)
                  .changeClass(0, hardCap, e_twenty, e_twenty, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE),
                "Seed: vesting is already started"
            );
          }); 
          it("it reverts when Seed is closed", async () => {
            await setup.data.seed
                .connect(admin)
                .close();
            await expectRevert( 
              setup.data.seed
                  .connect(admin)
                  .changeClass(0, hardCap, e_twenty, e_twenty, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE),
                "Seed: should not be closed"
            );
          });   
      });
      context("» update metadata", () => {
        it("can only be called by admin", async () => {
          await expectRevert(
              setup.seed.connect(buyer1).updateMetadata(metadata),
              "Seed: contract should not be initialized or caller should be admin"
          );
        });
        it("updates metadata", async () => {
          await expect(setup.seed.connect(admin).updateMetadata(metadata))
              .to.emit(setup.seed, "MetadataUpdated")
              .withArgs(metadata);
        });
      });
      context("» pause", () => {
        it("can only be called by admin", async () => {
          await expectRevert(
              setup.seed.connect(buyer1).pause(),
              "Seed: caller should be admin"
          );
        });
        it("pauses contract", async () => {
          await setup.seed.connect(admin).pause();
          expect(await setup.seed.paused()).to.equal(true);
        });
        it("it cannot buy when paused", async () => {
          await expectRevert(
              setup.seed.connect(buyer1).buy(buyAmount),
              "Seed: should not be paused"
          );
        });
      });
      context("» unpause", () => {
        context("seed is paused/closed", async () => {
          let alternativeSeed;

          beforeEach(async () => {
            let newStartTime = await time.latest();
            let newEndTime = await newStartTime.add(
                await time.duration.days(7)
            );

            alternativeSeed = await init.getContractInstance(
                "Seed",
                setup.roles.prime
            );
            await seedToken
                .connect(root)
                .transfer(alternativeSeed.address, requiredSeedAmount.toString());

            alternativeSeed.initialize(
                beneficiary.address,
                admin.address,
                [seedToken.address, fundingToken.address],
                [softCap, hardCap],
                price,
                newStartTime.toNumber(),
                newEndTime.toNumber(),
                vestingDuration.toNumber(),
                vestingCliff.toNumber(),
                permissionedSeed,
                fee
            );
          });

          it("reverts: 'Seed: should not be closed'", async () => {
            await time.increase(tenDaysInSeconds);
            await alternativeSeed.connect(admin).close();
            await expectRevert(
                alternativeSeed.connect(admin).unpause(),
                "Seed: should not be closed"
            );
          });

          it("trying to close again", async () => {
            await alternativeSeed.connect(admin).close();
            await expectRevert(
                alternativeSeed.connect(admin).close(),
                "Seed: should not be closed"
            );
          });

          it("reverts: 'Seed: should be paused'", async () => {
            await expectRevert(
                alternativeSeed.connect(admin).unpause(),
                "Seed: should be paused"
            );
          });
        });

        it("can only be called by admin", async () => {
          await expectRevert(
              setup.seed.connect(buyer1).unpause(),
              "Seed: caller should be admin"
          );
        });
        it("unpauses contract", async () => {
          await setup.seed.connect(admin).unpause();
          expect(await setup.seed.paused()).to.equal(false);
        });
      });
      context("» unwhitelist", () => {
        context("seed is closed", async () => {
          it("reverts: 'Seed: should not be closed'", async () => {
            const newStartTime = await time.latest();
            const newEndTime = await newStartTime.add(
                await time.duration.days(7)
            );

            const alternativeSeed = await init.getContractInstance(
                "Seed",
                setup.roles.prime
            );
            setup;
            await seedToken
                .connect(root)
                .transfer(alternativeSeed.address, requiredSeedAmount.toString());

            alternativeSeed.initialize(
                beneficiary.address,
                admin.address,
                [seedToken.address, fundingToken.address],
                [softCap, hardCap],
                price,
                newStartTime.toNumber(),
                newEndTime.toNumber(),
                vestingDuration.toNumber(),
                vestingCliff.toNumber(),
                permissionedSeed,
                fee
            );
            await alternativeSeed
                .connect(admin)
                .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
            await time.increase(tenDaysInSeconds);
            await alternativeSeed.close();
            await expectRevert(
                alternativeSeed.connect(admin).unwhitelist(buyer1.address),
                "Seed: should not be closed"
            );
          });
        });
        it("can only be called by admin", async () => {
          await expectRevert(
              setup.seed.connect(buyer1).unwhitelist(buyer1.address),
              "Seed: caller should be admin"
          );
        });
        it("reverts: can only be called on whitelisted contract", async () => {
          await expectRevert(
              setup.seed.connect(admin).whitelist(buyer1.address, 0),
              "Seed: seed is not whitelisted"
          );
        });
      });
      context("» whitelist", () => {
        context("seed is closed", async () => {
          it("reverts: 'Seed: should not be closed'", async () => {
            const newStartTime = await time.latest();
            const newEndTime = await newStartTime.add(
                await time.duration.days(7)
            );

            const alternativeSeed = await init.getContractInstance(
                "Seed",
                setup.roles.prime
            );
            setup;
            await seedToken
                .connect(root)
                .transfer(alternativeSeed.address, requiredSeedAmount.toString());

            alternativeSeed.initialize(
                beneficiary.address,
                admin.address,
                [seedToken.address, fundingToken.address],
                [softCap, hardCap],
                price,
                newStartTime.toNumber(),
                newEndTime.toNumber(),
                vestingDuration.toNumber(),
                vestingCliff.toNumber(),
                permissionedSeed,
                fee
            );
            await time.increase(tenDaysInSeconds);
            await alternativeSeed.close();
            await alternativeSeed
                .connect(admin)
                .addClass(hardCap, e_twenty, e_twenty, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
            await expectRevert(
                alternativeSeed.connect(admin).whitelist(buyer1.address, 0),
                "Seed: should not be closed"
            );
          });
        });
        it("can only be called by admin", async () => {
          await expectRevert(
              setup.seed.connect(buyer1).whitelist(buyer1.address, 0),
              "Seed: caller should be admin"
          );
        });
        it("reverts: can only be called on whitelisted contract", async () => {
          await expectRevert(
              setup.seed.connect(admin).whitelist(buyer1.address, 0),
              "Seed: seed is not whitelisted"
          );
        });
        it("reverts: can't set non existent class", async () => {
          await expectRevert(
              setup.seed.connect(admin).whitelist(buyer1.address, 101),
              "Seed: incorrect class chosen"
          );
        });
      });
      context("» withdraw", () => {
        before("!! deploy new contract", async () => {
          let newStartTime = await time.latest();
          let newEndTime = await newStartTime.add(await time.duration.days(7));

          setup.data.seed = await init.getContractInstance(
              "Seed",
              setup.roles.prime
          );

          await seedToken
              .connect(root)
              .transfer(setup.data.seed.address, requiredSeedAmount.toString());
          await fundingToken
              .connect(root)
              .transfer(buyer2.address, buyAmount.toString());
          await fundingToken
              .connect(buyer2)
              .approve(setup.data.seed.address, buyAmount.toString());

          setup.data.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              newStartTime.toNumber(),
              newEndTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );
          await setup.data.seed
              .connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);

        });
        it("can not withdraw before minumum funding amount is met", async () => {
          await expectRevert(
              setup.data.seed.connect(admin).withdraw(),
              "Seed: cannot withdraw while funding tokens can still be withdrawn by contributors"
          );
        });
        it("cannot withdraw after minimum funding amount is met", async () => {
          await setup.data.seed.connect(buyer2).buy(buyAmount);
          await expectRevert(
              setup.data.seed.connect(admin).withdraw(),
              "Seed: cannot withdraw while funding tokens can still be withdrawn by contributors"
          );
        });
        it("can only withdraw after vesting starts", async () => {
          await time.increase(time.duration.days(7));
          await setup.data.seed.connect(admin).withdraw();
          expect(
              (await fundingToken.balanceOf(setup.data.seed.address)).toString()
          ).to.equal(zero.toString());
          expect(
              (await fundingToken.balanceOf(admin.address)).toString()
          ).to.equal(buyAmount);
        });
        it("updates the amount of funding token withdrawn", async () => {
          await expect(
              (await setup.data.seed.fundingWithdrawn()).toString()
          ).to.equal(buyAmount);
        });
        it("can only be called by admin", async () => {
          await expectRevert(
              setup.seed.connect(buyer1).withdraw(),
              "Seed: caller should be admin"
          );
        });
      });
      context("» change class", () => {
        before("!! deploy new contract", async () => {
          let newStartTime = (await time.latest()).add(await time.duration.days(1));
          let newEndTime = await newStartTime.add(await time.duration.days(1));
          let newClassVestingStartTime = await newEndTime.add(await time.duration.days(1));

          setup.data.seed = await init.getContractInstance(
              "Seed",
              setup.roles.prime
          );

          await seedToken
              .connect(root)
              .transfer(setup.data.seed.address, requiredSeedAmount.toString());
          await fundingToken
              .connect(root)
              .transfer(buyer2.address, buyAmount.toString());
          await fundingToken
              .connect(buyer2)
              .approve(setup.data.seed.address, buyAmount.toString());

          setup.data.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              newStartTime.toNumber(),
              newEndTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );
          await setup.data.seed
              .connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, newClassVestingStartTime.toNumber(), CLASS_FEE);
        });
        it("it reverts when trying to set class when vesting is already started", async () => {
          await time.increase(time.duration.days(2));
          await expectRevert(
              setup.seed
                  .connect(admin)
                  .setClass(buyer2.address, 0),
              "Seed: vesting is already started"
          );
        });
      });
    });
  });
  context("creator is avatar -- whitelisted contract", () => {
    before("!! deploy setup", async () => {
      setup = await deploy();

      // Tokens used
      fundingToken = setup.token.fundingToken;
      fundingTokenDecimal = await getDecimals(fundingToken);
      getFundingAmounts = getTokenAmount(fundingTokenDecimal);

      seedToken = setup.token.seedToken;
      seedTokenDecimal = await getDecimals(seedToken);
      getSeedAmounts = getTokenAmount(seedTokenDecimal);

      // // Roles
      root = setup.roles.root;
      beneficiary = setup.roles.beneficiary;
      admin = setup.roles.prime;
      buyer1 = setup.roles.buyer1;
      buyer2 = setup.roles.buyer2;
      buyer3 = setup.roles.buyer3;

      // // Parameters to initialize seed contract
      softCap = getFundingAmounts("10").toString();
      hardCap = getFundingAmounts("102").toString();
      price = parseUnits(
          "0.01",
          parseInt(fundingTokenDecimal) - parseInt(seedTokenDecimal) + 18
      ).toString();
      buyAmount = getFundingAmounts("51").toString();
      startTime = await time.latest();
      endTime = await startTime.add(await time.duration.days(7));
      vestingDuration = time.duration.days(365); // 1 year
      vestingCliff = time.duration.days(90); // 3 months
      permissionedSeed = true;
      fee = parseEther("0.02").toString(); // 2%

      seedForDistribution = new BN(hardCap)
          .div(new BN(price))
          .mul(new BN(PRECISION.toString()));
      seedForFee = seedForDistribution
          .mul(new BN(fee))
          .div(new BN(PRECISION.toString()));
      requiredSeedAmount = seedForDistribution.add(seedForFee);
    });
    before("!! setup", async () => {
    });
    context("» contract is not initialized yet", () => {
      context("» parameters are valid", () => {
        before("!! deploy new contract", async () => {
          seed = await init.getContractInstance("Seed", setup.roles.prime);
          setup;
        });
        it("initializes", async () => {
          // emulate creation & initialization via seedfactory & fund with seedTokens
          await seedToken
              .connect(root)
              .transfer(seed.address, requiredSeedAmount.toString());

          await seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              startTime.toNumber(),
              endTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );
          expect(await seed.initialized()).to.equal(true);
          expect(await seed.beneficiary()).to.equal(beneficiary.address);
          expect(await seed.admin()).to.equal(admin.address);
          expect(await seed.seedToken()).to.equal(seedToken.address);
          expect(await seed.fundingToken()).to.equal(fundingToken.address);
          expect((await seed.softCap()).toString()).to.equal(softCap);
          expect(await seed.permissionedSeed()).to.equal(permissionedSeed);
          expect(await seed.closed()).to.equal(false);
          expect((await seed.seedAmountRequired()).toString()).to.equal(
              seedForDistribution.toString()
          );
          expect((await seed.feeAmountRequired()).toString()).to.equal(
              seedForFee.toString()
          );
          expect((await seed.seedRemainder()).toString()).to.equal(
              seedForDistribution.toString()
          );
          expect((await seed.feeRemainder()).toString()).to.equal(
              seedForFee.toString()
          );
          expect((await seedToken.balanceOf(seed.address)).toString()).to.equal(
              requiredSeedAmount.toString()
          );
        });
        it("it reverts on double initialization", async () => {
          await expectRevert(
              seed.initialize(
                  beneficiary.address,
                  admin.address,
                  [seedToken.address, fundingToken.address],
                  [softCap, hardCap],
                  price,
                  startTime.toNumber(),
                  endTime.toNumber(),
                  vestingDuration.toNumber(),
                  vestingCliff.toNumber(),
                  permissionedSeed,
                  fee
              ),
              "Seed: contract already initialized"
          );
        });
      });
    });
    context("# admin whitelist functions", () => {
      context("» whitelist", () => {
        it("adds a user to the whitelist", async () => {
          expect(await seed.whitelisted(buyer1.address)).to.equal(false);
          await seed.connect(admin).whitelist(buyer1.address, 0);
          expect(await seed.whitelisted(buyer1.address)).to.equal(true);
          expect((await seed.funders(buyer1.address))['class']).to.equal(0);
        });
      });
      context("» unwhitelist", () => {
        it("removes a user from the whitelist", async () => {
          expect(await seed.whitelisted(buyer1.address)).to.equal(true);
          await seed.connect(admin).unwhitelist(buyer1.address);
          expect(await seed.whitelisted(buyer1.address)).to.equal(false);
        });
        it("reverts when unwhitelist account buys", async () => {
          await seed.connect(admin)
              .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
          await expectRevert(
              seed.connect(buyer1).buy(getFundingAmounts("1").toString()),
              "Seed: sender has no rights"
          );
        });
      });
      context("» whitelistBatch", () => {
        context("seed is closed", async () => {
          it("reverts: 'Seed: should not be closed'", async () => {
            const newStartTime = await time.latest();
            const newEndTime = await newStartTime.add(
                await time.duration.days(7)
            );

            const alternativeSeed = await init.getContractInstance(
                "Seed",
                setup.roles.prime
            );
            setup;
            await seedToken
                .connect(root)
                .transfer(alternativeSeed.address, requiredSeedAmount.toString());

            alternativeSeed.initialize(
                beneficiary.address,
                admin.address,
                [seedToken.address, fundingToken.address],
                [softCap, hardCap],
                price,
                newStartTime.toNumber(),
                newEndTime.toNumber(),
                vestingDuration.toNumber(),
                vestingCliff.toNumber(),
                permissionedSeed,
                fee
            );
            await time.increase(tenDaysInSeconds);
            await alternativeSeed.close();
            await expectRevert(
                alternativeSeed
                    .connect(admin)
                    .whitelistBatch([buyer1.address, buyer2.address], [0, 0]),
                "Seed: should not be closed"
            );
          });
        });
        it("can only be called by admin", async () => {
          await expectRevert(
              seed
                  .connect(buyer1)
                  .whitelistBatch([buyer1.address, buyer2.address], [0, 0]),
              "Seed: caller should be admin"
          );
        });
        it("adds users to the whitelist", async () => {
          expect(await seed.whitelisted(buyer3.address)).to.equal(false);
          expect(await seed.whitelisted(buyer4.address)).to.equal(false);

          await seed
              .connect(admin)
              .whitelistBatch([buyer3.address, buyer4.address], [0, 0]);

          expect(await seed.whitelisted(buyer3.address)).to.equal(true);
          expect(await seed.whitelisted(buyer4.address)).to.equal(true);
          expect(await seed.isWhitelistBatchInvoked()).to.equal(true);
        });
        it("reverts: can't set non existent class", async () => {
          await expectRevert(
              seed
                  .connect(admin)
                  .whitelistBatch([buyer3.address, buyer4.address], [101, 101]),
              "Seed: incorrect class chosen"
          );
        });
      });
    });
    context("# hardCap", () => {
      context("» check hardCap", () => {
        it("cannot buy more than hardCap", async () => {
          const newStartTime = await time.latest();
          const newEndTime = await newStartTime.add(
              await time.duration.days(7)
          );
          const alternativeSetup = await deploy();
          await alternativeSetup.seed.initialize(
              beneficiary.address,
              admin.address,
              [seedToken.address, fundingToken.address],
              [softCap, hardCap],
              price,
              newStartTime.toNumber(),
              newEndTime.toNumber(),
              vestingDuration.toNumber(),
              vestingCliff.toNumber(),
              permissionedSeed,
              fee
          );
          await alternativeSetup.seed
              .connect(admin)
              .addClass(hardCap, hardCap, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
          await seedToken
              .connect(root)
              .transfer(
                  alternativeSetup.seed.address,
                  requiredSeedAmount.toString()
              );
          await fundingToken
              .connect(root)
              .transfer(buyer2.address, getFundingAmounts("102"));
          await fundingToken
              .connect(buyer2)
              .approve(alternativeSetup.seed.address, getFundingAmounts("102"));
          await alternativeSetup.seed.connect(admin).addClass(hardCap, e_twenty, e_twenty, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
          await alternativeSetup.seed.connect(admin).whitelist(buyer2.address, 0);
          await alternativeSetup.seed
              .connect(buyer2)
              .buy(getFundingAmounts("102"));
          await expectRevert(
              alternativeSetup.seed.connect(buyer2).buy(twoHundredFourETH),
              "Seed: maximum funding reached"
          );
        });
      });
    });
  });
  context("» price test of tokens with decimals 6", () => {
    before("!! setup", async () => {
      setup = await deploy();

      const CustomDecimalERC20Mock = await ethers.getContractFactory(
          "CustomDecimalERC20Mock",
          setup.roles.root
      );

      // Tokens used
      fundingToken = await CustomDecimalERC20Mock.deploy("USDC", "USDC", 6);
      fundingTokenDecimal = await getDecimals(fundingToken);
      getFundingAmounts = getTokenAmount(fundingTokenDecimal);

      seedToken = setup.token.seedToken;
      seedTokenDecimal = await getDecimals(seedToken);
      getSeedAmounts = getTokenAmount(seedTokenDecimal);

      // // Roles
      root = setup.roles.root;
      beneficiary = setup.roles.beneficiary;
      admin = setup.roles.prime;
      buyer1 = setup.roles.buyer1;
      buyer2 = setup.roles.buyer2;
      buyer3 = setup.roles.buyer3;

      // // Parameters to initialize seed contract
      softCap = getFundingAmounts("10").toString();
      hardCap = getFundingAmounts("102").toString();
      buyAmount = getFundingAmounts("51").toString();
      smallBuyAmount = getFundingAmounts("9").toString();
      buySeedAmount = getSeedAmounts("5100").toString();
      price = parseUnits(
          "1",
          parseInt(fundingTokenDecimal) - parseInt(seedTokenDecimal) + 18
      ).toString();
      startTime = await time.latest();
      endTime = await startTime.add(await time.duration.days(7));
      vestingDuration = time.duration.days(365); // 1 year
      vestingCliff = time.duration.days(90); // 3 months
      permissionedSeed = false;
      fee = parseEther("0.02").toString(); // 2%
      metadata = `0x`;

      buySeedFee = new BN(buySeedAmount)
          .mul(new BN(fee))
          .div(new BN(PRECISION.toString()));
      seedForDistribution = new BN(hardCap)
          .mul(new BN(PRECISION.toString()))
          .div(new BN(price));
      seedForFee = seedForDistribution
          .mul(new BN(fee))
          .div(new BN(PRECISION.toString()));
      requiredSeedAmount = seedForDistribution.add(seedForFee);

      await setup.seed.initialize(
          beneficiary.address,
          admin.address,
          [seedToken.address, fundingToken.address],
          [softCap, hardCap],
          price,
          startTime.toNumber(),
          endTime.toNumber(),
          vestingDuration.toNumber(),
          vestingCliff.toNumber(),
          permissionedSeed,
          fee
      );
      await setup.seed
          .connect(admin)
          .addClass(hardCap, hardCap, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
      await fundingToken
          .connect(root)
          .transfer(buyer1.address, getFundingAmounts("102"));
      await fundingToken
          .connect(buyer1)
          .approve(setup.seed.address, getFundingAmounts("102"));

      claimAmount = new BN(ninetyTwoDaysInSeconds).mul(
          new BN(buySeedAmount).mul(new BN(twoBN)).div(new BN(vestingDuration))
      );
      feeAmount = new BN(claimAmount)
          .mul(new BN(fee))
          .div(new BN(PRECISION.toString()));
      await seedToken
          .connect(root)
          .transfer(setup.seed.address, requiredSeedAmount.toString());
    });
    it("$ buys with one funding token", async () => {
      const oneFundingTokenAmount = getFundingAmounts("1");
      await fundingToken
          .connect(buyer1)
          .approve(setup.seed.address, oneFundingTokenAmount);
      await setup.seed.connect(buyer1).buy(oneFundingTokenAmount);
      const expectedSeedAmount = oneFundingTokenAmount
          .mul(PRECISION)
          .div(BigNumber.from(price));
      expect(
          (await setup.seed.seedAmountForFunder(buyer1.address)).eq(
              expectedSeedAmount
          )
      ).to.be.true;
    });
  });
  context("» price test of both tokens with decimals 6", () => {
    before("!! setup", async () => {
      setup = await deploy();

      // Tokens used
      const CustomDecimalERC20Mock = await ethers.getContractFactory(
          "CustomDecimalERC20Mock",
          setup.roles.root
      );
      fundingToken = await CustomDecimalERC20Mock.deploy("USDC", "USDC", 6);
      fundingTokenDecimal = await getDecimals(fundingToken);
      getFundingAmounts = getTokenAmount(fundingTokenDecimal);

      seedToken = await CustomDecimalERC20Mock.deploy("Prime", "Prime", 6);
      seedTokenDecimal = await getDecimals(seedToken);
      getSeedAmounts = getTokenAmount(seedTokenDecimal);

      // // Roles
      root = setup.roles.root;
      beneficiary = setup.roles.beneficiary;
      admin = setup.roles.prime;
      buyer1 = setup.roles.buyer1;
      buyer2 = setup.roles.buyer2;
      buyer3 = setup.roles.buyer3;

      // // Parameters to initialize seed contract
      softCap = getFundingAmounts("10").toString();
      hardCap = getFundingAmounts("102").toString();
      buyAmount = getFundingAmounts("51").toString();
      smallBuyAmount = getFundingAmounts("9").toString();
      buySeedAmount = getSeedAmounts("5100", seedTokenDecimal).toString();
      price = parseUnits(
          "1",
          parseInt(fundingTokenDecimal) - parseInt(seedTokenDecimal) + 18
      ).toString();
      startTime = await time.latest();
      endTime = await startTime.add(await time.duration.days(7));
      vestingDuration = time.duration.days(365); // 1 year
      vestingCliff = time.duration.days(90); // 3 months
      permissionedSeed = false;
      fee = parseEther("0.02").toString(); // 2%
      metadata = `0x`;

      buySeedFee = new BN(buySeedAmount)
          .mul(new BN(fee))
          .div(new BN(PRECISION.toString()));
      seedForDistribution = new BN(hardCap)
          .mul(new BN(PRECISION.toString()))
          .div(new BN(price));
      seedForFee = seedForDistribution
          .mul(new BN(fee))
          .div(new BN(PRECISION.toString()));
      requiredSeedAmount = seedForDistribution.add(seedForFee);

      await setup.seed.initialize(
          beneficiary.address,
          admin.address,
          [seedToken.address, fundingToken.address],
          [softCap, hardCap],
          price,
          startTime.toNumber(),
          endTime.toNumber(),
          vestingDuration.toNumber(),
          vestingCliff.toNumber(),
          permissionedSeed,
          fee
      );
      await setup.seed
          .connect(admin)
          .addClass(hardCap, CLASS_PERSONAL_FUNDING_LIMIT, price, CLASS_VESTING_DURATION, CLASS_VESTING_START_TIME, CLASS_FEE);
      await fundingToken
          .connect(root)
          .transfer(buyer1.address, getFundingAmounts("102"));
      await fundingToken
          .connect(buyer1)
          .approve(setup.seed.address, getFundingAmounts("102"));

      claimAmount = new BN(ninetyTwoDaysInSeconds).mul(
          new BN(buySeedAmount).mul(new BN(twoBN)).div(new BN(vestingDuration))
      );
      feeAmount = new BN(claimAmount)
          .mul(new BN(fee))
          .div(new BN(PRECISION.toString()));
      await seedToken
          .connect(root)
          .transfer(admin.address, requiredSeedAmount.toString());
      await seedToken
          .connect(admin)
          .transfer(setup.seed.address, requiredSeedAmount.toString());
    });
    it("$ buys with one funding token", async () => {
      const oneFundingTokenAmount = getFundingAmounts("100");
      await fundingToken
          .connect(buyer1)
          .approve(setup.seed.address, oneFundingTokenAmount);
      await setup.seed.connect(buyer1).buy(oneFundingTokenAmount);
      const expectedSeedAmount = oneFundingTokenAmount
          .mul(PRECISION)
          .div(BigNumber.from(price));
      expect(
          (await setup.seed.seedAmountForFunder(buyer1.address)).eq(
              expectedSeedAmount
          )
      ).to.be.true;
    });
  });

  context("creator is avatar -- whitelisted contract few classes simultanuosly test", () => {
    before("!! deploy setup", async () => {
        setup = await deploy();

        const CustomDecimalERC20Mock = await ethers.getContractFactory(
            "CustomDecimalERC20Mock",
            setup.roles.root
        );
  
        // Tokens used
        fundingToken = await CustomDecimalERC20Mock.deploy("USDC", "USDC", 16);
        fundingTokenDecimal = (await getDecimals(fundingToken)).toString();
        getFundingAmounts = getTokenAmount(fundingTokenDecimal);
  
        // seedToken = setup.token.seedToken;
        seedToken = await CustomDecimalERC20Mock.deploy("Prime", "Prime", 12);
        seedTokenDecimal = (await getDecimals(seedToken)).toString();
        getSeedAmounts = getTokenAmount(seedTokenDecimal);
  
        // // Roles
        root = setup.roles.root;
        beneficiary = setup.roles.beneficiary;
        admin = setup.roles.prime;
        buyer1 = setup.roles.buyer1;
        buyer2 = setup.roles.buyer2;
        buyer3 = setup.roles.buyer3;
        buyer4 = setup.roles.buyer4;
  
        // // Parameters to initialize seed contract
        softCap = getFundingAmounts("10").toString();
        hardCap = getFundingAmounts("102").toString();
        price = parseUnits(
            "0.01",
            parseInt(fundingTokenDecimal) - parseInt(seedTokenDecimal) + 18
        ).toString();   
        price_class1 = parseUnits(
            "0.02",
            parseInt(fundingTokenDecimal) - parseInt(seedTokenDecimal) + 18
        ).toString();  
        buyAmount = getFundingAmounts("51").toString();
        smallBuyAmount = getFundingAmounts("9").toString();
        elevenBuyAmount = getFundingAmounts("11").toString(); //11 + 9 = 20
        buySmallSeedAmount = getSeedAmounts("900").toString();
        buySeedAmount = getSeedAmounts("5100").toString();
        startTime = (await time.latest()).add(await time.duration.days(1));
        endTime = await startTime.add(await time.duration.days(7));
        vestingDuration = time.duration.days(365); // 1 year
        vestingCliff = time.duration.days(90); // 3 months
        permissionedSeed = false;
        fee = parseEther("0.44").toString(); // 44%
        metadata = `0x`;
  
        buySeedFee = new BN(buySeedAmount)
            .mul(new BN(fee))
            .div(new BN(PRECISION.toString()));
        seedForDistribution = new BN(hardCap)
            .mul(new BN(PRECISION.toString()))
            .div(new BN(price));
        seedForFee = seedForDistribution
            .mul(new BN(fee))
            .div(new BN(PRECISION.toString()));
        requiredSeedAmount = seedForDistribution.add(seedForFee);

        newClassVestingStartTime = await endTime.add(await time.duration.days(4));
        localVestingDuration = time.duration.days(10);   
        localVestingCliff = time.duration.days(5);
        SECOND_CLASS_VESTING_START_TIME = await newClassVestingStartTime.add(await time.duration.days(2));
        CLASS_TWO_PERSONAL_FUNDING_LIMIT = ethers.BigNumber.from("18000000000000000000").toString();
        CLASS_25_PERSONAL_FUNDING_LIMIT = ethers.BigNumber.from("250000000000000000").toString(); 
    });
    context("# few classes simultanuosly; contract whitelisted version", () => {
        it("initializes", async () => {
            // emulate creation & initialization via seedfactory & fund with seedTokens
            permissionedSeed = true;
            await setup.seed.initialize(
                beneficiary.address,
                admin.address,
                [seedToken.address, fundingToken.address],
                [softCap, hardCap],
                price,
                startTime.toNumber(),
                endTime.toNumber(),
                localVestingDuration.toNumber(),
                localVestingCliff.toNumber(),
                permissionedSeed,
                fee
            );
            await seedToken
                .connect(root)
                .transfer(setup.seed.address, requiredSeedAmount.toString());
            await fundingToken
                .connect(root)
                .transfer(buyer1.address, getFundingAmounts("102"));
            await fundingToken
                .connect(buyer1)
                .approve(setup.seed.address, getFundingAmounts("102"));
            await fundingToken
                .connect(root)
                .transfer(buyer3.address, getFundingAmounts("102"));
            await fundingToken
                .connect(buyer3)
                .approve(setup.seed.address, getFundingAmounts("102"));

            claimAmount_class1 = new BN(time.duration.days(4)).mul(
                new BN(buySeedAmount)
                    .mul(new BN(PRECISION.toString()))
                    .div(new BN(price_class1))
                    .div(new BN(localVestingDuration)));
            feeAmount_class1 = new BN(claimAmount_class1)
                .mul(new BN(CLASS_FEE))
                .div(new BN(PRECISION.toString()));

            claimAmount_class2 = new BN(time.duration.days(1)).mul(
                new BN(buySeedAmount)
                    .mul(new BN(PRECISION.toString()))
                    .div(new BN(price))
                    .div(new BN(localVestingDuration)));
            feeAmount_class2 = new BN(claimAmount_class1)
                .mul(new BN(SECOND_CLASS_FEE))
                .div(new BN(PRECISION.toString()));
        });
        it("adds new classes", async () => {
            await setup.seed //class 1 and 2
              .connect(admin)
              .addClassBatch ([CLASS_SMALL_PERSONAL_FUNDING_LIMIT, CLASS_20_PERSONAL_FUNDING_LIMIT],
                            [CLASS_18_PERSONAL_FUNDING_LIMIT, CLASS_18_PERSONAL_FUNDING_LIMIT],
                            [price, price],
                            [localVestingDuration.toNumber(), localVestingDuration.toNumber()],
                            [newClassVestingStartTime.toNumber(), SECOND_CLASS_VESTING_START_TIME.toNumber()],
                            [CLASS_FEE, SECOND_CLASS_FEE]);
        });
        it("it changes Customer class 1", async () => {
            await setup.seed
              .connect(admin)
              .changeClass(1, CLASS_25_PERSONAL_FUNDING_LIMIT, CLASS_20_PERSONAL_FUNDING_LIMIT, price_class1, localVestingDuration.toNumber(), newClassVestingStartTime.toNumber(), CLASS_FEE);
            expect(
              (await setup.seed.classes(1))[1]
            ).to.equal((ethers.BigNumber.from(CLASS_20_PERSONAL_FUNDING_LIMIT)));
            expect(
                (await setup.seed.classes(1))[2]
            ).to.equal((ethers.BigNumber.from(price_class1)));
        });
        it("it whitelists users", async () => {
          await setup.seed
              .connect(admin)
              .whitelist(buyer1.address, 2);
          await setup.seed
              .connect(admin)
              .whitelist(buyer3.address, 1); 
          await setup.seed
              .connect(admin)
              .whitelist(buyer4.address, 1); 
  
          expect(
              (await setup.seed.funders(buyer1.address))[0].toString()
          ).to.equal(ethers.BigNumber.from(2).toString());
          expect(
              (await setup.seed.funders(buyer3.address))[0].toString()
          ).to.equal(ethers.BigNumber.from(1).toString());
          expect(
            (await setup.seed.funders(buyer4.address))[0].toString()
          ).to.equal(ethers.BigNumber.from(1).toString());
        });
        it("it changes class", async () => {
            await setup.seed
                .connect(admin)
                .setClass(buyer4.address, 2); 
            expect(
              (await setup.seed.funders(buyer4.address))[0].toString()
            ).to.equal(ethers.BigNumber.from(2).toString());
        });
        context("» unwhitelist", () => {
            it("removes a user from the whitelist", async () => {
              expect(await setup.seed.whitelisted(buyer4.address)).to.equal(true);
              await setup.seed.connect(admin).unwhitelist(buyer4.address);
              expect(await setup.seed.whitelisted(buyer4.address)).to.equal(false);
            });
            it("reverts when unwhitelist account buys", async () => {
              await expectRevert(
                    setup.seed.connect(buyer4).buy(getFundingAmounts("1").toString()),
                    "Seed: sender has no rights"
              );
            });
        });
        it("it buys tokens buyer3", async () => {
            await time.increase(time.duration.days(1));

            // seedAmount = (buyAmountt*PRECISION)/price;
            seedAmount = new BN(smallBuyAmount)
                .mul(new BN(PRECISION.toString()))
                .div(new BN(price_class1));
  
            await expect(setup.seed.connect(buyer3).buy(smallBuyAmount))
                .to.emit(setup.seed, "SeedsPurchased")
                .withArgs(buyer3.address, seedAmount);
            expect(
                (await fundingToken.balanceOf(setup.seed.address)).toString()
            ).to.equal(
                Math.floor((buySmallSeedAmount * price) / PRECISION).toString()
            );
        });
        it("cannot buy more than class 1 allows class funding", async () => {
          await expectRevert(
            setup.seed
                .connect(buyer3)
                .buy(CLASS_TWO_PERSONAL_FUNDING_LIMIT.toString()),
            "Seed: maximum class funding reached"
          );
        });
        it("cannot withdraw before minumum funding amount is met", async () => {
          await expectRevert(
            setup.seed.connect(admin).withdraw(),
              "Seed: cannot withdraw while funding tokens can still be withdrawn by contributors"
          );
        });
        it("it cannot claim when minimum funding amount not met", async () => {
          await expectRevert(
            setup.seed.
                  connect(buyer1)
                  .claim(buyer1.address, claimAmount_class2.toString()), 
              "Seed: minimum funding amount not met"
          );
        }); 
        it("it buys tokens buyer1", async () => {
            // seedAmount = (buyAmountt*PRECISION)/price;
            seedAmount = new BN(smallBuyAmount)
                .mul(new BN(PRECISION.toString()))
                .div(new BN(price));
            await expect(setup.seed.connect(buyer1).buy(smallBuyAmount))
                .to.emit(setup.seed, "SeedsPurchased")
                .withArgs(buyer1.address, seedAmount);
            expect(
                (await fundingToken.balanceOf(setup.seed.address)).toString()
            ).to.equal(
                Math.floor((buySmallSeedAmount * price) / PRECISION * 2).toString() // * 2 because we already bought from buyer3
            );
        });
        it("cannot buy more than class 2 allows personal funding", async () => {
            await expectRevert(
                setup.seed.connect(buyer1).buy(elevenBuyAmount),
                "Seed: maximum personal funding reached"
            )
        });
        it("it cannot claim when vesting start time for this class is not started yet buyer3", async () => {
          await time.increase(time.duration.days(7));
          await time.increase(time.duration.days(1));

          await expectRevert(
              setup.seed.
                  connect(buyer3)
                  .claim(buyer3.address, claimAmount_class1.toString()), 
              "Seed: vesting start time for this class is not started yet"
          );
        });
        it("it cannot claim when vesting start time for this class is not started yet buyer1", async () => {
            await expectRevert(
                setup.seed.
                    connect(buyer1)
                    .claim(buyer1.address, claimAmount_class2.toString()), 
                "Seed: vesting start time for this class is not started yet"
            );
        });    
        it("it cannot claim before vestingCliff buyer3", async () => {
          await time.increase(time.duration.days(3)); //so it will be endTime
  
          await expectRevert(
              setup.seed
                  .connect(buyer3)
                  .claim(buyer3.address, claimAmount_class1.toString()),
              "Seed: amount claimable is 0"
          );
        });
        it("calculates correct claim buyer3", async () => {
          // increase time
          await time.increase(time.duration.days(5)); //passing Cliff

          const claim = await setup.seed.calculateClaim(buyer3.address);
          const currentVestingStartTime = (await setup.seed.classes(1))[4];
          const currentVestingDuration = (await setup.seed.classes(1))[3];
     
          const expectedClaim = (await time.latest())
              .sub(new BN(currentVestingStartTime.toNumber()))
              .mul(new BN(smallBuyAmount))
              .mul(new BN(PRECISION.toString()))
              .div(new BN(price_class1))
              .div(new BN(currentVestingDuration.toNumber()));
  
          expect(claim.toString()).to.equal(expectedClaim.toString());
        });
        it("calculates correct claim buyer1", async () => {
            // increase time
            await time.increase(time.duration.days(2)); //passing Cliff
            // increase by 2 days because of:
            // SECOND_CLASS_VESTING_START_TIME = await newClassVestingStartTime.add(await time.duration.days(2));

            const claim = await setup.seed.calculateClaim(buyer1.address);
            const currentVestingStartTime = (await setup.seed.classes(2))[4];
            const currentVestingDuration = (await setup.seed.classes(2))[3];

            // const divisor = 100; //expectedClaim without divisor / claim = 2332989000000000 / 23329890000000 = 100
            /* .div(new BN(divisor)) 
                was changed to 
                    .mul(new BN(PRECISION.toString()))
                    .div(new BN(price)) */
            const expectedClaim = (await time.latest())
                .sub(new BN(currentVestingStartTime.toNumber()))
                .mul(new BN(smallBuyAmount))
                .mul(new BN(PRECISION.toString()))
                .div(new BN(price))
                .div(new BN(currentVestingDuration.toNumber()));
        
            expect(claim.toString()).to.equal(expectedClaim.toString());
        });
        it("it returns amount of the fee buyer3", async () => {
          await time.increase(time.duration.days(3));    
          let feeSent = await setup.seed
              .connect(buyer3)
              .callStatic.claim(buyer3.address, claimAmount_class1.toString());
          expect(feeSent.toString()).to.equal(feeAmount_class1.toString());
        });
        it("it returns amount of the fee buyer1", async () => {
            await time.increase(time.duration.days(3));
            const currentClaimable = ethers.BigNumber.from("46657890000000"); // value from expectedClaim from second 'it' above
    
            feeAmount = new BN(46657890000000)
                .mul(new BN(CLASS_FEE))
                .div(new BN(PRECISION.toString()));
    
            let feeSent = await setup.seed
                .connect(buyer3)
                .callStatic.claim(buyer3.address, currentClaimable.toString());
            expect(feeSent.toString()).to.equal(feeAmount.toString());
        });
        it("claims all seeds after vesting duration buyer3", async () => {
          await time.increase(time.duration.days(4));
  
          setup.prevBalance = await seedToken.balanceOf(
              beneficiary.address
          );
  
          smallBuyAmount = getFundingAmounts("9").toString();
          // amountClaimable 1020000000 --> 10200000000000000/1020000000 = 1000000000
          const divisor = 1000000000;
          const claimTemp = new BN(smallBuyAmount).mul(new BN(twoBN)).div(new BN(divisor)).div(new BN(2)).toString();  
          feeAmountOnClaim = new BN(claimTemp)
              .mul(new BN(CLASS_FEE))
              .div(new BN(PRECISION.toString()));
  
          await expect(
              setup.seed
                  .connect(buyer3)
                  .claim(buyer3.address, claimTemp.toString())
          )
              .to.emit(setup.seed, "TokensClaimed")
              .withArgs(
                  buyer3.address,
                  claimTemp.toString(),
                  beneficiary.address,
                  feeAmountOnClaim.toString()
              );
        });
        it("claims all seeds after vesting duration buyer1", async () => {
          setup.prevBalance = await seedToken.balanceOf(
              beneficiary.address
          );
  
          smallBuyAmount = getFundingAmounts("18").toString();
          // amountClaimable 1020000000 --> 10200000000000000/1020000000 = 1000000000
          const divisor = 1000000000;
          const claimTemp = new BN(smallBuyAmount).mul(new BN(twoBN)).div(new BN(divisor)).div(new BN(2)).toString();
          feeAmountOnClaim = new BN(claimTemp)
              .mul(new BN(SECOND_CLASS_FEE))
              .div(new BN(PRECISION.toString()));
  
          await expect(
              setup.seed
                  .connect(buyer1)
                  .claim(buyer1.address, claimTemp.toString())
          )
              .to.emit(setup.seed, "TokensClaimed")
              .withArgs(
                  buyer1.address,
                  claimTemp.toString(),
                  beneficiary.address,
                  feeAmountOnClaim.toString()
              );
        });
        it("can only withdraw after vesting starts", async () => {
          await setup.seed.connect(admin).withdraw();
          expect(
              (await fundingToken.balanceOf(setup.seed.address)).toString()
          ).to.equal(zero.toString());
  
          const expectedBalance = ethers.BigNumber.from(smallBuyAmount);
       
          expect(
              (await fundingToken.balanceOf(admin.address)).toString() 
          ).to.equal(expectedBalance);
        });
        it("updates the amount of funding token withdrawn", async () => {
          const maxWithdrawAmount = ethers.BigNumber.from(getFundingAmounts("9").mul(2));
          await expect(
              (await setup.seed.fundingWithdrawn()).toString()
          ).to.equal(maxWithdrawAmount);
        });
      });
  });
  context("creator is avatar -- non-whitelisted contract few classes simultanuosly test", () => {
    before("!! deploy setup", async () => {
        setup = await deploy();

        const CustomDecimalERC20Mock = await ethers.getContractFactory(
            "CustomDecimalERC20Mock",
            setup.roles.root
        );
  
        // Tokens used
        // fundingToken = setup.token.fundingToken;
        fundingToken = await CustomDecimalERC20Mock.deploy("USDC", "USDC", 16);
        fundingTokenDecimal = (await getDecimals(fundingToken)).toString();
        getFundingAmounts = getTokenAmount(fundingTokenDecimal);
  
        // seedToken = setup.token.seedToken;
        seedToken = await CustomDecimalERC20Mock.deploy("Prime", "Prime", 12);
        seedTokenDecimal = (await getDecimals(seedToken)).toString();
        getSeedAmounts = getTokenAmount(seedTokenDecimal);
  
        // // Roles
        root = setup.roles.root;
        beneficiary = setup.roles.beneficiary;
        admin = setup.roles.prime;
        buyer1 = setup.roles.buyer1;
        buyer2 = setup.roles.buyer2;
        buyer3 = setup.roles.buyer3;
        buyer4 = setup.roles.buyer4;
  
        // // Parameters to initialize seed contract
        softCap = getFundingAmounts("10").toString();
        hardCap = getFundingAmounts("102").toString();
        price = parseUnits(
            "0.01",
            parseInt(fundingTokenDecimal) - parseInt(seedTokenDecimal) + 18
        ).toString();   
        price_class1 = parseUnits(
            "0.02",
            parseInt(fundingTokenDecimal) - parseInt(seedTokenDecimal) + 18
        ).toString();  
        buyAmount = getFundingAmounts("51").toString();
        smallBuyAmount = getFundingAmounts("9").toString();
        elevenBuyAmount = getFundingAmounts("11").toString(); //11 + 9 = 20
        buySmallSeedAmount = getSeedAmounts("900").toString();
        buySeedAmount = getSeedAmounts("5100").toString();
        startTime = (await time.latest()).add(await time.duration.days(1));
        endTime = await startTime.add(await time.duration.days(7));
        vestingDuration = time.duration.days(365); // 1 year
        vestingCliff = time.duration.days(90); // 3 months
        permissionedSeed = false;
        fee = parseEther("0.2").toString(); // 20%

        metadata = `0x`;
  
        buySeedFee = new BN(buySeedAmount)
            .mul(new BN(fee))
            .div(new BN(PRECISION.toString()));
        seedForDistribution = new BN(hardCap)
            .mul(new BN(PRECISION.toString()))
            .div(new BN(price));
        seedForFee = seedForDistribution
            .mul(new BN(fee))
            .div(new BN(PRECISION.toString()));
        requiredSeedAmount = seedForDistribution.add(seedForFee);


        newClassVestingStartTime = await endTime.add(await time.duration.days(4));
        localVestingDuration = time.duration.days(10);   
        localVestingCliff = time.duration.days(5);
        SECOND_CLASS_VESTING_START_TIME = await newClassVestingStartTime.add(await time.duration.days(2));
        CLASS_TWO_PERSONAL_FUNDING_LIMIT = ethers.BigNumber.from("18000000000000000000").toString();
        CLASS_25_PERSONAL_FUNDING_LIMIT = ethers.BigNumber.from("250000000000000000").toString(); 

    });
    context("# few classes simultanuosly non-whitelisted version new context", () => {
        it("initializes", async () => {
            // emulate creation & initialization via seedfactory & fund with seedTokens
            permissionedSeed = false;
            await setup.seed.initialize(
                beneficiary.address,
                admin.address,
                [seedToken.address, fundingToken.address],
                [softCap, hardCap],
                price,
                startTime.toNumber(),
                endTime.toNumber(),
                localVestingDuration.toNumber(),
                localVestingCliff.toNumber(),
                permissionedSeed,
                fee
            );
            await seedToken
                .connect(root)
                .transfer(setup.seed.address, requiredSeedAmount.toString());
            await fundingToken
                .connect(root)
                .transfer(buyer1.address, getFundingAmounts("102"));
            await fundingToken
                .connect(buyer1)
                .approve(setup.seed.address, getFundingAmounts("102"));
            await fundingToken
                .connect(root)
                .transfer(buyer3.address, getFundingAmounts("102"));
            await fundingToken
                .connect(buyer3)
                .approve(setup.seed.address, getFundingAmounts("102"));

            claimAmount_class1 = new BN(time.duration.days(4)).mul(
                new BN(buySeedAmount)
                    .mul(new BN(PRECISION.toString()))
                    .div(new BN(price_class1))
                    .div(new BN(localVestingDuration)));
            feeAmount_class1 = new BN(claimAmount_class1)
                .mul(new BN(CLASS_FEE))
                .div(new BN(PRECISION.toString()));

            claimAmount_class2 = new BN(time.duration.days(1)).mul(
                new BN(buySeedAmount)
                    .mul(new BN(PRECISION.toString()))
                    .div(new BN(price))
                    .div(new BN(localVestingDuration)));
            feeAmount_class2 = new BN(claimAmount_class1)
                .mul(new BN(SECOND_CLASS_FEE))
                .div(new BN(PRECISION.toString()));
        });
        it("adds new classes", async () => {
            await setup.seed //class 1
              .connect(admin)
              .addClass(CLASS_SMALL_PERSONAL_FUNDING_LIMIT, CLASS_18_PERSONAL_FUNDING_LIMIT, price, localVestingDuration.toNumber(), newClassVestingStartTime.toNumber(), CLASS_FEE);

            await setup.seed //class 2
              .connect(admin)
              .addClass(CLASS_20_PERSONAL_FUNDING_LIMIT, CLASS_18_PERSONAL_FUNDING_LIMIT, price, localVestingDuration.toNumber(), SECOND_CLASS_VESTING_START_TIME.toNumber(), SECOND_CLASS_FEE);
        });
        it("it changes Customer class 1", async () => {
            await setup.seed
              .connect(admin)
              .changeClass(1, CLASS_25_PERSONAL_FUNDING_LIMIT, CLASS_20_PERSONAL_FUNDING_LIMIT, price_class1, localVestingDuration.toNumber(), newClassVestingStartTime.toNumber(), CLASS_FEE);
            expect(
              (await setup.seed.classes(1))[1]
            ).to.equal((ethers.BigNumber.from(CLASS_20_PERSONAL_FUNDING_LIMIT)));
            expect(
                (await setup.seed.classes(1))[2]
            ).to.equal((ethers.BigNumber.from(price_class1)));
        });
        it("it sets class", async () => {
          await setup.seed
              .connect(admin)
              .setClass(buyer1.address, 1);
          await setup.seed
              .connect(admin)
              .setClass(buyer3.address, 1); 
  
          expect(
              (await setup.seed.funders(buyer1.address))[0].toString()
          ).to.equal(ethers.BigNumber.from(1).toString());
          expect(
              (await setup.seed.funders(buyer3.address))[0].toString()
          ).to.equal(ethers.BigNumber.from(1).toString());
        });
        it("it changes class", async () => {
            await setup.seed
                .connect(admin)
                .setClass(buyer1.address, 2); 
            expect(
              (await setup.seed.funders(buyer1.address))[0].toString()
            ).to.equal(ethers.BigNumber.from(2).toString());
        });
        it("it buys tokens buyer3", async () => {
            await time.increase(time.duration.days(1));

            // seedAmount = (buyAmountt*PRECISION)/price;
            seedAmount = new BN(smallBuyAmount)
                .mul(new BN(PRECISION.toString()))
                .div(new BN(price_class1));
  
            await expect(setup.seed.connect(buyer3).buy(smallBuyAmount))
                .to.emit(setup.seed, "SeedsPurchased")
                .withArgs(buyer3.address, seedAmount);

            expect(
                (await fundingToken.balanceOf(setup.seed.address)).toString()
            ).to.equal(
                Math.floor((buySmallSeedAmount * price) / PRECISION).toString()
            );
        });
        it("cannot buy more than class 1 allows class funding", async () => {
          await expectRevert(
            setup.seed
                .connect(buyer3)
                .buy(CLASS_TWO_PERSONAL_FUNDING_LIMIT.toString()),
            "Seed: maximum class funding reached"
          );
        });
        it("cannot withdraw before minumum funding amount is met", async () => {
          await expectRevert(
            setup.seed.connect(admin).withdraw(),
              "Seed: cannot withdraw while funding tokens can still be withdrawn by contributors"
          );
        });
        it("it cannot claim when minimum funding amount not met", async () => {
          await expectRevert(
            setup.seed.
                  connect(buyer1)
                  .claim(buyer1.address, claimAmount_class2.toString()), 
              "Seed: minimum funding amount not met"
          );
        }); 
        it("it buys tokens buyer1", async () => {
            // seedAmount = (buyAmountt*PRECISION)/price;
            seedAmount = new BN(smallBuyAmount)
                .mul(new BN(PRECISION.toString()))
                .div(new BN(price));
  
            await expect(setup.seed.connect(buyer1).buy(smallBuyAmount))
                .to.emit(setup.seed, "SeedsPurchased")
                .withArgs(buyer1.address, seedAmount);
            expect(
                (await fundingToken.balanceOf(setup.seed.address)).toString()
            ).to.equal(
                Math.floor((buySmallSeedAmount * price) / PRECISION * 2).toString() // * 2 because we already bought from buyer3
            );
        });
        it("cannot buy more than class 2 allows personal funding", async () => {
            await expectRevert(
                setup.seed.connect(buyer1).buy(elevenBuyAmount),
                "Seed: maximum personal funding reached"
            )
        });
        it("it cannot claim when vesting start time for this class is not started yet buyer3", async () => {
          await time.increase(time.duration.days(7));
          await time.increase(time.duration.days(1));

          await expectRevert(
              setup.seed.
                  connect(buyer3)
                  .claim(buyer3.address, claimAmount_class1.toString()), 
              "Seed: vesting start time for this class is not started yet"
          );
        });
        it("it cannot claim when vesting start time for this class is not started yet buyer1", async () => {
            await expectRevert(
                setup.seed.
                    connect(buyer1)
                    .claim(buyer1.address, claimAmount_class2.toString()), 
                "Seed: vesting start time for this class is not started yet"
            );
        });    
        it("it cannot claim before vestingCliff buyer3", async () => {
          await time.increase(time.duration.days(3)); //so it will be endTime
  
          await expectRevert(
              setup.seed
                  .connect(buyer3)
                  .claim(buyer3.address, claimAmount_class1.toString()),
              "Seed: amount claimable is 0"
          );
        });
        it("calculates correct claim buyer3", async () => {
          // increase time
          await time.increase(time.duration.days(5)); //passing Cliff

          const claim = await setup.seed.calculateClaim(buyer3.address);
          const currentVestingStartTime = (await setup.seed.classes(1))[4];
          const currentVestingDuration = (await setup.seed.classes(1))[3];
     
          const expectedClaim = (await time.latest())
              .sub(new BN(currentVestingStartTime.toNumber()))
              .mul(new BN(smallBuyAmount))
              .mul(new BN(PRECISION.toString()))
              .div(new BN(price_class1))
              .div(new BN(currentVestingDuration.toNumber()));
  
          expect(claim.toString()).to.equal(expectedClaim.toString());
        });
        it("calculates correct claim buyer1", async () => {
            // increase time
            await time.increase(time.duration.days(2)); //passing Cliff
            // increase by 2 days because of:
            // SECOND_CLASS_VESTING_START_TIME = await newClassVestingStartTime.add(await time.duration.days(2));

            const claim = await setup.seed.calculateClaim(buyer1.address);
            const currentVestingStartTime = (await setup.seed.classes(2))[4];
            const currentVestingDuration = (await setup.seed.classes(2))[3];

            // const divisor = 100; //expectedClaim without divisor / claim = 2332989000000000 / 23329890000000 = 100
            /* .div(new BN(divisor)) 
                was changed to 
                    .mul(new BN(PRECISION.toString()))
                    .div(new BN(price)) */
            const expectedClaim = (await time.latest())
                .sub(new BN(currentVestingStartTime.toNumber()))
                .mul(new BN(smallBuyAmount))
                .mul(new BN(PRECISION.toString()))
                .div(new BN(price))
                .div(new BN(currentVestingDuration.toNumber()));
        
            expect(claim.toString()).to.equal(expectedClaim.toString());
        });
        it("it returns amount of the fee buyer3", async () => {
          await time.increase(time.duration.days(3));
          let feeSent = await setup.seed
              .connect(buyer3)
              .callStatic.claim(buyer3.address, claimAmount_class1.toString());
          expect(feeSent.toString()).to.equal(feeAmount_class1.toString());
        });
        it("it returns amount of the fee buyer1", async () => {
            await time.increase(time.duration.days(3));
            const currentClaimable = ethers.BigNumber.from("46657890000000"); // value from expectedClaim from second 'it' above
    
            feeAmount = new BN(46657890000000)
                .mul(new BN(CLASS_FEE))
                .div(new BN(PRECISION.toString()));
    
            let feeSent = await setup.seed
                .connect(buyer3)
                .callStatic.claim(buyer3.address, currentClaimable.toString());
            expect(feeSent.toString()).to.equal(feeAmount.toString());
        });
        it("claims all seeds after vesting duration buyer3", async () => {
          await time.increase(time.duration.days(4));
  
          setup.prevBalance = await seedToken.balanceOf(
              beneficiary.address
          );
  
          smallBuyAmount = getFundingAmounts("9").toString();
          // amountClaimable 1020000000 --> 10200000000000000/1020000000 = 1000000000
          const divisor = 1000000000;
          const claimTemp = new BN(smallBuyAmount).mul(new BN(twoBN)).div(new BN(divisor)).div(new BN(2)).toString();
  
          feeAmountOnClaim = new BN(claimTemp)
              .mul(new BN(CLASS_FEE))
              .div(new BN(PRECISION.toString()));
  
          await expect(
              setup.seed
                  .connect(buyer3)
                  .claim(buyer3.address, claimTemp.toString())
          )
              .to.emit(setup.seed, "TokensClaimed")
              .withArgs(
                  buyer3.address,
                  claimTemp.toString(),
                  beneficiary.address,
                  feeAmountOnClaim.toString()
              );
        });
        it("claims all seeds after vesting duration buyer1", async () => {
          setup.prevBalance = await seedToken.balanceOf(
              beneficiary.address
          );
  
          smallBuyAmount = getFundingAmounts("18").toString();
          // amountClaimable 1020000000 --> 10200000000000000/1020000000 = 1000000000
          const divisor = 1000000000;
          const claimTemp = new BN(smallBuyAmount).mul(new BN(twoBN)).div(new BN(divisor)).div(new BN(2)).toString();
          feeAmountOnClaim = new BN(claimTemp)
              .mul(new BN(SECOND_CLASS_FEE))
              .div(new BN(PRECISION.toString()));
  
          await expect(
              setup.seed
                  .connect(buyer1)
                  .claim(buyer1.address, claimTemp.toString())
          )
              .to.emit(setup.seed, "TokensClaimed")
              .withArgs(
                  buyer1.address,
                  claimTemp.toString(),
                  beneficiary.address,
                  feeAmountOnClaim.toString()
              );
        });
        it("can only withdraw after vesting starts", async () => {
          await setup.seed.connect(admin).withdraw();
          expect(
              (await fundingToken.balanceOf(setup.seed.address)).toString()
          ).to.equal(zero.toString());
  
          const expectedBalance = ethers.BigNumber.from(smallBuyAmount);
          expect(
              (await fundingToken.balanceOf(admin.address)).toString() 
          ).to.equal(expectedBalance);
        });
        it("updates the amount of funding token withdrawn", async () => {  
          const maxWithdrawAmount = ethers.BigNumber.from(getFundingAmounts("9").mul(2));
          await expect(
              (await setup.seed.fundingWithdrawn()).toString()
          ).to.equal(maxWithdrawAmount);
        });
      });
  });
});