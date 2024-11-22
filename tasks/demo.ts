import { createInstance } from "fhevmjs";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

import { EncryptedERC20__factory, EncryptedAuction__factory, EncryptedPool__factory, TestToken__factory } from "../types";

dotenv.config();

const CONFIG_FILE = path.resolve(__dirname, "../deployment-config.json");

function readConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  }
  return {};
}

function writeConfig(key: string, value: string) {
  const config = readConfig();
  config[key] = value;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

task("task:deployERC20").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const signers = await ethers.getSigners();
  const erc20Factory = await ethers.getContractFactory("EncryptedERC20");
  const encryptedERC20 = await erc20Factory.connect(signers[0]).deploy("Encrypted", "ENCR");
  await encryptedERC20.waitForDeployment();

  const tokenAddress = await encryptedERC20.getAddress();
  console.log("EncryptedERC20 deployed to: ", tokenAddress);

  writeConfig("ERC20_ADDRESS", tokenAddress);
});

task("task:deployAuction").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const config = readConfig();

  if (!config.ERC20_ADDRESS) {
    console.error("ERC20 contract address not found. Please deploy ERC20 first. ");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const auctionFactory = await ethers.getContractFactory("EncryptedAuction");
  const encryptedAuction = await auctionFactory.connect(signers[0]).deploy(
    signers[0].address,
    config.ERC20_ADDRESS,
    30,
    true
  );
  await encryptedAuction.waitForDeployment();

  const auctionAddress = await encryptedAuction.getAddress();
  console.log("EncryptedAuction deployed to: ", auctionAddress);

  writeConfig("AUCTION_ADDRESS", auctionAddress);
});


task("task:deployPool").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const signers = await ethers.getSigners();

  const ERC20Factory = await ethers.getContractFactory("TestToken");
  const ERC20a = await ERC20Factory.connect(signers[0]).deploy(signers[0].address);
  await ERC20a.waitForDeployment();
  console.log("ERC20a deployed to: ", await ERC20a.getAddress());
  const ERC20b = await ERC20Factory.connect(signers[0]).deploy(signers[0].address);
  await ERC20b.waitForDeployment();
  console.log("ERC20b deployed to: ", await ERC20b.getAddress());

  const poolFactory = await ethers.getContractFactory("EncryptedPool");
  const encryptedPool = await poolFactory.connect(signers[0]).deploy([await ERC20a.getAddress(), await ERC20b.getAddress()]);
  await encryptedPool.waitForDeployment();

  const poolAddress = await encryptedPool.getAddress();
  console.log("EncryptedPool deployed to: ", poolAddress);

  writeConfig("TOKEN_ADDRESS_A", await ERC20a.getAddress());
  writeConfig("TOKEN_ADDRESS_B", await ERC20b.getAddress());
  writeConfig("POOL_ADDRESS", poolAddress);
});

