// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./fhevm/lib/TFHE.sol";
import "./DaoToken.sol";
import "./fhevm/lib/GatewayCaller.sol";

contract EncryptedVoteDAO is GatewayCaller {
    enum VoteResultEnum {
        YES,
        NO,
        EQUAL,
        NOT_VOTED_YET
    }

    DaoToken public daoToken;
    uint256 public proposalCount;
    uint256 public constant DEFAULT_PROPOSAL_DURATION = 100;

    struct Proposal {
        string description;
        euint64 yesVotes;
        euint64 noVotes;
        eaddress proposer;
        uint256 deadline;
        VoteResultEnum result;
        mapping(address => bool) hasVoted;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => uint256) public requestIDToProposalID;

    event ProposalCreated(uint256 indexed id, address proposer, uint256 endTime);
    event VoteSubmitted(uint256 indexed id, address voter, euint64 encryptedVote);
    event DecryptionRequested(uint256 indexed proposalId);
    event OutcomeDecided(uint256 indexed proposalId, bool passed);
    event ResultsAllowed(uint256 indexed proposalId, address allowedAddress);

    constructor(address _daoToken) {
        daoToken = DaoToken(_daoToken);
    }

    function createProposal(string memory _description) public {
        proposalCount++;

        Proposal storage newProposal = proposals[proposalCount];
        newProposal.description = _description;
        newProposal.yesVotes = TFHE.asEuint64(0); // Initialize votes
        newProposal.noVotes = TFHE.asEuint64(0);
        newProposal.proposer = TFHE.asEaddress(msg.sender);
        newProposal.deadline = block.timestamp + DEFAULT_PROPOSAL_DURATION;
        newProposal.result = VoteResultEnum.NOT_VOTED_YET;
    }

    // Submit a vote (encrypted: 1 = YES, 0 = NO)
    function vote(uint256 proposalId, einput encryptedVote, bytes calldata inputProof) public {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp < proposal.deadline, "Voting period ended");

        // TODO: add a check that a person hasn't voted yet

        euint64 vote = TFHE.asEuint64(encryptedVote, inputProof);
        ebool isYesVote = TFHE.eq(vote, TFHE.asEuint64(1)); // Check if YES vote

        // Homomorphic vote addition
        proposal.yesVotes = TFHE.add(proposal.yesVotes, TFHE.select(isYesVote, TFHE.asEuint64(1), TFHE.asEuint64(0)));
        proposal.noVotes = TFHE.add(proposal.noVotes, TFHE.select(isYesVote, TFHE.asEuint64(0), TFHE.asEuint64(1)));

        emit VoteSubmitted(proposalId, msg.sender, vote);
    }

    // Gets the proposal results after deadline
    function getResults(uint256 proposalId) public returns (uint) {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp > proposal.deadline, "You can not view resulsts before proposal end time");
        require(proposal.result != VoteResultEnum.NOT_VOTED_YET, "Can't compute result more than once");

        // Vote result
        euint64 voteResult = TFHE.asEuint64(uint256(VoteResultEnum.EQUAL));


        // TFHE.select(isTransferable, TFHE.sub(currentAllowance, amount), currentAllowance)
        voteResult = TFHE.select(
            TFHE.gt(proposal.noVotes, proposal.yesVotes), 
            TFHE.asEuint64(uint256(VoteResultEnum.YES)), 
            voteResult
        );
        voteResult = TFHE.select(
            TFHE.lt(proposal.noVotes, proposal.yesVotes), 
            TFHE.asEuint64(uint256(VoteResultEnum.NO)), 
            voteResult
        );

        uint256[] memory cts = new uint256[](1);
        cts[0] = Gateway.toUint256(voteResult);
        uint256 requestID = Gateway.requestDecryption(cts, this.setDecrypterResult.selector, 0, block.timestamp + 100, false);
        requestIDToProposalID[requestID] = proposalId;

        return 0;
    }

    function setDecrypterResult(uint256 requestID, uint64 voteResult) public onlyGateway() {
        proposals[requestIDToProposalID[requestID]].result = VoteResultEnum(voteResult);
    }

    // // Allow results access to a specific address
    // function allowResults(uint256 proposalId, address allowedAddress) public {
    //     Proposal storage proposal = proposals[proposalId];
    //     require(block.timestamp >= proposal.deadline, "Voting period not over");
    //     require(msg.sender == proposal.proposer, "Only proposer can allow results");

    //     // Allow access to encrypted results for the specified address
    //     TFHE.allow(proposal.yesVotes, allowedAddress);
    //     TFHE.allow(proposal.noVotes, allowedAddress);

    //     emit ResultsAllowed(proposalId, allowedAddress);
    // }
}
