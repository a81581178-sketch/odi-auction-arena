const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const rooms = new Map();
const PORT = process.env.PORT || 3000;

function code() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}
function publicRoom(room) {
  return {
    code: room.code, hostId: room.hostId, currentPlayer: room.currentPlayer,
    currentBid: room.currentBid, highestBidder: room.highestBidder,
    secondsLeft: room.secondsLeft, teams: room.teams,
    results: room.results, participants: room.participants.map(p => ({name:p.name, team:p.team}))
  };
}
function emitRoom(room) { io.to(room.code).emit("room:update", publicRoom(room)); }
function stopTimer(room) {
  if (room.timer) clearInterval(room.timer);
  room.timer = null;
}
function startTimer(room) {
  stopTimer(room);
  room.secondsLeft = 20;
  room.timer = setInterval(() => {
    room.secondsLeft--;
    io.to(room.code).emit("timer", room.secondsLeft);
    if (room.secondsLeft <= 0) closeAuction(room);
  }, 1000);
}
function closeAuction(room) {
  stopTimer(room);
  if (!room.currentPlayer) return;
  if (room.highestBidder) {
    const team = room.teams[room.highestBidder];
    team.purse = +(team.purse - room.currentBid).toFixed(2);
    team.players.push({name: room.currentPlayer, price: room.currentBid});
    room.results.unshift({player: room.currentPlayer, status:"SOLD", team:team.name, price:room.currentBid});
  } else {
    room.results.unshift({player: room.currentPlayer, status:"UNSOLD"});
  }
  room.currentPlayer = null;
  room.currentBid = 0;
  room.highestBidder = null;
  room.secondsLeft = 0;
  emitRoom(room);
  io.to(room.code).emit("auction:closed");
}
io.on("connection", socket => {
  socket.on("room:create", ({name, team}, cb) => {
    let roomCode;
    do { roomCode = code(); } while (rooms.has(roomCode));
    const room = {
      code: roomCode, hostId: socket.id, participants: [],
      teams: {}, currentPlayer: null, currentBid: 0, highestBidder: null,
      secondsLeft: 0, timer: null, results: []
    };
    const teamName = String(team || "Team 1").slice(0, 30);
    room.teams[socket.id] = {name:teamName, purse:100, players:[]};
    room.participants.push({id:socket.id, name:String(name || "Host").slice(0,30), team:teamName});
    rooms.set(roomCode, room);
    socket.join(roomCode);
    cb && cb({ok:true, code:roomCode, room:publicRoom(room)});
  });

  socket.on("room:join", ({code:roomCode, name, team}, cb) => {
    const room = rooms.get(String(roomCode || "").toUpperCase());
    if (!room) return cb && cb({ok:false, error:"Room not found."});
    if (room.participants.length >= 8) return cb && cb({ok:false, error:"Room is full (8 participants)."});
    if (room.participants.some(p => p.team.toLowerCase() === String(team || "").toLowerCase()))
      return cb && cb({ok:false, error:"That team is already taken."});
    const teamName = String(team || `Team ${room.participants.length+1}`).slice(0,30);
    room.teams[socket.id] = {name:teamName, purse:100, players:[]};
    room.participants.push({id:socket.id, name:String(name || "Player").slice(0,30), team:teamName});
    socket.join(room.code);
    emitRoom(room);
    cb && cb({ok:true, room:publicRoom(room)});
  });

  socket.on("player:nominate", ({player}, cb) => {
    const room = [...rooms.values()].find(r => r.hostId === socket.id);
    if (!room) return cb && cb({ok:false, error:"Only the host can nominate players."});
    if (room.currentPlayer) return cb && cb({ok:false, error:"Close the current auction first."});
    const playerName = String(player || "").trim().slice(0,60);
    if (!playerName) return cb && cb({ok:false, error:"Enter a player name."});
    room.currentPlayer = playerName;
    room.currentBid = 0;
    room.highestBidder = null;
    startTimer(room);
    emitRoom(room);
    cb && cb({ok:true});
  });

  socket.on("bid:place", cb => {
    const room = [...rooms.values()].find(r => r.participants.some(p => p.id === socket.id));
    if (!room || !room.currentPlayer) return cb && cb({ok:false, error:"No active player."});
    const team = room.teams[socket.id];
    const nextBid = +(room.currentBid + 0.5).toFixed(2);
    if (team.purse < nextBid) return cb && cb({ok:false, error:"Not enough purse."});
    if (room.highestBidder === socket.id) return cb && cb({ok:false, error:"You are already the highest bidder."});
    room.currentBid = nextBid;
    room.highestBidder = socket.id;
    startTimer(room);
    emitRoom(room);
    cb && cb({ok:true});
  });

  socket.on("auction:close", cb => {
    const room = [...rooms.values()].find(r => r.hostId === socket.id);
    if (!room) return cb && cb({ok:false, error:"Only the host can close bidding."});
    if (!room.currentPlayer) return cb && cb({ok:false, error:"No active auction."});
    closeAuction(room);
    cb && cb({ok:true});
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      room.participants = room.participants.filter(p => p.id !== socket.id);
      // Keep team purse/results for the room's lifetime; reconnect support is not implemented.
      if (room.hostId === socket.id) io.to(room.code).emit("host:disconnected");
      emitRoom(room);
    }
  });
});

server.listen(PORT, () => console.log(`ODI Auction Arena running on ${PORT}`));