task("pool:deposit", "Deposits tokens into the pool").setAction(async function (taskArguments: TaskArguments, { ethers }) {

  const config = readConfig();

  if (!config.POOL_ADDRESS) {
    console.error("POOL_ADDRESS or ERC20_ADDRESS not found in config.");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const encryptedPool = EncryptedPool__factory.connect(config.POOL_ADDRESS, signers[0]);

  const ERC20Factory = await ethers.getContractFactory("TestToken");
  const ERC20a = TestToken__factory.connect(config.TOKEN_ADDRESS_A, signers[0]);
  const ERC20b = TestToken__factory.connect(config.TOKEN_ADDRESS_B, signers[0]);
  await ERC20a.connect(signers[0]).mint(signers[0].address, BigInt(10000));
  await ERC20b.connect(signers[0]).mint(signers[0].address, BigInt(10000));

  const amount = BigInt(1000);
  try {
    const tx = await ERC20a.approve(config.POOL_ADDRESS, amount);
    await tx.wait();
    console.log("Approved tokens for deposit successfully.");
  } catch (error) {
    console.error("Approve transaction failed:", error);
  }

  try {
    const tx = await ERC20b.approve(config.POOL_ADDRESS, amount);
    await tx.wait();
    console.log("Approved tokens for deposit successfully.");
  } catch (error) {
    console.error("Approve transaction failed:", error);
  }

  try {
    const tx = await encryptedPool.deposit(0, amount);
    console.log("Deposited tokens successfully.");
  } catch (error) {
    console.error("Deposit transaction failed:", error);
  }

  try {
    const tx = await encryptedPool.deposit(1, amount);
    console.log("Deposited tokens successfully.");
  } catch (error) {
    console.error("Deposit transaction failed:", error);
  }
});

task("pool:createOrderBuy", "Creates an order in the pool").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const config = readConfig();

  if (!config.POOL_ADDRESS) {
    console.error("POOL_ADDRESS not found in config.");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const encryptedPool = await EncryptedPool__factory.connect(config.POOL_ADDRESS, signers[0]);

  const amount = BigInt(1000);
  const price = BigInt(1);

  const instance = await createInstance({
    networkUrl: process.env.NETWORK_URL || "",
    gatewayUrl: process.env.GATEWAY_URL || "",
  });

  const input = await instance.createEncryptedInput(config.POOL_ADDRESS, signers[0].address);

  await input.add32(amount).add32(price);

  const inputs = await input.encrypt();



  console.log(`Creating order [BUY]... \nencrypted amount: ${inputs.handles[0]} \nenrypted price: ${inputs.handles[1]} \noriginal amount: ${amount} \noriginal price: ${price}`);

  const tx = await encryptedPool.createOrder(
    BigInt(0),
    inputs.handles[0],
    inputs.handles[1],
    inputs.inputProof
  );

  await tx.wait();
  console.log("Created order successfully.");
});

task("pool:createOrderSell", "Creates an order in the pool").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const config = readConfig();

  if (!config.POOL_ADDRESS) {
    console.error("POOL_ADDRESS not found in config.");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const encryptedPool = await EncryptedPool__factory.connect(config.POOL_ADDRESS, signers[1]);

  const amount = BigInt(1000);
  const price = BigInt(1);

  const instance = await createInstance({
    networkUrl: process.env.NETWORK_URL || "",
    gatewayUrl: process.env.GATEWAY_URL || "",
  });

  const input = await instance.createEncryptedInput(config.POOL_ADDRESS, signers[1].address);

  await input.add32(amount).add32(price);

  const inputs = await input.encrypt();

  console.log(`Creating order [BUY]... \nencrypted amount: ${inputs.handles[0]} \nenrypted price: ${inputs.handles[1]} \noriginal amount: ${amount} \noriginal price: ${price}`);

  const tx = await encryptedPool.createOrder(
    BigInt(1),
    inputs.handles[0],
    inputs.handles[1],
    inputs.inputProof
  );

  await tx.wait();
  console.log("Created order successfully.");
});

