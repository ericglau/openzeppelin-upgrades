pragma solidity ^0.5.1;

contract GreeterV2 {

    string greeting;

    function initialize(string memory _greeting) public {
        greeting = _greeting;
    }

    function greet() public view returns (string memory) {
        return greeting;
    }

    function setGreeting(string memory _greeting) public {
        greeting = _greeting;
    }

    function resetGreeting() public {
        greeting = "Hello World";
    }

}

import "./utils/Proxiable.sol";
contract GreeterV2Proxiable is GreeterV2, Proxiable {}

import "./utils/Proxiable4x.sol";
contract GreeterV2Proxiable4x is GreeterV2, Proxiable4x {}