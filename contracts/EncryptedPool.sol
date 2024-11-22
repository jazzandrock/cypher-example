// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "./fhevm/lib/TFHE.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title DarkPool
 * @notice A confidential trading platform for encrypted order matching using TFHE.
 */
contract EncryptedPool {
    /// @notice Types of orders - Buy or Sell
    enum OrderType {
        Buy,
        Sell
    }

    /// @notice Represents an order to buy or sell base tokens
    struct Order {
        euint32 amount; // Encrypted amount of base tokens
        euint32 price; // Encrypted price of base tokens
    }

    /// @notice Array of tokens available in the pool [base, quote]
    ERC20[] public tokens;

    /// @notice Index constants for base and quote tokens
    uint8 public constant BASE_INDEX = 0;
    uint8 public constant QUOTE_INDEX = 1;

    /// @notice User balances for each token
    mapping(address => mapping(uint8 => euint32)) public balances;

    /// @notice User orders for Buy or Sell
    mapping(address => mapping(OrderType => Order)) public orders;

    /// @notice Emitted when a new order is created
    event OrderCreated(address indexed user, uint8 orderType, euint32 amount, euint32 price);

    /// @notice Emitted when an order is updated
    event OrderUpdated(address indexed user, uint8 orderType, euint32 amount, euint32 price);

    /// @notice Emitted when an order is deleted
    event OrderDeleted(address indexed user, uint8 orderType);

    /**
     * @notice Constructor to initialize tokens
     * @param _tokens Array of ERC20 tokens [base, quote]
     */
    constructor(ERC20[] memory _tokens) {
        tokens = _tokens;
    }

    /**
     * @notice Deposit tokens into the pool
     * @param tokenId ID of the token (0 for base, 1 for quote)
     * @param amount Plaintext amount of tokens to deposit
     */
    function deposit(uint8 tokenId, uint32 amount) public {
        tokens[tokenId].transferFrom(msg.sender, address(this), amount);
        balances[msg.sender][tokenId] = TFHE.add(balances[msg.sender][tokenId], amount);
        TFHE.allow(balances[msg.sender][tokenId], address(this));
        TFHE.allow(balances[msg.sender][tokenId], msg.sender);
    }

    /**
     * @notice Internal function to create an order
     * @param orderType Type of the order (Buy or Sell)
     * @param amount Encrypted amount of base tokens
     * @param price Encrypted price of base tokens
     */
    function _createOrder(OrderType orderType, euint32 amount, euint32 price) internal {
        // Check if an order already exists
        ebool orderExists = TFHE.ne(orders[msg.sender][orderType].amount, TFHE.asEuint32(0));
        ebool sufficientFunds;

        if (orderType == OrderType.Buy) {
            // Ensure user has enough quote tokens for the total cost
            euint32 totalCost = TFHE.mul(amount, price);
            sufficientFunds = TFHE.le(totalCost, balances[msg.sender][QUOTE_INDEX]);
        } else {
            // Ensure user has enough base tokens for the amount
            sufficientFunds = TFHE.le(amount, balances[msg.sender][BASE_INDEX]);
        }

        // Combine all conditions into a single check
        ebool canCreateOrder = TFHE.and(TFHE.not(orderExists), sufficientFunds);

        // Apply encrypted logic to decide whether to proceed
        euint32 validatedAmount = TFHE.select(canCreateOrder, amount, TFHE.asEuint32(0));
        euint32 validatedPrice = TFHE.select(canCreateOrder, price, TFHE.asEuint32(0));

        // Update order only if all conditions are met
        orders[msg.sender][orderType] = Order(validatedAmount, validatedPrice);
        TFHE.allow(validatedAmount, address(this));
        TFHE.allow(validatedPrice, address(this));

        emit OrderCreated(msg.sender, uint8(orderType), validatedAmount, validatedPrice);
    }

    /**
     * @notice Create a new order
     * @param orderType Type of the order (Buy or Sell)
     * @param encryptedAmount Encrypted amount of base tokens
     * @param priceCipherText Encrypted price of base tokens
     * @param inputProof Proof for the encrypted amount
     */
    function createOrder(
        OrderType orderType,
        einput encryptedAmount,
        einput priceCipherText,
        bytes calldata inputProof
    ) public {
        euint32 amount = TFHE.asEuint32(encryptedAmount, inputProof);
        euint32 price = TFHE.asEuint32(priceCipherText, inputProof);
        _createOrder(orderType, amount, price);
    }

    /**
     * @notice Fill a matching order between buyer and seller
     * @param buyer Address of the buyer
     * @param seller Address of the seller
     */
    function fillOrder(address buyer, address seller) public {
        Order memory buyOrder = orders[buyer][OrderType.Buy];
        Order memory sellOrder = orders[seller][OrderType.Sell];

        euint32 baseAmount = TFHE.select(TFHE.le(sellOrder.amount, buyOrder.amount), sellOrder.amount, buyOrder.amount);
        euint32 quoteAmount = TFHE.mul(baseAmount, sellOrder.price);

        // Adjust balances and orders
        _transfer(buyer, seller, baseAmount, quoteAmount);
    }

    /**
     * @notice Adjust balances and orders during trade
     * @param buyer Address of the buyer
     * @param seller Address of the seller
     * @param baseAmount Encrypted amount of base tokens traded
     * @param quoteAmount Encrypted amount of quote tokens traded
     */
    function _transfer(address buyer, address seller, euint32 baseAmount, euint32 quoteAmount) internal {
        // Update orders
        orders[buyer][OrderType.Buy].amount = TFHE.sub(orders[buyer][OrderType.Buy].amount, baseAmount);
        orders[seller][OrderType.Sell].amount = TFHE.sub(orders[seller][OrderType.Sell].amount, baseAmount);

        // Update balances
        balances[buyer][BASE_INDEX] = TFHE.add(balances[buyer][BASE_INDEX], baseAmount);
        balances[seller][BASE_INDEX] = TFHE.sub(balances[seller][BASE_INDEX], baseAmount);
        balances[buyer][QUOTE_INDEX] = TFHE.sub(balances[buyer][QUOTE_INDEX], quoteAmount);
        balances[seller][QUOTE_INDEX] = TFHE.add(balances[seller][QUOTE_INDEX], quoteAmount);

        // Allow new balances
        TFHE.allow(balances[buyer][BASE_INDEX], address(this));
        TFHE.allow(balances[seller][BASE_INDEX], address(this));
        TFHE.allow(balances[buyer][QUOTE_INDEX], address(this));
        TFHE.allow(balances[seller][QUOTE_INDEX], address(this));

        emit OrderUpdated(
            buyer,
            uint8(OrderType.Buy),
            orders[buyer][OrderType.Buy].amount,
            orders[buyer][OrderType.Buy].price
        );
        emit OrderUpdated(
            seller,
            uint8(OrderType.Sell),
            orders[seller][OrderType.Sell].amount,
            orders[seller][OrderType.Sell].price
        );
    }

    function retractOrder(OrderType orderType) public {
        delete orders[msg.sender][orderType];
        emit OrderDeleted(msg.sender, uint8(orderType));
    }

    function withdraw(uint8 tokenId, uint32 amount) public {
        if (tokenId == BASE_INDEX) {
            // ensure the user doesn't have an open sell order
            require(
                !TFHE.isInitialized(orders[msg.sender][OrderType.Sell].amount),
                "Close sell order before withdrawing base"
            );
        } else {
            // ensure the user doesn't have an open buy order
            require(
                !TFHE.isInitialized(orders[msg.sender][OrderType.Buy].amount),
                "Close buy order before withdrawing quote"
            );
        }

        // ensure user has enough balance
        ebool canWithdraw = (TFHE.ge(balances[msg.sender][tokenId], amount));

        euint32 validatedAmount = TFHE.select(canWithdraw, TFHE.asEuint32(amount), TFHE.asEuint32(0));

        // transfer tokens
        tokens[tokenId].transfer(msg.sender, amount);

        // update balance
        balances[msg.sender][tokenId] = TFHE.sub(balances[msg.sender][tokenId], validatedAmount);
    }
}