task("pool:fillOrder", "Fills an order in the pool").setAction(async function (taskArguments: TaskArguments, { ethers }) {

  const config = readConfig();

  if (!config.POOL_ADDRESS) {
    console.error("POOL_ADDRESS not found in config.");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const encryptedPool = EncryptedPool__factory.connect(config.POOL_ADDRESS, signers[0]);

  const amount = BigInt(1000);

  const instance = await createInstance({
    networkUrl: process.env.NETWORK_URL || "",
    gatewayUrl: process.env.GATEWAY_URL || "",
  });

  const input = instance.createEncryptedInput(config.POOL_ADDRESS, signers[0].address);
  await input.add64(amount);

  const inputs = input.encrypt();

  const tx = await encryptedPool.fillOrder(signers[0].address, signers[0].address);
  await tx.wait();
  console.log("Filled order successfully.");
});


task("pool:withdraw", "Withdraws tokens from the pool").setAction(async function (taskArguments: TaskArguments, { ethers }) {

  const config = readConfig();

  if (!config.POOL_ADDRESS) {
    console.error("POOL_ADDRESS not found in config.");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const encryptedPool = EncryptedPool__factory.connect(config.POOL_ADDRESS, signers[0]);

  const amount = BigInt(500);

  await encryptedPool.retractOrder(0);

  try {
    const tx = await encryptedPool.withdraw(1, amount);
    await tx.wait();
    console.log("Withdrawn tokens successfully.");
  } catch (error) {
    console.error("Withdraw transaction failed:", error);
  }
});

task("mint", "Mints tokens").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const config = readConfig();

  if (!config.ERC20_ADDRESS) {
    console.error("ERC20_ADDRESS not found in config.");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  console.log("Minting tokens... " + config.ERC20_ADDRESS);
  const encryptedERC20 = EncryptedERC20__factory.connect(config.ERC20_ADDRESS, signers[0]);
  const amount = BigInt(2000);

  try {
    const tx = await encryptedERC20.mint(amount, signers[0].address, { gasLimit: 1000000 });
    await tx.wait();
    console.log(`Minted ${amount} tokens successfully.`);
  } catch (error) {
    console.error("Minting transaction failed:", error);
  }

  const instance = await createInstance({
    networkUrl: process.env.NETWORK_URL || "",
    gatewayUrl: process.env.GATEWAY_URL || "",
  });

  const handle = await encryptedERC20.balanceOf(signers[0].address);
  console.log("Encrypted token balance: ", handle.toString());
  console.log("Proccess reencypting...");

  const { publicKey, privateKey } = instance.generateKeypair();
  const eip712 = instance.createEIP712(publicKey, config.ERC20_ADDRESS);

  const params = [await signers[0].getAddress(), JSON.stringify(eip712)];
  const signature = await signers[0].provider.send("eth_signTypedData_v4", params);

  const balance = await instance.reencrypt(
    handle,
    privateKey,
    publicKey,
    signature,
    config.ERC20_ADDRESS,
    signers[0].address
  );

  console.log("Re-encrypted balance: ", balance.toString());
});

task("transfer", "Transfers tokens to a user").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const config = readConfig();

  if (!config.ERC20_ADDRESS) {
    console.error("ERC20_ADDRESS not found in config.");
    process.exit(1);
  }


  const signers = await ethers.getSigners();
  const encryptedERC20 = EncryptedERC20__factory.connect(config.ERC20_ADDRESS, signers[0]);

  const instance = await createInstance({
    networkUrl: process.env.NETWORK_URL || "",
    gatewayUrl: process.env.GATEWAY_URL || ""
  });

  const input = instance.createEncryptedInput(config.ERC20_ADDRESS, signers[1].address);
  await input.add64(BigInt(500));

  const inputs = input.encrypt();

  try {
    const tx = await encryptedERC20["transfer(address,bytes32,bytes)"](
      signers[1].address,
      inputs.handles[0],
      inputs.inputProof
    );
    await tx.wait();
    console.log("Transferred 500 tokens successfully.");
  } catch (error) {
    console.error("Transfer failed: ", error);
  }


  const handle = await encryptedERC20.balanceOf(signers[1].address);
  console.log("Recipient balance handle: ", handle.toString());

  const { publicKey, privateKey } = instance.generateKeypair();
  const eip712 = instance.createEIP712(publicKey, config.ERC20_ADDRESS);

  const params = [await signers[0].getAddress(), JSON.stringify(eip712)];
  const signature = await signers[0].provider.send("eth_signTypedData_v4", params);

  const balance = await instance.reencrypt(
    handle,
    privateKey,
    publicKey,
    signature,
    config.ERC20_ADDRESS,
    process.env.USER_ADDRESS
  );

  console.log("Recipient re-encrypted balance: ", balance.toString());

  const handleSender = await encryptedERC20.balanceOf(signers[0].address);

  console.log("Sender balance handle: ", handleSender.toString());

  const balanceSender = await instance.reencrypt(
    handleSender,
    privateKey,
    publicKey,
    signature,
    config.ERC20_ADDRESS,
    signers[0].address
  );

  console.log("Sender re-encrypted balance: ", balanceSender.toString());
});

