import dotenv from "dotenv";
import fs from "fs";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:deployGateway")
  .addParam("privatekey", "The deployer private key")
  .addParam("owneraddress", "The owner address")
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    console.log(taskArguments);
    const deployer = new ethers.Wallet(taskArguments.privatekey).connect(ethers.provider);
    const gatewayFactory = await ethers.getContractFactory("GatewayContract");
    const Gateway = await gatewayFactory
      .connect(deployer)
      .deploy(taskArguments.owneraddress, "0xF4EAb004dD14CbF30115629C43C5Be92B0b90831");
    await Gateway.waitForDeployment();
    const GatewayContractAddress = await Gateway.getAddress();
    console.log("GatewayContract was deployed at address: ", GatewayContractAddress);
  });

task("task:deployACL").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const deployer = (await ethers.getSigners())[0];
  const factory = await ethers.getContractFactory("ACL");
  const acl = await factory.connect(deployer).deploy("0x95d8A2A36F9a2dAA92f30Ff16cE062434c32Ae20");
  await acl.waitForDeployment();
  const address = await acl.getAddress();
  //const envConfigAcl = dotenv.parse(fs.readFileSync("node_modules/fhevm/lib/.env.acl"));
  console.log("ACL was deployed at address:", address);
});

task("task:deployTFHEExecutor").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const deployer = (await ethers.getSigners())[0];
  const factory = await ethers.getContractFactory("TFHEExecutor");
  const exec = await factory.connect(deployer).deploy();
  await exec.waitForDeployment();
  const address = await exec.getAddress();
  //const envConfig = dotenv.parse(fs.readFileSync("node_modules/fhevm/lib/.env.exec"));

  console.log("TFHEExecutor was deployed at address:", address);
});

task("task:deployKMSVerifier").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const deployer = (await ethers.getSigners())[0];
  const factory = await ethers.getContractFactory("KMSVerifier");
  const exec = await factory.connect(deployer).deploy();
  await exec.waitForDeployment();
  const address = await exec.getAddress();
  //const envConfig = dotenv.parse(fs.readFileSync("node_modules/fhevm/lib/.env.kmsverifier"));
  console.log("KMSVerifier was deployed at address:", address);
});
