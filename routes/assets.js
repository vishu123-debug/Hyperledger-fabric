'use strict';

const express = require('express');
const router = express.Router();
const { getContract } = require('../gateway');

/**
 * Helper: convert Fabric result bytes to JSON safely.
 */
function bytesToJson(resultBytes) {
  const raw = Buffer.from(resultBytes).toString('utf8').replace(/\0/g, '').trim();
  return JSON.parse(raw);
}

/**
 * READ (Evaluate)
 * GET /api/assets
 */
router.get('/assets', async (req, res) => {
  let contract, gateway, client;

  try {
    ({ contract, gateway, client } = await getContract());

    const resultBytes = await contract.evaluateTransaction('GetAllAssets');
    const data = bytesToJson(resultBytes);

    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  } finally {
    try { gateway?.close(); } catch {}
    try { client?.close(); } catch {}
  }
});

/**
 * WRITE (Submit)
 * POST /api/assets
 * body: { "id": "asset100", "color": "blue", "size": 5, "owner": "Narendra", "value": 999 }
 */
router.post('/assets', async (req, res) => {
  let contract, gateway, client;

  try {
    const { id, color, size, owner, value } = req.body;

    if (!id || !color || size === undefined || !owner || value === undefined) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    ({ contract, gateway, client } = await getContract());

    await contract.submitTransaction(
      'CreateAsset',
      String(id),
      String(color),
      String(size),
      String(owner),
      String(value)
    );

    res.json({ ok: true, message: 'Asset created', id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  } finally {
    try { gateway?.close(); } catch {}
    try { client?.close(); } catch {}
  }
});

/**
 * READ ONE (Evaluate)
 * GET /api/assets/:id
 */
router.get('/assets/:id', async (req, res) => {
  let contract, gateway, client;

  try {
    const { id } = req.params;
    ({ contract, gateway, client } = await getContract());

    const resultBytes = await contract.evaluateTransaction('ReadAsset', String(id));
    const data = bytesToJson(resultBytes);

    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  } finally {
    try { gateway?.close(); } catch {}
    try { client?.close(); } catch {}
  }
});

/**
 * TRANSFER OWNER (Submit)
 * PUT /api/assets/:id/owner
 * body: { "newOwner": "Alice" }
 */
router.put('/assets/:id/owner', async (req, res) => {
  let contract, gateway, client;

  try {
    const { id } = req.params;
    const { newOwner } = req.body;

    if (!newOwner) {
      return res.status(400).json({ ok: false, error: 'newOwner is required' });
    }

    ({ contract, gateway, client } = await getContract());

    await contract.submitTransaction('TransferAsset', String(id), String(newOwner));

    res.json({ ok: true, message: 'Asset transferred', id, newOwner });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  } finally {
    try { gateway?.close(); } catch {}
    try { client?.close(); } catch {}
  }
});

/**
 * DELETE (Submit)
 * DELETE /api/assets/:id
 */
router.delete('/assets/:id', async (req, res) => {
  let contract, gateway, client;

  try {
    const { id } = req.params;
    ({ contract, gateway, client } = await getContract());

    await contract.submitTransaction('DeleteAsset', String(id));

    res.json({ ok: true, message: 'Asset deleted', id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  } finally {
    try { gateway?.close(); } catch {}
    try { client?.close(); } catch {}
  }
});

module.exports = router;
