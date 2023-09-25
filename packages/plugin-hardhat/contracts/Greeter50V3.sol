pragma solidity ^0.5.1;

contract Greeter50V3 {

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

    function version() public pure returns (string memory) {
        return "V3";
    }

}

import "./utils/Proxiable50.sol";
contract Greeter50V3Proxiable is Greeter50V3, Proxiable50 {}
