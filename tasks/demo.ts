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

task("mint", "Mints tokens to an address").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const config = readConfig();

  if (!config.ERC20_ADDRESS || !process.env.USER_ADDRESS) {
    console.error("ERC20_ADDRESS or USER_ADDRESS not found in config or environment.");
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
});

// Other tasks can follow the same pattern, reading the config for addresses.
