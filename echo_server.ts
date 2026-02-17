//https://nodejs.org/api/net.html

import * as net from "net"; //net module has all the networking stuff

function newConn(socket: net.Socket): void { //callback fn
  //this function is for accepting new connections (done automatically on runtime when doing server.on). 
  // New connection must be of type net.Socket
  console.log('new connection', socket.remoteAddress, socket.remotePort);
  
  // read and write (send and recieve)
  socket.on('data', (data: Buffer) => {
    console.log('data', data);
    socket.write(data); //echo back the message

    //socket/connection closure
    if (data.includes('x')) { //x as an example
      console.log('closing');
      socket.end(); //sends FIN
    }
  })
  socket.on('end', () => { //'end' event
    //FIN message recieved, the connection will be closed automatically
    console.log('End of file, EOF')
  })

}

let server = net.createServer(); //creates a listening socket >> type: net.Server
server.on('connection', newConn); // 'connection' is an event
server.listen({host: '127.0.0.1', port: 1234});

//'error' event, auto closes the connection
server.on('error', (err: Error) => {throw err});

//sockets in nodejs dont support half-open connections (where one socket it closed)
//you can allow it to happen by adding allotHalfOpen: true to the server creation.
//when active, you need to close the connection, socket.end() no longer closes the connection, it only
// sends EOF. Use socket.destroy();



//npx tsc echo_server.ts
//node --enable-source-maps echo_server.js