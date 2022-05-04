#!/usr/bin/env node

const fs = require('fs');

function readJSON (path) {
  return JSON.parse(fs.readFileSync(path));
}

function writeJSON (path, data) {
  fs.writeFileSync(path, data);
}

const buildInfoField = readJSON('artifacts/@openzeppelin/contracts/proxy/Proxy.sol/Proxy.dbg.json').buildInfo;
const jsonRelativePath=`artifacts/@openzeppelin/contracts/proxy/Proxy.sol/${buildInfoField}`
const solcInput = readJSON(jsonRelativePath).input;
writeJSON('artifacts/solc-input.json', JSON.stringify(solcInput));