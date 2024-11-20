import { createInstance } from "fhevmjs";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

import { EncryptedERC20__factory, EncryptedAuction__factory } from "../types";

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
    console.error("ERC20 contract address not found. Please deploy ERC20 first.");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const auctionFactory = await ethers.getContractFactory("EncryptedAuction");
  const encryptedAuction = await auctionFactory.connect(signers[0]).deploy(
    signers[0].address,
    config.ERC20_ADDRESS,
    360,
    true
  );
  await encryptedAuction.waitForDeployment();

  const auctionAddress = await encryptedAuction.getAddress();
  console.log("EncryptedAuction deployed to: ", auctionAddress);

  writeConfig("AUCTION_ADDRESS", auctionAddress);
});

task("mint", "Mints tokens").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const config = readConfig();

  if (!config.ERC20_ADDRESS) {
    console.error("ERC20_ADDRESS not found in config.");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const encryptedERC20 = EncryptedERC20__factory.connect(config.ERC20_ADDRESS, signers[0]);
  const amount = BigInt(1000);

  try {
    const tx = await encryptedERC20.mint(amount, signers[0].address);
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
  console.log("Minted tokens balance handle: ", handle.toString());

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

  console.log("Admin re-encrypted balance: ", balance.toString());
});

task("transfer", "Transfers tokens to a user").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const config = readConfig();

  if (!config.ERC20_ADDRESS || !process.env.USER_ADDRESS) {
    console.error("ERC20_ADDRESS or USER_ADDRESS not found in config or environment.");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const encryptedERC20 = EncryptedERC20__factory.connect(config.ERC20_ADDRESS, signers[0]);

  const instance = await createInstance({
    networkUrl: process.env.NETWORK_URL || "",
    gatewayUrl: process.env.GATEWAY_URL || ""
  });

  const input = instance.createEncryptedInput(config.ERC20_ADDRESS, process.env.USER_ADDRESS!);
  await input.add64(BigInt(500));

  const inputs = input.encrypt();

  try {
    const tx = await encryptedERC20["transfer(address,bytes32,bytes)"](
      process.env.USER_ADDRESS,
      inputs.handles[0],
      inputs.inputProof
    );
    await tx.wait();
    console.log("Transferred 500 tokens successfully.");
  } catch (error) {
    console.error("Transfer failed: ", error);
  }


  const handle = await encryptedERC20.balanceOf(process.env.USER_ADDRESS);
  console.log("Minted tokens balance handle: ", handle.toString());

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

  console.log("Admin re-encrypted balance: ", balance.toString());
});

task("bid", "Bids on an auction").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const config = readConfig();

  if (!config.AUCTION_ADDRESS || !process.env.USER_ADDRESS) {
    console.error("AUCTION_ADDRESS or USER_ADDRESS not found in config or environment.");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const encryptedAuction = EncryptedAuction__factory.connect(config.AUCTION_ADDRESS, signers[0]);

  const instance = await createInstance({
    networkUrl: process.env.NETWORK_URL || "",
    gatewayUrl: process.env.GATEWAY_URL || ""
  });

  const input = instance.createEncryptedInput(config.AUCTION_ADDRESS, process.env.USER_ADDRESS!);
  await input.add64(BigInt(500));

  const inputs = input.encrypt();

  try {
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
  const userAddress = process.env.USER_ADDRESS || "";

  const signers = await ethers.getSigners();

  const encryptedAuction = EncryptedAuction__factory.connect(encryptedAuctionAddress, signers[0]);
  const instance = await createInstance({
    networkUrl: "https://staging-node-rpc.cypherscan.ai/",
    gatewayUrl: "https://gateway-staging.cypherscan.ai/"
  });
  const encryptedERC20 = EncryptedERC20__factory.connect(ercAddress, signers[0]);

  try {
    const tx = await encryptedAuction.claim();
    await tx.wait();
    console.log("Claimed successfully.");
  } catch (error) {
    console.error("Claiming failed:", error);
  }

  const handle = await encryptedERC20.balanceOf(userAddress);
  console.log(handle.toString());

  const { publicKey, privateKey } = instance.generateKeypair();
  const eip712 = instance.createEIP712(
    publicKey,
    ercAddress,
  );

  const params = [await signers[0].getAddress(), JSON.stringify(eip712)];
  const signature = await signers[0].provider.send("eth_signTypedData_v4", params);
  const balance = await instance.reencrypt(
    handle,
    privateKey,
    publicKey,
    signature,
    ercAddress,
    userAddress
  );

  console.log("Admin re-encrypted balance: ", balance.toString());
});



