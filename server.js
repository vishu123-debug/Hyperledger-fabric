'use strict';
console.log("SERVER __dirname =", __dirname);
console.log("STATIC PATH =", require("path").join(__dirname, "public"));


const express = require('express');
const path = require('path');

const tendersRouter = require('./routes/tenders'); // adjust if your folder name differs

const app = express();
app.use(express.json());

// ✅ Serve static files FIRST (so /styles.css and /app.js are real files)
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', tendersRouter);

// Home route (serve index.html explicitly)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fallback for unknown routes (optional)
app.use((req, res) => {
  res.status(404).send('Not found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
