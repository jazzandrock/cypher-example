// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DaoToken is ERC20 {
    constructor(uint256 initialSupply, string memory name, string memory ticker) ERC20(name, ticker) {
        _mint(msg.sender, initialSupply * (10 ** decimals()));
    }
}
