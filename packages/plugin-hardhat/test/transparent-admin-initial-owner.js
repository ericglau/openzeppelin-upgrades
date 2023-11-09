const test = require('ava');

const { ethers, upgrades } = require('hardhat');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
});

test('initial owner using default signer', async t => {
  const { Greeter } = t.context;

  const proxy = await upgrades.deployProxy(Greeter, ['hello']);
  const admin = await upgrades.erc1967.getAdminAddress(await proxy.getAddress());
  const adminWithAbi = new ethers.Contract(admin, ['function owner() view returns (address)'], ethers.provider);
  const adminOwner = await adminWithAbi.owner();

  const defaultSigner = (await ethers.getSigners())[0];

  t.is(adminOwner, defaultSigner.address);
});

test('initial owner using custom signer', async t => {
  const customSigner = (await ethers.getSigners())[1];

  const Greeter = await ethers.getContractFactory('Greeter', customSigner);

  const proxy = await upgrades.deployProxy(Greeter, ['hello']);
  const admin = await upgrades.erc1967.getAdminAddress(await proxy.getAddress());
  const adminWithAbi = new ethers.Contract(admin, ['function owner() view returns (address)'], ethers.provider);
  const adminOwner = await adminWithAbi.owner();

  t.is(adminOwner, customSigner.address);
});

test('initial owner using initialOwner option', async t => {
  const { Greeter } = t.context;

  const initialOwner = (await ethers.getSigners())[2];

  const proxy = await upgrades.deployProxy(Greeter, ['hello'], { initialOwner: initialOwner.address });
  const admin = await upgrades.erc1967.getAdminAddress(await proxy.getAddress());
  const adminWithAbi = new ethers.Contract(admin, ['function owner() view returns (address)'], ethers.provider);
  const adminOwner = await adminWithAbi.owner();

  t.is(adminOwner, initialOwner.address);
});

test('initial owner - no signer in ContractFactory', async t => {
  const defaultProvider = ethers.getDefaultProvider();

  const Greeter = await ethers.getContractFactory('Greeter', defaultProvider);

  await t.throwsAsync(upgrades.deployProxy(Greeter, ['hello']), {
    message: /Initial owner must be specified/,
  });

  const initialOwner = (await ethers.getSigners())[2];

  const proxy = await upgrades.deployProxy(Greeter, ['hello'], { initialOwner: initialOwner.address });
  const admin = await upgrades.erc1967.getAdminAddress(await proxy.getAddress());
  const adminWithAbi = new ethers.Contract(admin, ['function owner() view returns (address)'], ethers.provider);
  const adminOwner = await adminWithAbi.owner();

  t.is(adminOwner, initialOwner.address);
});