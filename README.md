# ODI Auction Arena

A multiplayer ODI cricket auction starter built with Node.js, Express and Socket.IO.

## Features
- Create a room and share its six-character code
- Up to eight participants, one per team
- ₹100 Cr starting purse for each team
- Live bidding in ₹0.5 Cr increments
- 20-second bid timer reset after each bid
- Host can nominate players and close bidding
- Sold/unsold results and team purse tracking

## Run locally
1. Install Node.js 18 or newer.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

## Deploy
Deploy as a Node web service. Build command: `npm install`. Start command: `npm start`.

## Limitations
This is a starter app, not production-ready. Room data is stored in memory and is lost if the server restarts. Add persistent database storage, authentication, reconnect handling, audit logging and stronger validation before relying on it for an important event. The host enters player names manually.
