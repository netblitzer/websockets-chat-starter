const http = require('http');
const fs = require('fs');
const socketio = require('socket.io');

const port = process.env.PORT || process.env.NODE_PORT || 3000;

const index = fs.readFileSync(`${__dirname}/../client/client.html`);

const onRequest = (request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.write(index);
  response.end();
};

const app = http.createServer(onRequest).listen(port);

console.log(`Listening on localhost:${port}`);

// CURRENT ISSUES
  // Server doesn't care if two users have the same name
      // this means users can 'replace' each other
      // users can also disconnect others with the same name


// pass in the http server into socketio and grab the websocket server
const io = socketio(app);

// object to hold all of our connected users
const users = { };

const randCol = () => {
  const R = Math.round(Math.random() * 255);
  const G = Math.round(Math.random() * 255);
  const B = Math.round(Math.random() * 255);

  return `rgb(${R}, ${G}, ${B})`;
};

const onJoined = (sock) => {
  const socket = sock;

  socket.on('join', (data) => {
    // check if the socket is already attached
    if (users[data.name]) {
      // if there's duplicate, disconnect the old one
      users[data.name].disconnect();
      delete users[data.name];
    }

    // message back to the new user
    const joinMsg = {
      name: 'server',
      msg: `Users online: ${Object.keys(users).length}`,
    };

    socket.name = data.name;
    socket.room = 'main';
    socket.color = randCol();
    socket.emit('msg', joinMsg);

    socket.join('main');

    // announcement to everyone in the room
    const response = {
      name: 'server',
      msg: `${data.name} has joined the room.`,
    };
    socket.broadcast.to('main').emit('msg', response);

    console.log(`${data.name} joined main`);

    // success message back to the new user
    socket.emit('msg', { name: 'server', msg: 'Welcome to: Main Lobby' });

    // console.dir(socket);
    users[socket.name] = socket;
  });
};

const onMsg = (sock) => {
  const socket = sock;

  socket.on('msgToServer', (data) => {
    if (data.msg) {
      const message = data.msg;

      // commands happening
      if (message[0] === '/') {
        // help command
        if (message[1] === 'h') {
          socket.emit('msg', { name: 'server', msg: 'Help functions:\n/h for help\n/j <name> to join a room\n/n <name> to change names\n/c <hex> to change colors\n/w <name> <message> to whisper to a user' });
        } else if (message[1] === 'j') {
          // join room command
          if (message.length > 3) {
            const prevRoom = socket.room;
            const newRoom = message.substr(3);

            console.log(`${socket.name} is joining room: ${newRoom}`);
            socket.leave(prevRoom);
            socket.join(newRoom);
            socket.room = newRoom;

            io.sockets.in(prevRoom).emit('msg', { name: 'server', msg: `${socket.name} has left the room.` });
            if (newRoom === 'main') {
              socket.emit('msg', { name: 'server', msg: 'Welcome to: Main Lobby.' });
            } else {
              socket.emit('msg', { name: 'server', msg: `Welcome to: ${newRoom}.` });
            }
            socket.broadcast.to(newRoom).emit('msg', { name: 'server', msg: `${socket.name} has joined the room.` });
          } else {
            socket.emit('msg', { name: 'server', msg: 'ERROR: No room name given.' });
          }
        } else if (message[1] === 'n') {
          // change name command

          if (message.length > 3) {
            const prevName = socket.name;
            const newName = message.substr(3).replace(/ /g, '_'); // replace all space characters

            console.log(`${socket.name} is cahnging their name to: ${newName}`);
            socket.name = newName;

            // replace the user
            delete users[prevName];
            users[newName] = socket;

            io.sockets.in(socket.room).emit('msg', { name: 'server', msg: `${prevName} has change their name to ${newName}.` });
          } else {
            socket.emit('msg', { name: 'server', msg: 'ERROR: No name given.' });
          }
        } else if (message[1] === 'c') {
          // change color command

          if (message.length > 3 && message.length < 11) {
            let newCol = '';

            const colSec = message.substr(3);

            // find # symbol
            const hash = colSec.indexOf('#');

            if (hash >= 0) {
              // hash symbol
              if (colSec.length === 4) {
                // shorthand hash
                newCol = `#${colSec.substr(1, 3)}`;
              } else if (colSec.length === 7) {
                // longhand hash
                newCol = `#${colSec.substr(1, 6)}`;
              } else {
                // try to get whatever we can out of it
                newCol = `#${colSec.substr(1, 3)}`;
              }
              socket.color = newCol;
            } else {
              // no hash symbol
              if (colSec.length === 3) {
                // shorthand hash
                newCol = `#${colSec.substr(0, 3)}`;
              } else if (colSec.length === 6) {
                // longhand hash
                newCol = `#${colSec.substr(0, 6)}`;
              } else {
                // try to get whatever we can out of it
                newCol = `#${colSec.substr(0, 3)}`;
              }
              socket.color = newCol;
            }
          } else {
            socket.emit('msg', { name: 'server', msg: 'ERROR: Invalid color.' });
          }
        }
      } else {
        io.sockets.in(socket.room).emit('msg', { name: socket.name, msg: data.msg, color: socket.color });
      }
    }
  });
};

const onDisconnect = (sock) => {
  const socket = sock;

  socket.on('disconnect', () => {
    // try to tell them they disconnected
    try {
      socket.emit('msg', { name: 'server', msg: 'You have been disconnected.' });
    } catch (e) {
      // we don't care about any errors
    }

    socket.disconnect();
    console.log(`${socket.name} disconnected`);
  });
};

io.sockets.on('connection', (socket) => {
  console.log('Connection started');

  onJoined(socket);
  onMsg(socket);
  onDisconnect(socket);
});

console.log('Websocket server started.');
