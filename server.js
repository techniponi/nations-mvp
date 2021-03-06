var serverPort = 6969;
var tickRate = 30; // ticks per second

// init dependencies
var fs = require('fs');
var request = require('request');
var gulp = require('gulp');
var app = require('express')();
var server = app.listen(serverPort);
var socket = require('socket.io');
var io = socket.listen(server);

var serverVersion = require('./package.json').version; // read version from package.json

// Start server
server.listen(serverPort);
console.log("Server version " + serverVersion + " running on port " + serverPort);

// init global variables
var chatQueue = []; // Unlikely to contain more than a few messages, rendering handled clientside
var players = []; // It is normal for this to have undefined values, please account for this!
var mapSize = [1280, 720]; // allowed movement range of the game world

// init world
// TODO: file i/o for world
var temporaryShitTile = {type: "grass", collides: false};
var temporaryShitTile2 = {type: "stone", collides: true};
var temporaryShitChunk = [
    [temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile],
    [temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile],
    [temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile],
    [temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile2,temporaryShitTile2,temporaryShitTile,temporaryShitTile,temporaryShitTile],
    [temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile2,temporaryShitTile2,temporaryShitTile,temporaryShitTile,temporaryShitTile],
    [temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile],
    [temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile],
    [temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile,temporaryShitTile]
];
var world = [
    [temporaryShitChunk,temporaryShitChunk,temporaryShitChunk,temporaryShitChunk],
    [temporaryShitChunk,temporaryShitChunk,temporaryShitChunk,temporaryShitChunk],
    [temporaryShitChunk,temporaryShitChunk,temporaryShitChunk,temporaryShitChunk],
    [temporaryShitChunk,temporaryShitChunk,temporaryShitChunk,temporaryShitChunk]
];

// Useful prototypes/helper functions
// -- << -- << -- << -- << -- << -- << -- << -- << -- << -- << -- << -- <<

