#!/usr/bin/env node
// Optional local / self-hosted WebSocket room relay for Bottle Game.
// Use when you don't want the public MQTT broker:
//   node relay/server.mjs
//   then open the game with ?relay=ws://localhost:8787
//
// Protocol: JSON text frames. Server stamps nothing — it just fans out to
// everyone else in the same room (msg.room).

import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const PORT = Number(process.env.PORT || 8787);
const rooms = new Map(); // code -> Set<ws>

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('flipgame relay ok\n');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.room = null;
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    const room = String(msg.room || '').toUpperCase();
    if (!room) return;
    if (ws.room !== room) {
      if (ws.room && rooms.has(ws.room)) rooms.get(ws.room).delete(ws);
      ws.room = room;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
    }
    const peers = rooms.get(room);
    if (!peers) return;
    const raw = JSON.stringify(msg);
    for (const peer of peers) {
      if (peer !== ws && peer.readyState === 1) peer.send(raw);
    }
  });
  ws.on('close', () => {
    if (ws.room && rooms.has(ws.room)) {
      rooms.get(ws.room).delete(ws);
      if (rooms.get(ws.room).size === 0) rooms.delete(ws.room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`flipgame relay on ws://localhost:${PORT}`);
});
