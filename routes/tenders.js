'use strict';

const express = require('express');
const router = express.Router();
const { getContract } = require('../gateway');

function bytesToJson(resultBytes) {
  const raw = Buffer.from(resultBytes).toString('utf8').replace(/\0/g, '').trim();
  return JSON.parse(raw);
}

function getMode(req) {
  const m = String(req.query.mode || 'authority').toLowerCase();
  return (m === 'auditor') ? 'auditor' : 'authority';
}

/**
 * Extract a human-readable cause from Fabric Gateway errors.
 * This is what makes "Access denied: requires Org1MSP" visible to evaluators.
 */
function extractGatewayError(err) {
  if (!err) return 'Operation failed';

  const texts = [];

  function walk(x) {
    if (!x) return;

    if (typeof x === 'string') {
      texts.push(x);
      return;
    }

    if (Array.isArray(x)) {
      x.forEach(walk);
      return;
    }

    if (typeof x === 'object') {
      if (typeof x.message === 'string') texts.push(x.message);
      if (typeof x.details === 'string') texts.push(x.details);
      if (typeof x.cause === 'string') texts.push(x.cause);

      for (const k of Object.keys(x)) {
        if (k !== 'metadata') walk(x[k]);
      }
    }
  }

  walk(err);

  const combined = texts.join(' | ');

  // ✅ Our specific RBAC case
  if (combined.includes('Access denied') && combined.includes('Org1MSP')) {
    return 'Access denied: Auditor role is read-only and cannot perform this action.';
  }

  // Fallback: return the first meaningful message
  const first = texts.find(t => t && t.trim());
  return first ? first.replace(/^Error:\s*/i, '') : 'Operation failed';
}


async function withContract(req, res, fn) {
  let contract, gateway, client;
  const mode = getMode(req);

  try {
    ({ contract, gateway, client } = await getContract(mode));
    await fn({ contract, mode });
  } catch (err) {
  res.status(403).json({
    ok: false,
    error: extractGatewayError(err),
  });
  } finally {
    try { gateway?.close(); } catch {}
    try { client?.close(); } catch {}
  }
}

/**
 * GET /api/info?mode=authority|auditor
 */
router.get('/info', async (req, res) => {
  const mode = getMode(req);

  res.json({
    ok: true,
    data: {
      mode,
      authorityMode: mode === 'auditor'
        ? 'Org2MSP (Auditor / Read-only)'
        : 'Org1MSP (Procuring Authority)',
      note: 'Chaincode enforces: Org1 can write; Org2 can read/audit only.',
    },
  });
});

/**
 * GET /api/tenders?mode=...
 */
router.get('/tenders', async (req, res) => {
  await withContract(req, res, async ({ contract }) => {
    const rb = await contract.evaluateTransaction('GetAllTenders');
    res.json({ ok: true, data: bytesToJson(rb) });
  });
});

/**
 * POST /api/tenders?mode=...
 */
router.post('/tenders', async (req, res) => {
  await withContract(req, res, async ({ contract }) => {
    const { tenderId, title, department, estimatedValue } = req.body;
    if (!tenderId || !title || !department || estimatedValue === undefined) {
      return res.status(400).json({ ok: false, error: 'Missing fields: tenderId, title, department, estimatedValue' });
    }

    const rb = await contract.submitTransaction(
      'CreateTender',
      String(tenderId),
      String(title),
      String(department),
      String(estimatedValue)
    );

    res.json({ ok: true, data: bytesToJson(rb) });
  });
});

/**
 * GET /api/tenders/:id?mode=...
 */
router.get('/tenders/:id', async (req, res) => {
  await withContract(req, res, async ({ contract }) => {
    const rb = await contract.evaluateTransaction('ReadTender', String(req.params.id));
    res.json({ ok: true, data: bytesToJson(rb) });
  });
});

/**
 * POST /api/tenders/:id/publish?mode=...
 */
router.post('/tenders/:id/publish', async (req, res) => {
  await withContract(req, res, async ({ contract }) => {
    const rb = await contract.submitTransaction('PublishTender', String(req.params.id));
    res.json({ ok: true, data: bytesToJson(rb) });
  });
});

/**
 * POST /api/tenders/:id/award?mode=...
 */
router.post('/tenders/:id/award', async (req, res) => {
  await withContract(req, res, async ({ contract }) => {
    const { awardedToOrg, remarks } = req.body;
    if (!awardedToOrg) return res.status(400).json({ ok: false, error: 'awardedToOrg is required' });

    const rb = await contract.submitTransaction(
      'AwardTender',
      String(req.params.id),
      String(awardedToOrg),
      remarks ? String(remarks) : ''
    );

    res.json({ ok: true, data: bytesToJson(rb) });
  });
});

/**
 * POST /api/tenders/:id/cancel?mode=...
 */
router.post('/tenders/:id/cancel', async (req, res) => {
  await withContract(req, res, async ({ contract }) => {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ ok: false, error: 'reason is required' });

    const rb = await contract.submitTransaction('CancelTender', String(req.params.id), String(reason));
    res.json({ ok: true, data: bytesToJson(rb) });
  });
});

/**
 * GET /api/tenders/:id/audit?mode=...
 */
router.get('/tenders/:id/audit', async (req, res) => {
  await withContract(req, res, async ({ contract }) => {
    const rb = await contract.evaluateTransaction('GetTenderAuditTrail', String(req.params.id));
    res.json({ ok: true, data: bytesToJson(rb) });
  });
});

module.exports = router;
