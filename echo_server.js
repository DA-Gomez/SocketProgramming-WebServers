"use strict";
//https://nodejs.org/api/net.html
Object.defineProperty(exports, "__esModule", { value: true });
var net = require("net"); //net module has all the networking stuff
function newConn(socket) {
    //this function is for accepting new connections (done automatically on runtime when doing server.on). 
    // New connection must be of type net.Socket
    console.log('new connection', socket.remoteAddress, socket.remotePort);
    // read and write (send and recieve)
    socket.on('data', function (data) {
        console.log('data', data);
        socket.write(data); //echo back the message
        //socket/connection closure
        if (data.includes('x')) { //x as an example
            console.log('closing');
            socket.end(); //sends FIN
        }
    });
    socket.on('end', function () {
        //FIN message recieved, the connection will be closed automatically
        console.log('End of file, EOF');
    });
}
var server = net.createServer(); //creates a listening socket >> type: net.Server
server.on('connection', newConn); // 'connection' is an event
server.listen({ host: '127.0.0.1', port: 1234 });
//'error' event, auto closes the connection
server.on('error', function (err) { throw err; });
//node --enable-source-maps echo_server.js