// Same as .replace(), except covers all occurrences
String.prototype.replaceAll = function (search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

// Removes all special characters from the given string.
String.prototype.removeSpecialChars = function () {
    var target = this;
    return target.replace(/[^\w\s]/gi, '');
};

// Add a string to the chat queue
function addToChatQueue(msg){
    chatQueue.push(msg);
}

// send a boop to the given ID from a given sender object
function sendBoop(id, playerObject){
    io.in(id).emit('boop', playerObject);
}

// Send a chat message to a specific player
function sendChatMessageToPlayer(playerObj, msg){
    io.in(playerObj.id.toString()).emit('updateChat', [msg]);
}

// Send any request to this specific player
function sendRequestToPlayer(playerObj, requestString, obj){
    io.in(playerObj.id.toString()).emit(requestString, obj);
}

// -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >>

// HTTP file serving
// -- << -- << -- << -- << -- << -- << -- << -- << -- << -- << -- << -- <<
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

app.get('/favicon.ico', function (req, res) {
    res.sendFile(__dirname + '/favicon.ico');
});

app.get('/oldclient.html', function (req, res) {
    res.sendFile(__dirname + '/oldclient.html');
});

app.get('/client.js', function (req, res) {
    res.sendFile(__dirname + '/client.js');
});

app.get('/client-old.js', function (req, res) {
    res.sendFile(__dirname + '/client-old.js');
});

app.get('/easeljs.js', function (req, res) {
    if(fs.existsSync(__dirname + "/easeljs.js")){ // is there a local version of the script?
        console.log("Local easeljs.js is present, serving...");
        res.sendFile(__dirname + "/easeljs.js");
    } else {
        console.log("Local easeljs.js is not present, piping from CDN...");
        var reply = request("https://code.createjs.com/easeljs-0.8.2.min.js");
        //req.pipe(reply);
        reply.pipe(res);
    }
});

app.get('/dog.png', function (req, res) {
    res.sendFile(__dirname + '/assets/dog.png');
});

app.get('/boop.png', function (req, res) {
    res.sendFile(__dirname + '/assets/boop.png');
});

app.get('/grass.png', function (req, res) {
    res.sendFile(__dirname + '/assets/grass.png');
});

app.get('/stone.png', function (req, res) {
    res.sendFile(__dirname + '/assets/stone.png');
});

// -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >>

// Player has loaded the webpage
io.on('connection', function (socket) {
    // TODO: Prevent rapid-fire requests

    // player-specific local variables
    var thisPlayerObject;
    var thisPlayerId = "";
    var thisPlayerName = "";
    var loggedIn = false;
    socket.join(socket.id);
    //var recentActions = 0; // incrememnted every time an action is performed, reset every second

    // Functions for common tasks
    // -- << -- << -- << -- << -- << -- << -- << -- << -- << -- << -- << -- <<

    // Update all references to a player object with a given player object
    function updatePlayerObject(playerObject){
        for(var pl in players){
            if(players[pl].id == playerObject.id) players[pl] = thisPlayerObject;
            var arrayUpdateSuccess = true; // keep track of whether the player array was successfully updated
        }
        // Alert the console of any potential issues with player updates
        if(!arrayUpdateSuccess){
            console.log("Player " + playerObject.name + "'s (" + playerObject.id + ") array object failed to update! Problems may arise shortly.");
        }
        thisPlayerObject = playerObject;
    }

    // Force a player to update their local player object
    function forceUpdatePlayer(playerObject){
        io.in(socket.id.toString()).emit('forceUpdatePlayer', playerObject);
    }

    // Gets the array ID of a given player object
    function getPlayerArrayID(playerObject){
        for(var pl in players){
            if(players[pl].id == playerObject.id) return pl;
        }
    }

    // Calculates the distance between two [x, y] coordinate arrays.
    // TODO: distance calc
    function calculateDistance(){

    }

    // -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >> -- >>

    // Player has disconnected
    socket.on('disconnect', function () {
        //recentActions++;
        if (loggedIn) {
            // get the array ID of this player
            var thisPlayerArrayID = getPlayerArrayID(thisPlayerObject);

            console.log(thisPlayerObject.name + " disconnected.");
            updatePlayerObject(thisPlayerObject);
            io.emit('playerDisconnect', thisPlayerObject);

            players.splice(thisPlayerArrayID, 1); // remove current player
        }
    });

    // Received attempt to login from client
    // Arg: player object
    socket.on('loginAttempt', function (playerInfo) {
        //recentActions++;
        console.log("Login attempt with name '" + playerInfo.name + "'");
        var fixedName = playerInfo.name.removeSpecialChars(); // remove invalid characters from the name
        if (fixedName != "" && fixedName.length <= 8) {

            // check if name is already taken
            var takenCheck = false;
            for (var pl in players) {
                if (players[pl].name == fixedName) {
                    takenCheck = true;
                }
            }

            if (takenCheck) {
                io.in(socket.id.toString()).emit('loginDenied', "Taken!"); // name was taken
            } else {

                if(playerInfo.version != serverVersion){
                    io.in(socket.id.toString()).emit('loginDenied', "Client outdated!"); // name was taken
                }else {
                    // prepare local variables
                    loggedIn = true;
                    playerInfo.name = fixedName;
                    console.log(socket.id.toString() + ", " + fixedName + " has connected.");
                    addToChatQueue(fixedName + " has joined the server.");
                    playerInfo.id = socket.id;
                    thisPlayerId = socket.id;
                    thisPlayerName = fixedName;
                    players.push(playerInfo);
                    thisPlayerObject = playerInfo;

                    // accept login
                    socket.emit('loginAccepted', playerInfo);
                    //console.log(players);
                    //io.in(socket.id.toString()).emit('updatePlayer', playerInfo);
                }
            }
        } else {
            if(fixedName == ""){
                socket.emit('loginDenied', "Enter a name!");
            }else {
                socket.emit('loginDenied', "Too long!");
        }
    }
});

// Received updated player from client
// Arg: player object
socket.on('updatePlayer', function (playerObject) {
    //recentActions++;
    var movementInvalid = false;
    if (loggedIn) {

        // make sure the player isn't being a little shit
        if(playerObject.id != thisPlayerId || playerObject.name != thisPlayerName){
            playerObject.id = thisPlayerId;
            playerObject.name = thisPlayerName;
            sendChatMessageToPlayer(thisPlayerObject, "Invalid player info detected! Stop trying to hack the game.");
            forceUpdatePlayer(playerObject);
        }

            // check for invalid movement since last update
            if(Math.abs(playerObject.x - thisPlayerObject.x) > 15 || playerObject.x > 1536 - 24 || playerObject.x < 24){
                playerObject.x = thisPlayerObject.x;
                movementInvalid = true;
            }
            if(Math.abs(playerObject.y - thisPlayerObject.y) > 15 || playerObject.y > 1536 - 24 || playerObject.y < 24){
                playerObject.y = thisPlayerObject.y;
                movementInvalid = true;
            }
            if(movementInvalid){
                sendChatMessageToPlayer(thisPlayerObject, "Invalid movement!");
                forceUpdatePlayer(playerObject);
            }
            updatePlayerObject(playerObject);

        }
    });

    // Player submitted a chat message
    // Arg: string
    socket.on('chatMessage', function (msg) {
        //recentActions++;
        if (loggedIn && msg != "") {
            if (msg.replaceAll(" ", "") == "") msg = "I am an immature child begging for attention.";
            var formattedMsg = "<b>" + thisPlayerObject.name + "</b>: " + msg.substr(0, 100).replaceAll("<", "&lt;").replaceAll(">", "&gt;");
            console.log("[CHAT] " + formattedMsg.replaceAll("<b>", "").replaceAll("</b>", ""));
            addToChatQueue(formattedMsg);
        }
    });

    // Player is sending a boop
    // Arg: string
    socket.on('boop', function (id) {
        //recentActions++;
        if (loggedIn) {
            var target = undefined;

            // check if target ID exists
            // TODO: distance comparison
            for (var x in players) {
                if (players[x].id == id) target = players[x];
            }

            if (target) {
                sendBoop(id, thisPlayerObject);
            } else {
                console.log(thisPlayerObject.name + " tried to boop an invalid target.");
            }

        }
    })
});

// server loop
// currently ~30 ticks/sec
setInterval(function () {

    if(chatQueue != []) { // make sure chatlog isn't empty
        io.emit('updateChat', chatQueue);
        chatQueue = [];
    }

    // update world for each player
    for(var pl in players){
        var pos = [players[pl].x, players[pl].y];
        var chunks = []
        for(var x in world){
            for(var y in world[x]){
                if(Math.abs(x * 48 * 8 - (pos[0])) <= 2000 || Math.abs(y * 48 * 8 - (pos[1])) <= 1000){
                    chunks.push({x: x * 48 * 8, y: y * 48 * 8, chunk: world[x][y]});
                }
            }
        }
        sendRequestToPlayer(players[pl], 'updateWorld', [players, chunks]);
    }

}, Math.round(1000 / tickRate));