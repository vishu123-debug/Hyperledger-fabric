'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');

/* ------------------------------------------------------------------ */
/*  Fabric test-network base paths                                     */
/* ------------------------------------------------------------------ */

const FABRIC_BASE = path.resolve(__dirname, '../fabric-samples/test-network');

const ORG1_BASE = path.join(
  FABRIC_BASE,
  'organizations/peerOrganizations/org1.example.com'
);

const ORG2_BASE = path.join(
  FABRIC_BASE,
  'organizations/peerOrganizations/org2.example.com'
);

const CHANNEL_NAME = 'mychannel';
const CHAINCODE_NAME = 'tender';

/* ------------------------------------------------------------------ */
/*  File helpers                                                       */
/* ------------------------------------------------------------------ */

// Read first .pem file (for signcerts)
function readFirstPem(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Fabric directory not found: ${dir}`);
  }

  const files = fs.readdirSync(dir).filter(
    f => !f.startsWith('.') && f.endsWith('.pem')
  );

  if (files.length === 0) {
    throw new Error(`No .pem certificate found in ${dir}`);
  }

  return fs.readFileSync(path.join(dir, files[0]));
}

// Read first non-hidden file (for keystore, usually priv_sk)
function readFirstKeyFile(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Fabric directory not found: ${dir}`);
  }

  const files = fs.readdirSync(dir).filter(
    f => !f.startsWith('.') && fs.statSync(path.join(dir, f)).isFile()
  );

  if (files.length === 0) {
    throw new Error(`No private key found in ${dir}`);
  }

  return fs.readFileSync(path.join(dir, files[0]));
}

/* ------------------------------------------------------------------ */
/*  Identity loader (CORRECT way)                                      */
/* ------------------------------------------------------------------ */

function loadIdentity(mspId, userMspPath) {
  const certDir = path.join(userMspPath, 'signcerts');
  const keyDir = path.join(userMspPath, 'keystore');

  const certPem = readFirstPem(certDir);
  const keyPem = readFirstKeyFile(keyDir);

  // 🔑 Convert raw key bytes → KeyObject (THIS fixes your error)
  const privateKey = crypto.createPrivateKey(keyPem);

  return {
    identity: {
      mspId,
      credentials: certPem,
    },
    signer: signers.newPrivateKeySigner(privateKey),
  };
}

/* ------------------------------------------------------------------ */
/*  gRPC connection                                                    */
/* ------------------------------------------------------------------ */

function newGrpcConnection() {
  const tlsCertPath = path.join(
    ORG1_BASE,
    'peers/peer0.org1.example.com/tls/ca.crt'
  );

  if (!fs.existsSync(tlsCertPath)) {
    throw new Error(`Peer TLS cert not found: ${tlsCertPath}`);
  }

  const tlsRootCert = fs.readFileSync(tlsCertPath);
  const credentials = grpc.credentials.createSsl(tlsRootCert);

  return new grpc.Client(
    'localhost:7051',
    credentials,
    { 'grpc.ssl_target_name_override': 'peer0.org1.example.com' }
  );
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

async function getContract(mode = 'authority') {
  const auditor = String(mode).toLowerCase() === 'auditor';

  const mspId = auditor ? 'Org2MSP' : 'Org1MSP';
  const userMspPath = auditor
    ? path.join(ORG2_BASE, 'users/User1@org2.example.com/msp')
    : path.join(ORG1_BASE, 'users/User1@org1.example.com/msp');

  const client = newGrpcConnection();
  const { identity, signer } = loadIdentity(mspId, userMspPath);

  const gateway = connect({
    client,
    identity,
    signer,
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
    endorseOptions: () => ({ deadline: Date.now() + 15000 }),
    submitOptions: () => ({ deadline: Date.now() + 15000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
  });

  const network = gateway.getNetwork(CHANNEL_NAME);
  const contract = network.getContract(CHAINCODE_NAME);

  return { contract, gateway, client };
}

module.exports = { getContract };