task("bid", "Bids on an auction").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const config = readConfig();

  if (!config.AUCTION_ADDRESS) {
    console.error("AUCTION_ADDRESS or USER_ADDRESS not found in config or environment.");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const encryptedAuction = EncryptedAuction__factory.connect(config.AUCTION_ADDRESS, signers[0]);
  const encryptedERC20 = EncryptedERC20__factory.connect(config.ERC20_ADDRESS, signers[0]);

  const instance = await createInstance({
    networkUrl: process.env.NETWORK_URL || "",
    gatewayUrl: process.env.GATEWAY_URL || ""
  });

  const input = instance.createEncryptedInput(config.AUCTION_ADDRESS, signers[1].address);
  await input.add64(BigInt(500));

  const inputs = input.encrypt();

  try {
    const txa = await encryptedERC20["approve(address,bytes32,bytes)"](await encryptedAuction.getAddress(), inputs.handles[0], inputs.inputProof);
    const tx = await encryptedAuction.bid(inputs.handles[0], inputs.inputProof);
    await tx.wait();
    console.log("Bid 500 tokens successfully.");
  } catch (error) {
    console.error("Bid transaction failed:", error);
  }
});


task("decryptTicket", "Decrypts a handle").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const config = readConfig();
  const encryptedAuctionAddress = config.AUCTION_ADDRESS;

  const signers = await ethers.getSigners();

  const encryptedAuction = EncryptedAuction__factory.connect(encryptedAuctionAddress, signers[0]);

  await encryptedAuction.decryptWinningTicket();

  const winningTicket = await encryptedAuction.getDecryptedWinningTicket();

  console.log(`Winning ticket: ${winningTicket.toString()}`);
});


task("claim", "Claims the winning ticket").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const config = readConfig();
  const encryptedAuctionAddress = config.AUCTION_ADDRESS;
  const ercAddress = config.ERC20_ADDRESS;

  const signers = await ethers.getSigners();

  const encryptedAuction = EncryptedAuction__factory.connect(encryptedAuctionAddress, signers[0]);
  const instance = await createInstance({
    networkUrl: process.env.NETWORK_URL || "",
    gatewayUrl: process.env.GATEWAY_URL || ""
  });
  const encryptedERC20 = EncryptedERC20__factory.connect(ercAddress, signers[0]);

  const handle = await encryptedERC20.balanceOf(signers[0].address);
  console.log(handle.toString());

  const { publicKey, privateKey } = instance.generateKeypair();
  const eip712 = instance.createEIP712(
    publicKey,
    ercAddress,
  );

  const params = [await signers[0].getAddress(), JSON.stringify(eip712)];
  const signature = await signers[0].provider.send("eth_signTypedData_v4", params);

  const balanceBefore = await instance.reencrypt(
    handle,
    privateKey,
    publicKey,
    signature,
    ercAddress,
    signers[0].address
  );

  console.log("Encrypted balance before claim: ", handle.toString());
  console.log("Re-encrypted balance before claim: ", balanceBefore.toString());

  try {
    const tx = await encryptedAuction.auctionEnd();
    await tx.wait();
    console.log("Claimed successfully.");
  } catch (error) {
    console.error("Claiming failed:", error);
  }


  const balanceAfter = await instance.reencrypt(
    handle,
    privateKey,
    publicKey,
    signature,
    ercAddress,
    signers[0].address
  );

  console.log("Encrypted balance after claim: ", handle.toString());
  console.log("Re-encrypted balance after claim: ", balanceAfter.toString());
});



